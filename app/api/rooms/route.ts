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
// body: { building_id, room_number, floor_no, status }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { building_id, room_number, floor_no, status } = body;

    if (!building_id || !room_number) {
      return NextResponse.json(
        { error: 'building_id, room_number are required' },
        { status: 400 }
      );
    }

    // สร้างห้องพัก
    const { pool } = await import('@/lib/db');
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        `INSERT INTO rooms (building_id, room_number, floor_no, status)
         VALUES (?, ?, ?, ?)`,
        [
          Number(building_id),
          room_number,
          floor_no ? Number(floor_no) : null,
          status || 'available',
        ]
      );
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

