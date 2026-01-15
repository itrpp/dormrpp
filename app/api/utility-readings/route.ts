// app/api/utility-readings/route.ts
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { getUtilityTypeId, getCurrentUtilityRate } from '@/lib/repositories/bills';

// POST /api/utility-readings
// บันทึกเลขมิเตอร์สำหรับห้องและรอบบิล
export async function POST(req: Request) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const body = await req.json();
    const { cycle_id, room_id, electric, water } = body;

    if (!cycle_id || !room_id) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'cycle_id and room_id are required' },
        { status: 400 }
      );
    }

    // ดึง utility type IDs
    const electricityTypeId = await getUtilityTypeId('electric');
    const waterTypeId = await getUtilityTypeId('water');

    if (!electricityTypeId || !waterTypeId) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'Utility types not found. Please ensure electric and water types exist.' },
        { status: 500 }
      );
    }

    // ดึงอัตราค่าใช้ปัจจุบันตาม utility type (ใช้ effective_date <= วันนี้)
    const [electricRate, waterRate] = await Promise.all([
      getCurrentUtilityRate(electricityTypeId),
      getCurrentUtilityRate(waterTypeId),
    ]);

    const results: any[] = [];

    // บันทึกมิเตอร์ไฟฟ้า (ถ้ามี)
    if (electric && electric.start !== undefined && electric.end !== undefined) {
      const meterStart = Number(electric.start);
      const meterEnd = Number(electric.end);

      // 4 หลัก → MOD = 10000
      const MOD = 10000;
      let units = 0;
      let isRollover = 0;

      if (meterEnd >= meterStart) {
        units = meterEnd - meterStart;
      } else {
        // กรณี rollover เช่น 9217 → 0005
        isRollover = 1;
        units = (MOD - meterStart) + meterEnd;
      }

      const rate = electricRate;
      const amount = units * rate;

      const [result] = await connection.query(
        `INSERT INTO bill_utility_readings 
         (room_id, cycle_id, utility_type_id, meter_start, meter_end, units, rate, amount, is_rollover)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           meter_start = VALUES(meter_start),
           meter_end = VALUES(meter_end),
           units = VALUES(units),
           rate = VALUES(rate),
           amount = VALUES(amount),
           is_rollover = VALUES(is_rollover)`,
        [room_id, cycle_id, electricityTypeId, meterStart, meterEnd, units, rate, amount, isRollover]
      );
      results.push({ utility: 'electric', reading_id: (result as any).insertId || 'updated', units, rate, amount, is_rollover: isRollover });
    }

    // บันทึกมิเตอร์น้ำ (ถ้ามี)
    if (water && water.start !== undefined && water.end !== undefined) {
      const meterStart = Number(water.start);
      const meterEnd = Number(water.end);

      // ตรวจสอบว่า meter_end ต้องมากกว่าหรือเท่ากับ meter_start สำหรับค่าน้ำ (ยังไม่รองรับ rollover)
      if (meterEnd < meterStart) {
        await connection.rollback();
        connection.release();
        return NextResponse.json(
          { error: `ค่าสิ้นสุด (${meterEnd}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${meterStart}) สำหรับค่าน้ำ` },
          { status: 400 }
        );
      }

      const units = meterEnd - meterStart;
      const rate = waterRate;
      const amount = units * rate;

      const [result] = await connection.query(
        `INSERT INTO bill_utility_readings 
         (room_id, cycle_id, utility_type_id, meter_start, meter_end, units, rate, amount, is_rollover)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           meter_start = VALUES(meter_start),
           meter_end = VALUES(meter_end),
           units = VALUES(units),
           rate = VALUES(rate),
           amount = VALUES(amount),
           is_rollover = VALUES(is_rollover)`,
        [room_id, cycle_id, waterTypeId, meterStart, meterEnd, units, rate, amount]
      );
      results.push({ utility: 'water', reading_id: (result as any).insertId || 'updated', units, rate, amount, is_rollover: 0 });
    }

    await connection.commit();
    connection.release();

    return NextResponse.json({
      message: 'Utility readings saved successfully',
      readings: results,
    }, { status: 201 });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error saving utility readings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save utility readings' },
      { status: 500 }
    );
  }
}

// GET /api/utility-readings?cycle_id=1&room_id=1
// ดึงข้อมูลเลขมิเตอร์
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cycleId = searchParams.get('cycle_id');
    const roomId = searchParams.get('room_id');

    let sql = `
      SELECT 
        bur.reading_id,
        bur.room_id,
        bur.cycle_id,
        bur.utility_type_id,
        bur.meter_start,
        bur.meter_end,
        bur.created_at,
        ut.code AS utility_code,
        ut.name_th AS utility_name,
        r.room_number,
        b.name_th AS building_name
      FROM bill_utility_readings bur
      JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
      JOIN rooms r ON bur.room_id = r.room_id
      JOIN buildings b ON r.building_id = b.building_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (cycleId) {
      sql += ' AND bur.cycle_id = ?';
      params.push(Number(cycleId));
    }

    if (roomId) {
      sql += ' AND bur.room_id = ?';
      params.push(Number(roomId));
    }

    sql += ' ORDER BY r.room_number, ut.code';

    const readings = await query(sql, params);
    return NextResponse.json(readings);
  } catch (error: any) {
    console.error('Error fetching utility readings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch utility readings' },
      { status: 500 }
    );
  }
}

