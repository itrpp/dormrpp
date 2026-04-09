import { query } from '@/lib/db';
import { getSession } from './session';
import { getAppRolesForSessionUser } from './app-roles';
import type { AdminBuildingScope } from './building-scope';
import {
  getAdminBuildingScopeFromAppRoles,
  resolveAllowedBuildingIdsForListQuery,
} from './building-scope';

/**
 * สำหรับ Server Component / repository: คืน undefined = ไม่จำกัดอาคาร,
 * คืน array ว่าง = ไม่ควรแสดงข้อมูลอาคารใด (superuser ที่ไม่มี mapping — ไม่น่าเกิด)
 */
export async function getResolvedAllowedBuildingIdsForServerUser(): Promise<
  number[] | undefined
> {
  const session = await getSession();
  if (!session) return undefined;
  const roles = await getAppRolesForSessionUser(session);
  const scope = getAdminBuildingScopeFromAppRoles(roles);
  const ids = resolveAllowedBuildingIdsForListQuery(scope, null);
  if (ids === null) return undefined;
  return ids;
}

/**
 * Dashboard: รวมสิทธิ์กับพารามิเตอร์ ?building_id=
 * - effectiveIds undefined = แสดงรวมทุกอาคาร (เฉพาะ ADMIN/FINANCE legacy เมื่อไม่ระบุอาคาร หรือผู้เยี่ยมไม่ระบุอาคาร)
 * - effectiveIds เป็น array = กรองตามชุดนั้น
 * - ผู้เยี่ยม (ไม่ล็อกอิน): เลือกอาคารได้ผ่าน ?building_id= ที่มีในตาราง buildings เท่านั้น
 */
export async function getDashboardBuildingResolution(
  requestedBuildingId?: number | null,
): Promise<{
  scope: AdminBuildingScope;
  effectiveIds: number[] | undefined;
}> {
  const session = await getSession();
  if (!session) {
    const scope = { kind: 'all' as const };
    if (
      requestedBuildingId != null &&
      Number.isFinite(Number(requestedBuildingId))
    ) {
      const bid = Math.trunc(Number(requestedBuildingId));
      if (bid > 0) {
        const rows = await query<{ building_id: number }>(
          'SELECT building_id FROM buildings WHERE building_id = ? LIMIT 1',
          [bid],
        );
        if (rows.length > 0) {
          return { scope, effectiveIds: [bid] };
        }
      }
    }
    return { scope, effectiveIds: undefined };
  }
  const roles = await getAppRolesForSessionUser(session);
  const scope = getAdminBuildingScopeFromAppRoles(roles);
  const ids = resolveAllowedBuildingIdsForListQuery(
    scope,
    requestedBuildingId ?? null,
  );
  return {
    scope,
    effectiveIds: ids === null ? undefined : ids,
  };
}
