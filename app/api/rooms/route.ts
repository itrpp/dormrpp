// app/api/rooms/route.ts
import { NextResponse } from 'next/server';
import { getAllRooms, createRoom } from '@/lib/repositories/rooms';

// GET /api/rooms?building_id=1
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('building_id');

    const rooms = await getAllRooms(buildingId ? Number(buildingId) : undefined);
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
    const body = await req.json();
    const { building_id, room_number, floor_no, status, room_type_id } = body;

    if (!building_id || !room_number) {
      return NextResponse.json(
        { error: 'building_id, room_number are required' },
        { status: 400 }
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

