// app/api/utility-readings/latest/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url
export const dynamic = 'force-dynamic';

// GET /api/utility-readings/latest?room_id=1&cycle_id=1 (optional)
// หรือ /api/utility-readings/latest?room_ids=1,2,3&cycle_id=1 (batch)
// ดึงเลขมิเตอร์ล่าสุดของห้อง (จากรอบบิลล่าสุด หรือก่อนหน้ารอบบิลที่ระบุ)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');
    const roomIds = searchParams.get('room_ids'); // สำหรับ batch query
    const cycleId = searchParams.get('cycle_id');

    // ตรวจสอบว่ามี room_id หรือ room_ids
    if (!roomId && !roomIds) {
      return NextResponse.json(
        { error: 'room_id or room_ids is required' },
        { status: 400 }
      );
    }

    // แปลง room_ids เป็น array
    const roomIdArray: number[] = roomIds 
      ? roomIds.split(',').map(id => Number(id.trim())).filter(id => !isNaN(id))
      : [Number(roomId)];

    if (roomIdArray.length === 0) {
      return NextResponse.json(
        { error: 'Invalid room_id or room_ids' },
        { status: 400 }
      );
    }

    let sql: string;
    let params: any[];

    if (cycleId) {
      // ดึงข้อมูล billing_year และ billing_month ของรอบบิลปัจจุบันก่อน
      const [currentCycle] = await query<any>(
        'SELECT billing_year, billing_month FROM billing_cycles WHERE cycle_id = ?',
        [Number(cycleId)]
      );

      if (!currentCycle) {
        // ถ้าไม่พบรอบบิลปัจจุบัน ให้ return empty
        const emptyResult: { [roomId: number]: { electric: number | null; water: number | null } } = {};
        roomIdArray.forEach(id => {
          emptyResult[id] = { electric: null, water: null };
        });
        return NextResponse.json(roomId && !roomIds ? emptyResult[Number(roomId)] || { electric: null, water: null } : emptyResult);
      }

      // ดึงข้อมูลจากรอบบิลก่อนหน้ารอบบิลที่ระบุ (สำหรับหลายห้อง)
      // ใช้ billing_year และ billing_month เพื่อหาว่ารอบบิลไหนเป็นรอบก่อนหน้า
      // เปรียบเทียบ: (billing_year < current_year) OR (billing_year = current_year AND billing_month < current_month)
      const placeholders = roomIdArray.map(() => '?').join(',');
      sql = `
        SELECT 
          bur.room_id,
          bur.utility_type_id,
          bur.meter_end,
          ut.code AS utility_code,
          bc.billing_year,
          bc.billing_month,
          bc.cycle_id
        FROM bill_utility_readings bur
        JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
        JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
        WHERE bur.room_id IN (${placeholders})
          AND bur.meter_end IS NOT NULL
          AND (
            bc.billing_year < ?
            OR (bc.billing_year = ? AND bc.billing_month < ?)
          )
        ORDER BY bur.room_id, bc.billing_year DESC, bc.billing_month DESC, bur.utility_type_id
      `;
      params = [...roomIdArray, currentCycle.billing_year, currentCycle.billing_year, currentCycle.billing_month];
    } else {
      // ดึงข้อมูลล่าสุดทั้งหมด (fallback)
      const placeholders = roomIdArray.map(() => '?').join(',');
      sql = `
        SELECT 
          bur.room_id,
          bur.utility_type_id,
          bur.meter_end,
          ut.code AS utility_code,
          bc.billing_year,
          bc.billing_month,
          bc.cycle_id
        FROM bill_utility_readings bur
        JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
        JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
        WHERE bur.room_id IN (${placeholders})
          AND bur.meter_end IS NOT NULL
        ORDER BY bur.room_id, bc.billing_year DESC, bc.billing_month DESC, bur.utility_type_id
      `;
      params = [...roomIdArray];
    }

    const readings = await query(sql, params);

    // จัดกลุ่มตาม room_id และ utility_type_id และเลือกล่าสุด (ก่อนหน้ารอบบิลที่ระบุ)
    const result: { [roomId: number]: { electric: number | null; water: number | null } } = {};

    // Initialize result สำหรับทุก room_id
    roomIdArray.forEach(id => {
      result[id] = { electric: null, water: null };
    });

    // จัดกลุ่มตาม room_id และ utility_type_id
    const seen = new Map<string, boolean>(); // key: "roomId-utilityTypeId"
    readings.forEach((r: any) => {
      const key = `${r.room_id}-${r.utility_type_id}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        if (r.utility_code === 'electric' || r.utility_code === 'water') {
          if (result[r.room_id]) {
            // ใช้ type assertion เพื่อให้ TypeScript รู้ว่า utility_code เป็น key ที่ถูกต้อง
            const utilityCode = r.utility_code as 'electric' | 'water';
            result[r.room_id][utilityCode] = r.meter_end ?? null;
          }
        }
      }
    });

    // ถ้ามี room_id เดียว ให้ return แบบเดิม (backward compatible)
    if (roomId && !roomIds) {
      return NextResponse.json(result[Number(roomId)] || { electric: null, water: null });
    }

    // ถ้ามีหลาย room_ids ให้ return ทั้งหมด
    return NextResponse.json(result);
  } catch (error: any) {
    // Silent fallback - ไม่ log เพื่อลด log noise
    return NextResponse.json(
      { error: 'Failed to fetch latest readings' },
      { status: 500 }
    );
  }
}

