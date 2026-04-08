import { NextResponse } from 'next/server';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import {
  countRoomsUsingRoomType,
  deleteRoomTypeRow,
  updateRoomTypeRow,
} from '@/lib/room-types-db';

const MUTATE_ROLES: AppRoleCode[] = [
  'ADMIN',
  'FINANCE',
  'SUPERUSER_RP',
  'SUPERUSER_MED',
];

// PUT /api/room-types/[id]
export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAppRoles(MUTATE_ROLES);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const idParam = params.id;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
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

    await updateRoomTypeRow(id, name, Math.floor(maxOccupants));
    return NextResponse.json({ ok: true, room_type_id: id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update';
    console.error('PUT room-types:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/room-types/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAppRoles(MUTATE_ROLES);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const idParam = params.id;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const inUse = await countRoomsUsingRoomType(id);
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `ไม่สามารถลบได้: มีห้องพัก ${inUse} ห้องยังใช้ประเภทนี้อยู่ กรุณาเปลี่ยนประเภทห้องก่อน`,
        },
        { status: 409 },
      );
    }

    await deleteRoomTypeRow(id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete';
    console.error('DELETE room-types:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
