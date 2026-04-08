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
 * - effectiveIds undefined = แสดงรวมทุกอาคาร (เฉพาะ ADMIN/FINANCE เมื่อไม่ระบุอาคาร)
 * - effectiveIds เป็น array = กรองตามชุดนั้น
 */
export async function getDashboardBuildingResolution(
  requestedBuildingId?: number | null,
): Promise<{
  scope: AdminBuildingScope;
  effectiveIds: number[] | undefined;
}> {
  const session = await getSession();
  if (!session) {
    return { scope: { kind: 'all' }, effectiveIds: undefined };
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
