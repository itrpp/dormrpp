// app/api/contracts/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkRoomAvailability } from '@/lib/repositories/room-occupancy';
import { updateTenantStatusByStartDate } from '@/lib/db-helpers';

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

// POST /api/contracts
// body: { tenant_id, room_id, start_date, status }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenant_id, room_id, start_date, status = 'active' } = body;

    if (!tenant_id || !room_id) {
      return NextResponse.json(
        { error: 'tenant_id และ room_id จำเป็นต้องกรอก' },
        { status: 400 }
      );
    }

    // 1) ตรวจสอบว่า tenant นี้มีสัญญา active อยู่แล้วหรือไม่
    const existingActive = await query(
      `
      SELECT COUNT(*) AS cnt
      FROM contracts
      WHERE tenant_id = ?
        AND status = 'active'
      `,
      [tenant_id]
    );

    if (Array.isArray(existingActive) && existingActive.length > 0 && (existingActive as any)[0].cnt > 0) {
      return NextResponse.json(
        { error: 'ผู้เช่ารายนี้มีสัญญาที่ยังใช้งานอยู่แล้ว กรุณาย้ายออกก่อนสร้างสัญญาใหม่' },
        { status: 400 }
      );
    }

    // 2) ตรวจสอบว่าห้องสามารถเพิ่มผู้เข้าพักได้หรือไม่ (เฉพาะเมื่อ status = 'active')
    if (status === 'active') {
      const availability = await checkRoomAvailability(room_id);
      if (!availability.canAdd) {
        return NextResponse.json(
          { error: availability.message },
          { status: 400 }
        );
      }
    }

    // 3) กำหนด start_date (ถ้าไม่มีให้ใช้วันนี้)
    const finalStartDate = start_date || new Date().toISOString().slice(0, 10);

    // 4) อัปเดต tenant status ตาม start_date
    // - ถ้า start_date > วันนี้ → set status = 'pending'
    // - ถ้า start_date <= วันนี้ → set status = 'active'
    await updateTenantStatusByStartDate(tenant_id, finalStartDate);

    // 5) สร้าง contract
    const result = await query<{ insertId: number }>(
      `
      INSERT INTO contracts (tenant_id, room_id, start_date, status)
      VALUES (?, ?, ?, ?)
      `,
      [tenant_id, room_id, finalStartDate, status]
    );

    const contract_id = (result as any).insertId;

    // ดึงข้อมูล contract ที่สร้างใหม่
    const newContract = await query(
      `
      SELECT 
        c.contract_id,
        c.tenant_id,
        c.room_id,
        c.start_date,
        c.end_date,
        c.status,
        t.first_name_th,
        t.last_name_th,
        r.room_number,
        b.name_th AS building_name
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings b ON r.building_id = b.building_id
      WHERE c.contract_id = ?
      `,
      [contract_id]
    );

    return NextResponse.json(newContract[0], { status: 201 });
  } catch (error: any) {
    console.error('Error creating contract:', error);
    
    // จับ error จาก trigger
    if (error.message?.includes('มีผู้เข้าพักครบจำนวนแล้ว')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create contract' },
      { status: 500 }
    );
  }
}

