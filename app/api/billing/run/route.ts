// app/api/billing/run/route.ts
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { getOrCreateBillingCycle, getUtilityTypeId, getCurrentUtilityRate } from '@/lib/repositories/bills';

export async function POST(req: Request) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { year, month, maintenance_fee = 1000 } = await req.json();

    if (!year || !month) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    // ดึงหรือสร้าง billing cycle
    const cycleId = await getOrCreateBillingCycle(year, month, connection);

    // ดึง utility type IDs (ใช้ code: 'electric', 'water')
    const electricityTypeId = await getUtilityTypeId('electric');
    const waterTypeId = await getUtilityTypeId('water');

    if (!electricityTypeId || !waterTypeId) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'Utility types not found. Please ensure electricity and water types exist.' },
        { status: 500 }
      );
    }

    // ดึงอัตราค่าใช้ปัจจุบัน
    const electricityRate = await getCurrentUtilityRate(electricityTypeId);
    const waterRate = await getCurrentUtilityRate(waterTypeId);

    // SQL สำหรับออกบิลทั้งเดือน
    // หลักการ: 1 tenant = 1 bill
    // หมายเหตุ: ไม่เก็บ amount columns (electric_amount, water_amount, subtotal_amount, total_amount) ในฐานข้อมูล
    // จำนวนเงินทั้งหมดจะคำนวณจาก meter readings ใน API อื่นๆ แทน
    // ค่าบำรุงรักษา: แต่ละคนจ่ายเต็มจำนวน 1000 บาท (ใช้ค่าคงที่ ไม่เก็บในฐานข้อมูล)
    // ค่าน้ำและค่าไฟ: หารด้วยจำนวนผู้เช่าในห้อง (active contracts) - คำนวณใน API อื่นๆ
    const sql = `
      INSERT INTO bills (
        tenant_id,
        room_id,
        contract_id,
        cycle_id,
        status
      )
      SELECT
        c.tenant_id,
        c.room_id,
        c.contract_id,
        bc.cycle_id,
        'draft' AS status
      FROM contracts c
      JOIN billing_cycles bc
        ON bc.billing_year = ?
       AND bc.billing_month = ?
      
      WHERE c.status = 'active'
      
      -- ป้องกันออกบิลซ้ำ (UNIQUE KEY: tenant_id + cycle_id)
      AND NOT EXISTS (
        SELECT 1 FROM bills b
        WHERE b.tenant_id = c.tenant_id
          AND b.cycle_id = bc.cycle_id
      );
    `;

    const result = await connection.query(sql, [
      year, // JOIN billing_cycles billing_year
      month, // JOIN billing_cycles billing_month
    ]);

    const affectedRows = (result as any).affectedRows || 0;

    // อัปเดต meter_photos.bill_id สำหรับบิลที่สร้างทั้งหมด
    // ดึงบิลที่สร้างใหม่และผูกกับรูปมิเตอร์
    const [newBills] = await connection.query(
      `SELECT bill_id, room_id, cycle_id 
       FROM bills 
       WHERE cycle_id = ? 
       ORDER BY bill_id DESC 
       LIMIT ?`,
      [cycleId, affectedRows]
    );
    
    const { linkMeterPhotosToBill } = await import('@/lib/repositories/bills');
    for (const bill of newBills as any[]) {
      await linkMeterPhotosToBill(bill.bill_id, bill.room_id, bill.cycle_id, connection);
    }

    await connection.commit();
    connection.release();

    return NextResponse.json({
      message: 'Billing completed successfully',
      bills_created: affectedRows,
      cycle_id: cycleId,
      year,
      month,
    });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Billing error:', error);
    return NextResponse.json(
      { error: error.message || 'Billing failed' },
      { status: 500 }
    );
  }
}

