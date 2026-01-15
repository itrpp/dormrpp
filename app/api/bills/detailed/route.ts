// app/api/bills/detailed/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url
export const dynamic = 'force-dynamic';

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

        // นับจำนวนผู้เช่าในห้อง (active contracts)
        // ใช้ subquery เพื่อนับจำนวนผู้เช่าในห้องเดียวกัน
        // เนื่องจาก bills มีหลายแถวสำหรับห้องเดียวกัน เราจะนับจาก bills ที่มี room_id เดียวกัน
        const roomBills = bills.filter((b: any) => b.room_id === bill.room_id && b.cycle_id === bill.cycle_id);
        const uniqueTenants = new Set(roomBills.map((b: any) => b.tenant_id));
        const tenantCount = uniqueTenants.size || 1;

        // คำนวณ utility_readings พร้อม usage ที่รองรับ rollover
        const calculatedReadings = roomReadings.map((ur: any) => {
          // คำนวณหน่วยใช้ไฟฟ้า (รองรับมิเตอร์ 4 หลัก rollover)
          let usage: number;
          if (ur.utility_code === 'electric') {
            const meterStart = Number(ur.meter_start);
            const meterEnd = Number(ur.meter_end);
            const MOD = 10000; // มิเตอร์ไฟฟ้า 4 หลัก
            if (meterEnd >= meterStart) {
              usage = meterEnd - meterStart;
            } else {
              // กรณี rollover เช่น 9823 → 173
              usage = (MOD - meterStart) + meterEnd;
            }
          } else {
            // ค่าน้ำ: คำนวณแบบปกติ
            usage = ur.meter_end - ur.meter_start;
          }
          const rate = ur.rate_per_unit || 0;
          return {
            reading_id: ur.reading_id,
            utility_type: ur.utility_code,
            utility_name: ur.utility_name,
            meter_start: ur.meter_start,
            meter_end: ur.meter_end,
            usage: usage,
            rate_per_unit: rate,
            created_at: ur.created_at,
          };
        });

        // คำนวณจำนวนเงินจาก usage × rate_per_unit (รองรับ rollover)
        // ไม่ใช้ค่าจากตาราง bills อีกต่อไป (คำนวณใหม่ 100% จากมิเตอร์และ rate)
        const electricReading = calculatedReadings.find((r: any) => r.utility_type === 'electric');
        const waterReading = calculatedReadings.find((r: any) => r.utility_type === 'water');
        
        // คำนวณยอดรวมของห้องก่อน (ยังไม่หาร)
        const totalElectricAmountForRoom =
          electricReading && electricReading.usage != null && electricReading.rate_per_unit != null
            ? Number(electricReading.usage) * Number(electricReading.rate_per_unit)
            : 0;
        
        const totalWaterAmountForRoom =
          waterReading && waterReading.usage != null && waterReading.rate_per_unit != null
            ? Number(waterReading.usage) * Number(waterReading.rate_per_unit)
            : 0;

        // หารด้วยจำนวนผู้เช่าในห้อง (แต่ละคนจ่ายส่วนแบ่งของค่าไฟ/น้ำ)
        // อย่างน้อย 1 คน (ป้องกันการหารด้วย 0)
        const actualTenantCount = Math.max(tenantCount, 1);
        const calculatedElectricAmount = totalElectricAmountForRoom / actualTenantCount;
        const calculatedWaterAmount = totalWaterAmountForRoom / actualTenantCount;

        // ค่าบำรุงรักษา: แต่ละคนจ่ายเต็มจำนวน (ไม่ต้องหาร)
        const maintenanceFee = 1000;
        // ยอดรวมทั้งสิ้นต่อคน = (ค่าไฟต่อคน) + (ค่าน้ำต่อคน) + ค่าบำรุงรักษา
        const calculatedTotalAmount = calculatedElectricAmount + calculatedWaterAmount + maintenanceFee;

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
          maintenance_fee: maintenanceFee,
          // ใช้จำนวนเงินที่คำนวณใหม่จาก usage × rate_per_unit (รองรับ rollover)
          electric_amount: calculatedElectricAmount,
          water_amount: calculatedWaterAmount,
          subtotal_amount: bill.subtotal_amount || 0,
          total_amount: calculatedTotalAmount, // คำนวณใหม่จาก electric_amount + water_amount + maintenance_fee
          status: bill.status || 'draft',
          tenant_count: tenantCount, // เพิ่มจำนวนผู้เช่าในห้อง
          tenants: [],
          utility_readings: calculatedReadings,
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

    // แปลงเป็น array และจัดเรียงตามเลขห้อง
    const result = Object.values(groupedBills).sort((a: any, b: any) => {
      const roomA = String(a.room_number || '').trim();
      const roomB = String(b.room_number || '').trim();
      
      // ถ้า room_number เป็นตัวเลข ให้แปลงเป็นตัวเลขเพื่อเรียงลำดับ
      const numA = /^\d+$/.test(roomA) ? parseInt(roomA, 10) : 999999;
      const numB = /^\d+$/.test(roomB) ? parseInt(roomB, 10) : 999999;
      
      if (numA !== 999999 && numB !== 999999) {
        return numA - numB;
      }
      
      // ถ้าไม่ใช่ตัวเลขทั้งหมด หรือเป็น null/undefined ให้ใช้ localeCompare
      if (!roomA || !roomB) {
        return roomA.localeCompare(roomB);
      }
      
      return roomA.localeCompare(roomB, 'th', { numeric: true });
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching detailed bills:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch detailed bills' },
      { status: 500 }
    );
  }
}
