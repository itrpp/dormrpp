// app/api/rooms/[roomId]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { updateRoom, getRoomById, deleteRoom, toggleRoomActive } from '@/lib/repositories/rooms';
import type { RoomWithDetails } from '@/lib/repositories/rooms';

type Params = { params: { roomId: string } };

// PUT /api/rooms/[roomId]
// body: { building_id, room_number, floor_no, status }
export async function PUT(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);
    const body = await req.json();
    const { building_id, room_number, floor_no, status, room_type_id } = body;

    if (!building_id || !room_number) {
      return NextResponse.json(
        { error: 'building_id, room_number are required' },
        { status: 400 }
      );
    }

    // ตรวจสอบรูปแบบหมายเลขห้อง: ต้องเป็นตัวเลข 3 หลักเท่านั้น
    const roomNumberStr = String(room_number ?? '').trim();
    if (!/^\d{3}$/.test(roomNumberStr)) {
      return NextResponse.json(
        { error: 'room_number must be a 3-digit numeric string (e.g. 101, 305)' },
        { status: 400 }
      );
    }

    await updateRoom(roomId, {
      building_id: Number(building_id),
      room_number: roomNumberStr,
      floor_no: floor_no ? Number(floor_no) : null,
      status: status || 'available',
    });

    // อัปเดต room_type_id แยกต่างหาก (เพื่อไม่กระทบโครงสร้าง Room เดิม)
    if (room_type_id !== undefined) {
      await query(
        'UPDATE rooms SET room_type_id = ? WHERE room_id = ?',
        [room_type_id ? Number(room_type_id) : null, roomId]
      );
    }

    // ดึงข้อมูล room ที่อัปเดตแล้ว
    const updatedRoom = await getRoomById(roomId);
    if (!updatedRoom) {
      return NextResponse.json(
        { error: 'Room not found after update' },
        { status: 404 }
      );
    }

    // ดึงข้อมูล room_type_name และ max_occupants จาก room_types
    let roomTypeName: string | null = null;
    let maxOccupants: number | null = null;
    
    if (updatedRoom.room_type_id) {
      try {
        // ใช้ SELECT * เพื่อดึงทุกคอลัมน์ที่มี แล้ว map แบบยืดหยุ่น
        const roomTypeRows = await query<any>(
          `SELECT * FROM room_types WHERE id = ? LIMIT 1`,
          [updatedRoom.room_type_id]
        );
        
        if (roomTypeRows.length > 0) {
          const row = roomTypeRows[0];
          // Map แบบยืดหยุ่น: name_type ?? name_th ?? name_en ?? null
          roomTypeName = row.name_type || row.name_th || row.name_en || null;
          maxOccupants = row.max_occupants ?? null;
        } else {
          // Fallback: ลองใช้ room_type_id (กรณี schema ใหม่)
          const roomTypeRowsByTypeId = await query<any>(
            `SELECT * FROM room_types WHERE room_type_id = ? LIMIT 1`,
            [updatedRoom.room_type_id]
          );
          
          if (roomTypeRowsByTypeId.length > 0) {
            const row = roomTypeRowsByTypeId[0];
            roomTypeName = row.name_type || row.name_th || row.name_en || null;
            maxOccupants = row.max_occupants ?? null;
          }
        }
      } catch (err) {
        console.warn('Cannot fetch room type details:', err);
      }
    }

    return NextResponse.json({
      ...updatedRoom,
      room_type_name: roomTypeName,
      max_occupants: maxOccupants,
    });
  } catch (error: any) {
    console.error('Error updating room:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update room' },
      { status: 500 }
    );
  }
}

// PATCH /api/rooms/[roomId]/toggle-active - เปิดใช้งาน/ปิดใช้งานห้องพัก
export async function PATCH(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);
    const body = await req.json();
    const { is_deleted } = body;

    if (typeof is_deleted !== 'boolean') {
      return NextResponse.json(
        { error: 'is_deleted must be a boolean' },
        { status: 400 }
      );
    }

    await toggleRoomActive(roomId, is_deleted);

    // ดึงข้อมูล room ที่อัปเดตแล้ว
    const updatedRoom = await getRoomById(roomId);
    if (!updatedRoom) {
      return NextResponse.json(
        { error: 'Room not found after update' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...updatedRoom,
      message: is_deleted ? 'ปิดใช้งานห้องพักสำเร็จ' : 'เปิดใช้งานห้องพักสำเร็จ',
    });
  } catch (error: any) {
    console.error('Error toggling room active:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to toggle room active' },
      { status: 500 }
    );
  }
}

// DELETE /api/rooms/[roomId] - ยังคงไว้สำหรับ backward compatibility แต่จะใช้ soft delete
export async function DELETE(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);

    // ใช้ soft delete แทน hard delete
    await toggleRoomActive(roomId, true);

    return NextResponse.json({ message: 'Room deactivated' });
  } catch (error: any) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete room' },
      { status: 500 }
    );
  }
}

