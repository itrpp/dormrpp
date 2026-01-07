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
    // ค่าบำรุงรักษา: แต่ละคนจ่ายเต็มจำนวน (ไม่หาร)
    // ค่าน้ำและค่าไฟ: หารด้วยจำนวนผู้เช่าในห้อง (active contracts)
    // ใช้ JOIN กับ billing_cycles และดึงอัตราจาก utility_rates
    const sql = `
      INSERT INTO bills (
        tenant_id,
        room_id,
        contract_id,
        cycle_id,
        maintenance_fee,
        electric_amount,
        water_amount,
        subtotal_amount,
        total_amount,
        status
      )
      SELECT
        c.tenant_id,
        c.room_id,
        c.contract_id,
        bc.cycle_id,
        ? AS maintenance_fee,
        
        -- คำนวณ electric_amount = ((meter_end - meter_start) * rate_per_unit) / จำนวนผู้เช่าในห้อง
        IFNULL(
          (
            (e.meter_end - e.meter_start) * (
              SELECT rate_per_unit 
              FROM utility_rates 
              WHERE utility_type_id = ?
                AND effective_date <= CURDATE()
              ORDER BY effective_date DESC 
              LIMIT 1
            )
          ) / GREATEST(
            (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = c.room_id AND c2.status = 'active'),
            1
          ), 0
        ) AS electric_amount,
        
        -- คำนวณ water_amount = ((meter_end - meter_start) * rate_per_unit) / จำนวนผู้เช่าในห้อง
        IFNULL(
          (
            (w.meter_end - w.meter_start) * (
              SELECT rate_per_unit 
              FROM utility_rates 
              WHERE utility_type_id = ?
                AND effective_date <= CURDATE()
              ORDER BY effective_date DESC 
              LIMIT 1
            )
          ) / GREATEST(
            (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = c.room_id AND c2.status = 'active'),
            1
          ), 0
        ) AS water_amount,
        
        -- subtotal_amount = maintenance_fee + (electric / tenant_count) + (water / tenant_count)
        (
          ? +
          IFNULL(
            (
              (e.meter_end - e.meter_start) * (
                SELECT rate_per_unit 
                FROM utility_rates 
                WHERE utility_type_id = ?
                  AND effective_date <= CURDATE()
                ORDER BY effective_date DESC 
                LIMIT 1
              )
            ) / GREATEST(
              (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = c.room_id AND c2.status = 'active'),
              1
            ), 0
          ) +
          IFNULL(
            (
              (w.meter_end - w.meter_start) * (
                SELECT rate_per_unit 
                FROM utility_rates 
                WHERE utility_type_id = ?
                  AND effective_date <= CURDATE()
                ORDER BY effective_date DESC 
                LIMIT 1
              )
            ) / GREATEST(
              (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = c.room_id AND c2.status = 'active'),
              1
            ), 0
          )
        ) AS subtotal_amount,
        
        -- total_amount = subtotal_amount (ไม่มีส่วนลดตอนนี้)
        (
          ? +
          IFNULL(
            (
              (e.meter_end - e.meter_start) * (
                SELECT rate_per_unit 
                FROM utility_rates 
                WHERE utility_type_id = ?
                  AND effective_date <= CURDATE()
                ORDER BY effective_date DESC 
                LIMIT 1
              )
            ) / GREATEST(
              (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = c.room_id AND c2.status = 'active'),
              1
            ), 0
          ) +
          IFNULL(
            (
              (w.meter_end - w.meter_start) * (
                SELECT rate_per_unit 
                FROM utility_rates 
                WHERE utility_type_id = ?
                  AND effective_date <= CURDATE()
                ORDER BY effective_date DESC 
                LIMIT 1
              )
            ) / GREATEST(
              (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = c.room_id AND c2.status = 'active'),
              1
            ), 0
          )
        ) AS total_amount,
        
        'draft' AS status
      FROM contracts c
      JOIN billing_cycles bc
        ON bc.billing_year = ?
       AND bc.billing_month = ?
      
      -- LEFT JOIN กับ bill_utility_readings สำหรับไฟฟ้า
      LEFT JOIN bill_utility_readings e
        ON e.room_id = c.room_id
       AND e.cycle_id = bc.cycle_id
       AND e.utility_type_id = ?
      
      -- LEFT JOIN กับ bill_utility_readings สำหรับน้ำ
      LEFT JOIN bill_utility_readings w
        ON w.room_id = c.room_id
       AND w.cycle_id = bc.cycle_id
       AND w.utility_type_id = ?
      
      WHERE c.status = 'active'
      
      -- ป้องกันออกบิลซ้ำ (UNIQUE KEY: tenant_id + cycle_id)
      AND NOT EXISTS (
        SELECT 1 FROM bills b
        WHERE b.tenant_id = c.tenant_id
          AND b.cycle_id = bc.cycle_id
      );
    `;

    const result = await connection.query(sql, [
      maintenance_fee, // maintenance_fee
      electricityTypeId, // electric subquery utility_type_id
      waterTypeId, // water subquery utility_type_id
      maintenance_fee, // subtotal maintenance_fee
      electricityTypeId, // subtotal electric utility_type_id
      waterTypeId, // subtotal water utility_type_id
      maintenance_fee, // total maintenance_fee
      electricityTypeId, // total electric utility_type_id
      waterTypeId, // total water utility_type_id
      year, // JOIN billing_cycles billing_year
      month, // JOIN billing_cycles billing_month
      electricityTypeId, // electricity reading utility_type_id
      waterTypeId, // water reading utility_type_id
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

