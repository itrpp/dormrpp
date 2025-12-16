// app/api/bills/detailed/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/bills/detailed?year=2568&month=10
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    // ดึงข้อมูลบิลพร้อมผู้เช่าในห้อง
    // ใช้โครงสร้างใหม่: bills -> billing_cycles -> contracts -> tenants
    const sql = `
      SELECT 
        b.bill_id,
        b.tenant_id,
        b.room_id,
        b.contract_id,
        b.cycle_id,
        b.maintenance_fee,
        b.electric_amount,
        b.water_amount,
        b.subtotal_amount,
        b.total_amount,
        b.status,
        cy.billing_year,
        cy.billing_month,
        cy.start_date AS billing_date,
        cy.end_date,
        cy.due_date,
        r.room_number,
        r.floor_no,
        bu.building_id,
        bu.name_th AS building_name,
        t.tenant_id,
        t.first_name_th AS first_name,
        t.last_name_th AS last_name,
        t.email,
        t.phone,
        c.contract_id,
        c.start_date AS move_in_date,
        c.end_date AS move_out_date,
        c.status AS contract_status
      FROM bills b
      JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
      JOIN contracts c ON b.contract_id = c.contract_id
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings bu ON r.building_id = bu.building_id
      WHERE cy.billing_year = ? AND cy.billing_month = ?
      ORDER BY r.room_number, t.tenant_id
    `;

    let bills: any[] = [];
    try {
      bills = await query<any>(sql, [Number(year), Number(month)]);
    } catch (error: any) {
      console.error('Error fetching bills:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch bills' },
        { status: 500 }
      );
    }

    // ดึงข้อมูล utility readings จาก bill_utility_readings (ตาม room_id และ cycle_id)
    const cycleIds = [...new Set(bills.map((b: any) => b.cycle_id))];
    const roomIds = [...new Set(bills.map((b: any) => b.room_id))];
    
    let utilityReadings: any[] = [];
    
    if (cycleIds.length > 0 && roomIds.length > 0) {
      try {
        // ดึง utility readings พร้อมอัตราค่าใช้ปัจจุบัน
        // ดึง utility readings พร้อมอัตราค่าใช้ (ใช้วันที่ของ billing cycle)
        utilityReadings = await query(
          `SELECT 
            bur.reading_id,
            bur.room_id,
            bur.cycle_id,
            bur.utility_type_id,
            bur.meter_start,
            bur.meter_end,
            bur.created_at,
            ut.code AS utility_code,
            ut.name_th AS utility_name,
            COALESCE(
              (SELECT rate_per_unit 
               FROM utility_rates 
               WHERE utility_type_id = bur.utility_type_id
                 AND effective_date <= COALESCE(bc.end_date, CURDATE())
               ORDER BY effective_date DESC 
               LIMIT 1),
              0
            ) AS rate_per_unit
           FROM bill_utility_readings bur
           JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
           LEFT JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
           WHERE bur.cycle_id IN (${cycleIds.map(() => '?').join(',')})
             AND bur.room_id IN (${roomIds.map(() => '?').join(',')})
           ORDER BY bur.room_id, bur.utility_type_id`,
          [...cycleIds, ...roomIds]
        );
      } catch (error: any) {
        console.warn('Cannot fetch utility readings:', error.message);
        utilityReadings = [];
      }
    }

    // จัดกลุ่มข้อมูลตามห้องและผู้เช่า
    const groupedBills: Record<string, any> = {};

    console.log(`[Bills Detailed] Processing ${bills.length} bill records`);

    bills.forEach((bill: any) => {
      // ตรวจสอบว่ามี bill_id และ tenant_id
      if (!bill.bill_id || !bill.tenant_id) {
        console.warn('Invalid bill record (missing bill_id or tenant_id):', bill);
        return;
      }

      // ใช้ tenant_id + cycle_id เป็น key (1 tenant = 1 bill per cycle)
      const billKey = `${bill.tenant_id}_${bill.cycle_id}`;
      
      if (!groupedBills[billKey]) {
        // ดึง utility readings สำหรับห้องนี้
        const roomReadings = utilityReadings.filter(
          (ur: any) => ur.room_id === bill.room_id && ur.cycle_id === bill.cycle_id
        );

        // คำนวณจำนวนเงินใหม่จาก utility readings และ rates
        const electricReading = roomReadings.find((ur: any) => ur.utility_code === 'electric');
        const waterReading = roomReadings.find((ur: any) => ur.utility_code === 'water');
        
        const electricUsage = electricReading ? (electricReading.meter_end - electricReading.meter_start) : 0;
        const electricRate = electricReading ? (electricReading.rate_per_unit || 0) : 0;
        const calculatedElectricAmount = electricUsage * electricRate;
        
        const waterUsage = waterReading ? (waterReading.meter_end - waterReading.meter_start) : 0;
        const waterRate = waterReading ? (waterReading.rate_per_unit || 0) : 0;
        const calculatedWaterAmount = waterUsage * waterRate;
        
        const calculatedSubtotal = (bill.maintenance_fee || 0) + calculatedElectricAmount + calculatedWaterAmount;
        const calculatedTotal = calculatedSubtotal;

        groupedBills[billKey] = {
          bill_id: bill.bill_id,
          tenant_id: bill.tenant_id,
          room_id: bill.room_id,
          contract_id: bill.contract_id,
          cycle_id: bill.cycle_id,
          room_number: bill.room_number || '',
          building_name: bill.building_name || '',
          billing_year: bill.billing_year,
          billing_month: bill.billing_month,
          billing_date: bill.billing_date,
          due_date: bill.due_date,
          maintenance_fee: bill.maintenance_fee || 0,
          // ใช้จำนวนเงินที่คำนวณใหม่จาก utility readings และ rates
          electric_amount: calculatedElectricAmount,
          water_amount: calculatedWaterAmount,
          subtotal_amount: calculatedSubtotal,
          total_amount: calculatedTotal,
          status: bill.status || 'draft',
          tenants: [],
          utility_readings: roomReadings.map((ur: any) => {
            const usage = ur.meter_end - ur.meter_start;
            const rate = ur.rate_per_unit || 0;
            const calculatedAmount = usage * rate;
            return {
              reading_id: ur.reading_id,
              utility_type: ur.utility_code,
              utility_name: ur.utility_name,
              meter_start: ur.meter_start,
              meter_end: ur.meter_end,
              usage: usage,
              rate_per_unit: rate,
              calculated_amount: calculatedAmount,
              created_at: ur.created_at,
            };
          }),
        };
      }

      // เพิ่มผู้เช่า (ควรมีแค่ 1 คนต่อ bill ตามหลักการ 1 tenant = 1 bill)
      if (bill.tenant_id) {
        const existingTenant = groupedBills[billKey].tenants.find(
          (t: any) => t.tenant_id === bill.tenant_id
        );
        if (!existingTenant) {
          groupedBills[billKey].tenants.push({
            tenant_id: bill.tenant_id,
            first_name: bill.first_name || '',
            last_name: bill.last_name || '',
            email: bill.email || null,
            phone: bill.phone || null,
            move_in_date: bill.move_in_date,
            move_out_date: bill.move_out_date,
            contract_status: bill.contract_status,
          });
        }
      }
    });

    console.log(`[Bills Detailed] Grouped into ${Object.keys(groupedBills).length} unique bills`);

    // แปลงเป็น array และจัดเรียงตามเลขห้อง
    const result = Object.values(groupedBills).sort((a: any, b: any) => {
      return a.room_number.localeCompare(b.room_number, 'th', { numeric: true });
    });

    // Log สำหรับ debugging
    console.log(`[Bills Detailed] Found ${result.length} bills for ${year}/${month}`);
    if (result.length > 0) {
      console.log('[Bills Detailed] Sample bill:', JSON.stringify(result[0], null, 2));
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching detailed bills:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch detailed bills' },
      { status: 500 }
    );
  }
}
