// app/api/utility-readings/latest/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url
export const dynamic = 'force-dynamic';

// GET /api/utility-readings/latest?room_id=1
// ดึงเลขมิเตอร์ล่าสุดของห้อง (จากรอบบิลล่าสุด)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');

    if (!roomId) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      );
    }

    // ดึงเลขมิเตอร์ล่าสุดของแต่ละ utility type
    const sql = `
      SELECT 
        bur.utility_type_id,
        bur.meter_end,
        ut.code AS utility_code,
        bc.billing_year,
        bc.billing_month
      FROM bill_utility_readings bur
      JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
      JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
      WHERE bur.room_id = ?
        AND bur.meter_end IS NOT NULL
      ORDER BY bc.billing_year DESC, bc.billing_month DESC, bur.utility_type_id
    `;

    const readings = await query(sql, [Number(roomId)]);

    // จัดกลุ่มตาม utility_type_id และเลือกล่าสุด
    const latest: { [key: string]: number | null } = {
      electric: null,
      water: null,
    };

    const seen = new Set<number>();
    readings.forEach((r: any) => {
      if (!seen.has(r.utility_type_id)) {
        seen.add(r.utility_type_id);
        if (r.utility_code === 'electric' || r.utility_code === 'water') {
          latest[r.utility_code] = r.meter_end;
        }
      }
    });

    return NextResponse.json(latest);
  } catch (error: any) {
    console.error('Error fetching latest readings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest readings' },
      { status: 500 }
    );
  }
}

