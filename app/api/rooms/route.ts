// app/api/rooms/route.ts
import { NextResponse } from 'next/server';
import { getAllRooms, createRoom } from '@/lib/repositories/rooms';
import { requireAppRoles } from '@/lib/auth/middleware';
import {
  ADMIN_BUILDING_DATA_ACCESS_ROLES,
  getAdminBuildingScopeFromAppRoles,
  isBuildingIdInScope,
  resolveAllowedBuildingIdsForListQuery,
} from '@/lib/auth/building-scope';

// GET /api/rooms?building_id=1
export async function GET(req: Request) {
  try {
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);
    const { searchParams } = new URL(req.url);
    const buildingIdParam = searchParams.get('building_id');
    const includeDeletedParam = searchParams.get('include_deleted');
    const includeDeleted =
      includeDeletedParam === '1' ||
      includeDeletedParam === 'true' ||
      includeDeletedParam === 'yes';
    const bid =
      buildingIdParam !== null && buildingIdParam !== ''
        ? Number(buildingIdParam)
        : undefined;

    const restrictIds = resolveAllowedBuildingIdsForListQuery(
      scope,
      bid !== undefined && Number.isFinite(bid) ? bid : null,
    );
    if (restrictIds !== null && restrictIds.length === 0) {
      return NextResponse.json([]);
    }

    const rooms = await getAllRooms(
      restrictIds === null ? bid : undefined,
      restrictIds === null ? undefined : restrictIds,
      { includeDeleted },
    );
    return NextResponse.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    );
  }
}

// POST /api/rooms
// body: { building_id, room_number, floor_no, status, room_type_id? }
export async function POST(req: Request) {
  try {
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const body = await req.json();
    const { building_id, room_number, floor_no, status, room_type_id } = body;

    if (!building_id || !room_number) {
      return NextResponse.json(
        { error: 'building_id, room_number are required' },
        { status: 400 }
      );
    }

    if (!isBuildingIdInScope(Number(building_id), scope)) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์จัดการอาคารนี้' },
        { status: 403 },
      );
    }

    // ตรวจสอบรูปแบบหมายเลขห้อง: ต้องเป็นตัวเลข 3 หลักเท่านั้น (เช่น 101, 305)
    // รองรับทั้งกรณี body ส่งมาเป็น string หรือ number
    const roomNumberStr = String(room_number ?? '').trim();
    if (!/^\d{3}$/.test(roomNumberStr)) {
      return NextResponse.json(
        { error: 'room_number must be a 3-digit numeric string (e.g. 101, 305)' },
        { status: 400 }
      );
    }

    // กันเพิ่มซ้ำ: ถ้ามีเลขห้องในอาคารเดียวกันอยู่แล้ว ให้แจ้งทันที
    const existingRows = await (await import('@/lib/db')).query<{
      room_id: number;
      room_number: string;
      building_id: number;
    }>(
      `SELECT room_id, room_number, building_id
       FROM rooms
       WHERE building_id = ? AND room_number = ?
       LIMIT 1`,
      [Number(building_id), roomNumberStr],
    );
    if (existingRows.length > 0) {
      const existing = existingRows[0]!;
      let isDeleted = 0;
      try {
        const deletedRows = await (await import('@/lib/db')).query<{
          is_deleted: number;
        }>(
          `SELECT COALESCE(is_deleted, 0) AS is_deleted
           FROM rooms
           WHERE room_id = ?
           LIMIT 1`,
          [existing.room_id],
        );
        isDeleted = Number(deletedRows[0]?.is_deleted ?? 0);
      } catch {
        isDeleted = 0;
      }

      if (isDeleted === 1) {
        return NextResponse.json(
          {
            error:
              'พบห้องเลขนี้อยู่แล้วในสถานะปิดใช้งาน กรุณาเปิดใช้งานห้องเดิมแทนการสร้างซ้ำ',
            room_id: existing.room_id,
            is_deleted: true,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: 'มีหมายเลขห้องนี้ในอาคารเดียวกันอยู่แล้ว' },
        { status: 409 },
      );
    }

    // สร้างห้องพัก
    const { pool } = await import('@/lib/db');
    const connection = await pool.getConnection();
    try {
      let result: any;

      // ถ้า body มี room_type_id ให้พยายาม insert ด้วย column นี้ก่อน
      if (room_type_id !== undefined && room_type_id !== null && room_type_id !== '') {
        try {
          const [resWithType] = await connection.query(
            `INSERT INTO rooms (building_id, room_number, floor_no, status, room_type_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
              Number(building_id),
              roomNumberStr,
              floor_no ? Number(floor_no) : null,
              status || 'available',
              Number(room_type_id),
            ]
          );
          result = resWithType;
        } catch (err: any) {
          // ถ้าไม่มี column room_type_id ให้ fallback ไป insert แบบเดิม
          if (err.message?.includes("room_type_id")) {
            const [resFallback] = await connection.query(
              `INSERT INTO rooms (building_id, room_number, floor_no, status)
               VALUES (?, ?, ?, ?)`,
              [
                Number(building_id),
                roomNumberStr,
                floor_no ? Number(floor_no) : null,
                status || 'available',
              ]
            );
            result = resFallback;
          } else {
            throw err;
          }
        }
      } else {
        // ไม่มี room_type_id → ใช้ insert แบบเดิม
        const [resFallback] = await connection.query(
        `INSERT INTO rooms (building_id, room_number, floor_no, status)
         VALUES (?, ?, ?, ?)`,
        [
          Number(building_id),
          roomNumberStr,
          floor_no ? Number(floor_no) : null,
          status || 'available',
        ]
      );
        result = resFallback;
      }

      const roomId = (result as any).insertId;
      connection.release();

      // ดึงข้อมูล room ที่สร้างใหม่
      const { getRoomById } = await import('@/lib/repositories/rooms');
      const newRoom = await getRoomById(roomId);
      if (!newRoom) {
        return NextResponse.json(
          { error: 'Room not found after creation' },
          { status: 404 }
        );
      }

      return NextResponse.json(newRoom, { status: 201 });
    } catch (error: any) {
      connection.release();
      throw error;
    }
  } catch (error: any) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create room' },
      { status: 500 }
    );
  }
}

