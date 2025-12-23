// app/api/room-types/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { RoomType } from '@/types/db';

// GET /api/room-types
export async function GET(req: Request) {
  try {
    // ดึงทุกคอลัมน์จาก room_types แล้วแม็ปเป็น RoomType แบบยืดหยุ่น
    const raw = await query<any>('SELECT * FROM room_types ORDER BY id');

    const roomTypes: RoomType[] = raw
      .map((row: any) => {
        const room_type_id = row.room_type_id ?? row.id ?? null;
        const name_type =
          row.name_type ?? row.name_th ?? row.name_en ?? null;

        if (room_type_id === null) return null;

        return {
          room_type_id,
          name_th: row.name_th ?? null,
          name_en: row.name_en ?? null,
          description: row.description ?? null,
          name_type,
        } as RoomType;
      })
      .filter((rt: RoomType | null): rt is RoomType => rt !== null);

    return NextResponse.json(roomTypes);
  } catch (error: any) {
    console.error('Error fetching room types:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch room types' },
      { status: 500 }
    );
  }
}

