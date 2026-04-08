// app/api/room-types/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import { insertRoomTypeRow } from '@/lib/room-types-db';
import type { RoomType } from '@/types/db';

const MUTATE_ROLES: AppRoleCode[] = [
  'ADMIN',
  'FINANCE',
  'SUPERUSER_RP',
  'SUPERUSER_MED',
];

// GET /api/room-types
export async function GET() {
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
          max_occupants:
            row.max_occupants != null ? Number(row.max_occupants) : null,
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

// POST /api/room-types — เพิ่มประเภทห้องพัก
export async function POST(req: Request) {
  const auth = await requireAppRoles(MUTATE_ROLES);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name_th === 'string' ? body.name_th : body.name;
    const maxRaw = body.max_occupants ?? body.maxOccupants;
    const maxOccupants =
      maxRaw === undefined || maxRaw === null || maxRaw === ''
        ? 2
        : Number(maxRaw);

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'name_th (ชื่อประเภทห้อง) จำเป็นต้องกรอก' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(maxOccupants) || maxOccupants < 1 || maxOccupants > 20) {
      return NextResponse.json(
        { error: 'max_occupants ต้องเป็นตัวเลข 1–20' },
        { status: 400 },
      );
    }

    const insertId = await insertRoomTypeRow(name, Math.floor(maxOccupants));
    return NextResponse.json(
      { ok: true, room_type_id: insertId },
      { status: 201 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create';
    console.error('POST room-types:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

