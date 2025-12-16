// app/api/contracts/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/contracts?room_id=1&status=active
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');
    const status = searchParams.get('status') || 'active';

    let sql = `
      SELECT 
        c.contract_id,
        c.tenant_id,
        c.room_id,
        c.start_date,
        c.end_date,
        c.status,
        t.first_name_th,
        t.last_name_th,
        t.email,
        t.phone,
        r.room_number,
        r.building_id,
        b.name_th AS building_name
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings b ON r.building_id = b.building_id
      WHERE c.status = ?
    `;
    const params: any[] = [status];

    if (roomId) {
      sql += ' AND c.room_id = ?';
      params.push(Number(roomId));
    }

    sql += ' ORDER BY b.building_id, CAST(r.room_number AS UNSIGNED), r.room_number';

    const contracts = await query(sql, params);
    return NextResponse.json(contracts);
  } catch (error: any) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

