// app/api/bills/route.ts
import { NextResponse } from 'next/server';
import { getBillsByMonth, createBill } from '@/lib/repositories/bills';

// GET /api/bills?year=2568&month=10&room_id=1
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const roomId = searchParams.get('room_id');

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    const bills = await getBillsByMonth(
      Number(year),
      Number(month),
      roomId ? Number(roomId) : undefined
    );

    return NextResponse.json(bills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

// POST /api/bills
// ⚠️ หมายเหตุ: ควรใช้ /api/billing/run สำหรับออกบิลทั้งเดือนแทน
// endpoint นี้ยังคงไว้สำหรับกรณีพิเศษที่ต้องสร้างบิลแบบ manual
// body: { contract_id, cycle_id, maintenance_fee, electric_amount, water_amount, status }
export async function POST(req: Request) {
  const { pool } = await import('@/lib/db');
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const body = await req.json();
    const {
      contract_id,
      cycle_id,
      maintenance_fee,
      electric_amount = 0,
      water_amount = 0,
      status,
    } = body;

    if (!contract_id || !cycle_id) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'contract_id and cycle_id are required' },
        { status: 400 }
      );
    }

    // ดึงข้อมูล contract เพื่อหา tenant_id และ room_id
    const { query } = await import('@/lib/db');
    const contract = await query(
      `SELECT tenant_id, room_id FROM contracts WHERE contract_id = ?`,
      [contract_id]
    );

    if (!contract || contract.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const { tenant_id, room_id } = contract[0];

    // ดึงข้อมูล billing cycle เพื่อใช้วันที่ในการดึงอัตรา
    const cycleInfo = await query(
      `SELECT end_date FROM billing_cycles WHERE cycle_id = ?`,
      [cycle_id]
    );
    const cycleDate = cycleInfo && cycleInfo.length > 0 
      ? new Date(cycleInfo[0].end_date) 
      : new Date();

    // ดึง utility readings และคำนวณ amounts
    const { getUtilityTypeId, getCurrentUtilityRate } = await import('@/lib/repositories/bills');
    
    let calculatedElectricAmount = 0;
    let calculatedWaterAmount = 0;

    // ดึง utility readings สำหรับห้องนี้และรอบบิลนี้
    const utilityReadings = await query(
      `SELECT bur.utility_type_id, bur.meter_start, bur.meter_end, ut.code
       FROM bill_utility_readings bur
       JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
       WHERE bur.room_id = ? AND bur.cycle_id = ?`,
      [room_id, cycle_id]
    );

    // นับจำนวนผู้เช่าในห้อง (active contracts)
    const tenantCountResult = await query(
      `SELECT COUNT(*) as count FROM contracts WHERE room_id = ? AND status = 'active'`,
      [room_id]
    );
    const tenantCount = tenantCountResult && tenantCountResult.length > 0 
      ? Math.max(Number(tenantCountResult[0].count) || 1, 1) // อย่างน้อย 1 คน
      : 1;

    // คำนวณ electric_amount จากมิเตอร์ + rate (รองรับ rollover สำหรับมิเตอร์ไฟฟ้า 4 หลัก)
    const electricReading = utilityReadings.find((r: any) => r.code === 'electric');
    if (electricReading) {
      const electricTypeId = await getUtilityTypeId('electric');
      if (electricTypeId) {
        const rate = await getCurrentUtilityRate(electricTypeId, cycleDate);
        const start = Number(electricReading.meter_start || 0);
        const end = Number(electricReading.meter_end || 0);
        const MOD = 10000; // มิเตอร์ไฟฟ้า 4 หลัก
        const usage = end >= start ? end - start : (MOD - start) + end;
        // หารด้วยจำนวนผู้เช่าในห้อง
        calculatedElectricAmount = (usage * rate) / tenantCount;
      }
    }

    // คำนวณ water_amount จากมิเตอร์ + rate (ไม่ต้อง rollover)
    const waterReading = utilityReadings.find((r: any) => r.code === 'water');
    if (waterReading) {
      const waterTypeId = await getUtilityTypeId('water');
      if (waterTypeId) {
        const rate = await getCurrentUtilityRate(waterTypeId, cycleDate);
        const usage =
          Number(waterReading.meter_end || 0) - Number(waterReading.meter_start || 0);
        // หารด้วยจำนวนผู้เช่าในห้อง
        calculatedWaterAmount = (usage * rate) / tenantCount;
      }
    }

    // ใช้ค่าที่คำนวณได้ หรือค่าที่ส่งมา (ถ้ามี)
    // ถ้ามีค่าส่งมาแล้วก็ต้องหารด้วยจำนวนผู้เช่าด้วย
    const finalElectricAmount = electric_amount !== undefined && electric_amount !== 0 
      ? Number(electric_amount) / tenantCount
      : calculatedElectricAmount;
    const finalWaterAmount = water_amount !== undefined && water_amount !== 0
      ? Number(water_amount) / tenantCount
      : calculatedWaterAmount;

    // คำนวณ subtotal และ total
    const subtotalAmount = Number(maintenance_fee || 0) + finalElectricAmount + finalWaterAmount;
    const totalAmount = subtotalAmount;

    // สร้างบิล
    const billId = await createBill({
      tenant_id: Number(tenant_id),
      room_id: Number(room_id),
      contract_id: Number(contract_id),
      cycle_id: Number(cycle_id),
      maintenance_fee: Number(maintenance_fee || 0),
      electric_amount: finalElectricAmount,
      water_amount: finalWaterAmount,
      subtotal_amount: subtotalAmount,
      total_amount: totalAmount,
      status: status || 'draft',
    }, connection);

    await connection.commit();
    connection.release();

    return NextResponse.json({ message: 'Bill created', bill_id: billId }, { status: 201 });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error creating bill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create bill' },
      { status: 500 }
    );
  }
}

