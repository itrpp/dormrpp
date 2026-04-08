// app/api/rooms/occupancy/route.ts
// API endpoint สำหรับดึงข้อมูลสถานะผู้เข้าพักของห้อง
import { NextResponse } from 'next/server';
import { getAllRoomsOccupancy, getRoomOccupancy } from '@/lib/repositories/room-occupancy';
import { requireAppRoles } from '@/lib/auth/middleware';
import {
  ADMIN_BUILDING_DATA_ACCESS_ROLES,
  getAdminBuildingScopeFromAppRoles,
  isBuildingIdInScope,
  resolveAllowedBuildingIdsForListQuery,
} from '@/lib/auth/building-scope';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url
export const dynamic = 'force-dynamic';

// GET /api/rooms/occupancy?room_id=1&building_id=1
export async function GET(req: Request) {
  try {
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');
    const buildingId = searchParams.get('building_id');
    const bid =
      buildingId !== null && buildingId !== ''
        ? Number(buildingId)
        : undefined;
    const restrictIds = resolveAllowedBuildingIdsForListQuery(
      scope,
      bid !== undefined && Number.isFinite(bid) ? bid : null,
    );
    if (restrictIds !== null && restrictIds.length === 0) {
      return NextResponse.json([]);
    }

    if (roomId) {
      const occupancy = await getRoomOccupancy(Number(roomId));
      if (!occupancy) {
        return NextResponse.json(
          { error: 'ไม่พบข้อมูลห้อง' },
          { status: 404 }
        );
      }
      if (!isBuildingIdInScope(occupancy.building_id, scope)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json(occupancy);
    }

    const effectiveBuildingId =
      restrictIds === null
        ? bid
        : restrictIds.length === 1
          ? restrictIds[0]
          : undefined;

    let occupancies = await getAllRoomsOccupancy(
      effectiveBuildingId !== undefined && Number.isFinite(effectiveBuildingId)
        ? effectiveBuildingId
        : undefined,
    );
    if (
      scope.kind === 'buildings' &&
      restrictIds &&
      restrictIds.length > 1
    ) {
      const allow = new Set(restrictIds);
      occupancies = occupancies.filter((o) => allow.has(o.building_id));
    }
    return NextResponse.json(occupancies || []);
  } catch (error: any) {
    console.error('Error fetching room occupancy:', error);
    // ถ้า error ให้ return array ว่างแทนที่จะ return error เพื่อให้ UI ยังทำงานได้
    return NextResponse.json([]);
  }
}
