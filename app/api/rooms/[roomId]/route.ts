// app/api/rooms/[roomId]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { updateRoom, getRoomById, deleteRoom } from '@/lib/repositories/rooms';
import type { RoomWithDetails } from '@/lib/repositories/rooms';

type Params = { params: { roomId: string } };

// PUT /api/rooms/[roomId]
// body: { building_id, room_number, floor_no, status }
export async function PUT(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);
    const body = await req.json();
    const { building_id, room_number, floor_no, status } = body;

    if (!building_id || !room_number) {
      return NextResponse.json(
        { error: 'building_id, room_number are required' },
        { status: 400 }
      );
    }

    await updateRoom(roomId, {
      building_id: Number(building_id),
      room_number,
      floor_no: floor_no ? Number(floor_no) : null,
      status: status || 'available',
    });

    // ดึงข้อมูล room ที่อัปเดตแล้ว
    const updatedRoom = await getRoomById(roomId);
    if (!updatedRoom) {
      return NextResponse.json(
        { error: 'Room not found after update' },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedRoom);
  } catch (error: any) {
    console.error('Error updating room:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update room' },
      { status: 500 }
    );
  }
}

// DELETE /api/rooms/[roomId]
export async function DELETE(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);

    await deleteRoom(roomId);

    return NextResponse.json({ message: 'Room deleted' });
  } catch (error: any) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete room' },
      { status: 500 }
    );
  }
}

