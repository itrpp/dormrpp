// app/api/room-types/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { RoomType } from '@/types/db';

// GET /api/room-types
export async function GET(req: Request) {
  try {
    const roomTypes = await query<RoomType>(
      'SELECT room_type_id, name_th, name_en FROM room_types ORDER BY room_type_id'
    );
    return NextResponse.json(roomTypes);
  } catch (error: any) {
    console.error('Error fetching room types:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch room types' },
      { status: 500 }
    );
  }
}

