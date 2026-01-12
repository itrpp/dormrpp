// app/api/rooms/[roomId]/details/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getRoomById } from '@/lib/repositories/rooms';
import { getAllTenants } from '@/lib/repositories/tenants';
import { getRoomOccupancy } from '@/lib/repositories/room-occupancy';

type Params = {
  params: {
    roomId: string;
  };
};

export async function GET(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);

    if (isNaN(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID' },
        { status: 400 }
      );
    }

    // ดึงข้อมูลห้องหลัก
    const room = await getRoomById(roomId);

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // ดึงข้อมูลประเภทห้องจาก room_types (เชื่อมด้วย rooms.room_type_id) รวม max_occupants
    let roomType:
      | { room_type_id: number; name_type?: string | null; max_occupants?: number | null }
      | null = null;
    try {
      // อ่าน room_type_id ของห้องนี้ก่อน
      const roomTypeKeyRows = await query<{ room_type_id: number | null }>(
        'SELECT room_type_id FROM rooms WHERE room_id = ?',
        [roomId]
      );
      const keyValue = roomTypeKeyRows[0]?.room_type_id ?? null;

      if (keyValue != null) {
        // ใช้ id เป็น primary key ของ room_types (ไม่มี name_th และ room_type_id ในตาราง room_types)
        const rows = await query<{
          id: number;
          name_type?: string | null;
          max_occupants?: number | null;
        }>(
          'SELECT id, name_type, max_occupants FROM room_types WHERE id = ? LIMIT 1',
          [keyValue]
        );
        if (rows[0]) {
          roomType = {
            room_type_id: rows[0].id,
            name_type: rows[0].name_type || null,
            max_occupants: rows[0].max_occupants || null,
          };
        }
      }
    } catch (err) {
      console.warn(
        'Cannot fetch room type for room:',
        err instanceof Error ? err.message : err
      );
      roomType = null;
    }

    // ดึงข้อมูลผู้เข้าพัก (แสดงเฉพาะ active contracts เป็น default) พร้อม contract_id
    let tenants: any[] = [];
    try {
      const contracts = await query(
        `
        SELECT 
          c.contract_id,
          c.tenant_id,
          c.start_date,
          c.end_date,
          c.status,
          t.first_name_th AS first_name,
          t.last_name_th AS last_name,
          t.email,
          t.phone,
          t.department
        FROM contracts c
        JOIN tenants t ON c.tenant_id = t.tenant_id
        WHERE c.room_id = ? AND c.status = 'active'
        ORDER BY c.start_date DESC
        `,
        [roomId]
      );
      tenants = contracts.map((c: any) => ({
        tenant_id: c.tenant_id,
        contract_id: c.contract_id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        phone: c.phone,
        department: c.department,
        move_in_date: c.start_date,
        move_out_date: c.end_date,
        status: c.status,
      }));
    } catch (error: any) {
      // ถ้าไม่มี contracts table หรือ error อื่นๆ ให้ tenants เป็น array ว่าง
      console.warn('Cannot fetch tenants for room:', error.message);
    }

    // ดึงข้อมูลบิลล่าสุด (ถ้ามี)
    let recentBills: any[] = [];
    try {
      recentBills = await query(
        `SELECT 
          b.bill_id, 
          bc.billing_year, 
          bc.billing_month, 
          b.total_amount, 
          b.status, 
          bc.due_date
         FROM bills b
         JOIN billing_cycles bc ON b.cycle_id = bc.cycle_id
         WHERE b.room_id = ?
         ORDER BY bc.billing_year DESC, bc.billing_month DESC
         LIMIT 3`,
        [roomId]
      );
    } catch (error: any) {
      // ถ้าไม่มี bills table หรือ billing_cycles table ให้ bills เป็น array ว่าง
      console.warn('Cannot fetch bills for room:', error.message);
    }

    // ดึงข้อมูล occupancy (จำนวนผู้เข้าพัก)
    let occupancy = null;
    try {
      occupancy = await getRoomOccupancy(roomId);
    } catch (error: any) {
      console.warn('Cannot fetch occupancy for room:', error.message);
    }

    // ใช้ max_occupants จาก room_types เป็นหลัก (ถ้ามี) ไม่งั้นใช้จาก occupancy
    const maxOccupants = roomType?.max_occupants ?? occupancy?.max_occupants ?? 2;
    
    return NextResponse.json({
      room: {
        ...room,
        room_type_id: roomType?.room_type_id ?? null,
        room_type_name:
          (roomType?.name_type && roomType.name_type.trim()) || null,
        max_occupants: maxOccupants,
      },
      tenants,
      recentBills,
      occupancy: occupancy
        ? {
            current_occupants: occupancy.current_occupants,
            max_occupants: maxOccupants, // ใช้ค่าจาก room_types เป็นหลัก
          }
        : {
            current_occupants: tenants.length,
            max_occupants: maxOccupants,
          },
    });
  } catch (error: any) {
    console.error('Error fetching room details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch room details' },
      { status: 500 }
    );
  }
}

