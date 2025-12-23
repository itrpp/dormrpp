// app/api/rooms/occupancy/route.ts
// API endpoint สำหรับดึงข้อมูลสถานะผู้เข้าพักของห้อง
import { NextResponse } from 'next/server';
import { getAllRoomsOccupancy, getRoomOccupancy } from '@/lib/repositories/room-occupancy';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url
export const dynamic = 'force-dynamic';

// GET /api/rooms/occupancy?room_id=1&building_id=1
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');
    const buildingId = searchParams.get('building_id');

    if (roomId) {
      const occupancy = await getRoomOccupancy(Number(roomId));
      if (!occupancy) {
        return NextResponse.json(
          { error: 'ไม่พบข้อมูลห้อง' },
          { status: 404 }
        );
      }
      return NextResponse.json(occupancy);
    }

    const occupancies = await getAllRoomsOccupancy(
      buildingId ? Number(buildingId) : undefined
    );
    return NextResponse.json(occupancies || []);
  } catch (error: any) {
    console.error('Error fetching room occupancy:', error);
    // ถ้า error ให้ return array ว่างแทนที่จะ return error เพื่อให้ UI ยังทำงานได้
    return NextResponse.json([]);
  }
}
