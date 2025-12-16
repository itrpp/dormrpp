// app/api/utility-readings/route.ts
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { getUtilityTypeId } from '@/lib/repositories/bills';

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

    const results: any[] = [];

    // บันทึกมิเตอร์ไฟฟ้า (ถ้ามี)
    if (electric && electric.start !== undefined && electric.end !== undefined) {
      // ตรวจสอบว่า meter_end ต้องมากกว่าหรือเท่ากับ meter_start
      if (electric.end < electric.start) {
        await connection.rollback();
        connection.release();
        return NextResponse.json(
          { error: `ค่าสิ้นสุด (${electric.end}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${electric.start}) สำหรับค่าไฟฟ้า` },
          { status: 400 }
        );
      }

      const [result] = await connection.query(
        `INSERT INTO bill_utility_readings 
         (room_id, cycle_id, utility_type_id, meter_start, meter_end)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           meter_start = VALUES(meter_start),
           meter_end = VALUES(meter_end)`,
        [room_id, cycle_id, electricityTypeId, electric.start, electric.end]
      );
      results.push({ utility: 'electric', reading_id: (result as any).insertId || 'updated' });
    }

    // บันทึกมิเตอร์น้ำ (ถ้ามี)
    if (water && water.start !== undefined && water.end !== undefined) {
      // ตรวจสอบว่า meter_end ต้องมากกว่าหรือเท่ากับ meter_start
      if (water.end < water.start) {
        await connection.rollback();
        connection.release();
        return NextResponse.json(
          { error: `ค่าสิ้นสุด (${water.end}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${water.start}) สำหรับค่าน้ำ` },
          { status: 400 }
        );
      }

      const [result] = await connection.query(
        `INSERT INTO bill_utility_readings 
         (room_id, cycle_id, utility_type_id, meter_start, meter_end)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           meter_start = VALUES(meter_start),
           meter_end = VALUES(meter_end)`,
        [room_id, cycle_id, waterTypeId, water.start, water.end]
      );
      results.push({ utility: 'water', reading_id: (result as any).insertId || 'updated' });
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

