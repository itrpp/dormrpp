import type { AppRoleCode } from './app-roles';

/** หอพักรวงผึ้ง — สอดคล้องกับ building_id ในฐานข้อมูล */
export const BUILDING_ID_RUANG_PHUENG = 1;
/** อาคารแพทยศาสตร์ */
export const BUILDING_ID_MED = 2;

export type AdminBuildingScope =
  | { kind: 'all' }
  | { kind: 'buildings'; buildingIds: number[] };

/** สิทธิ์ที่เข้าถึงข้อมูลหอ/ห้อง/ผู้เช่า/บิลในแอดมิน (รวม superuser รายอาคาร) */
export const ADMIN_BUILDING_DATA_ACCESS_ROLES: AppRoleCode[] = [
  'ADMIN',
  'FINANCE',
  'FINANCE-R',
  'FINANCE-M',
  'SUPERUSER_RP',
  'SUPERUSER_MED',
];

/**
 * ADMIN / FINANCE (legacy) เห็นทุกอาคาร
 * SUPERUSER_RP / FINANCE-R → อาคารรวงผึ้ง
 * SUPERUSER_MED / FINANCE-M → อาคารแพทย์
 * หากมีทั้งสอง role ฝั่งรายอาคาร = เห็นสองอาคาร
 */
export function getAdminBuildingScopeFromAppRoles(
  roles: AppRoleCode[],
): AdminBuildingScope {
  if (roles.includes('ADMIN') || roles.includes('FINANCE')) {
    return { kind: 'all' };
  }
  const ids: number[] = [];
  if (roles.includes('SUPERUSER_RP') || roles.includes('FINANCE-R')) {
    ids.push(BUILDING_ID_RUANG_PHUENG);
  }
  if (roles.includes('SUPERUSER_MED') || roles.includes('FINANCE-M')) {
    ids.push(BUILDING_ID_MED);
  }
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return { kind: 'all' };
  }
  return { kind: 'buildings', buildingIds: unique };
}

export function isBuildingIdInScope(
  buildingId: number,
  scope: AdminBuildingScope,
): boolean {
  if (scope.kind === 'all') return true;
  return scope.buildingIds.includes(buildingId);
}

/** แสดงตัวเลือกอาคารบน Dashboard เมื่อดูได้มากกว่าหนึ่งมุมมอง (ผู้ดูแลระบบ / superuser หลายอาคาร) */
export function shouldShowDashboardBuildingPicker(
  scope: AdminBuildingScope,
): boolean {
  if (scope.kind === 'all') return true;
  return scope.buildingIds.length > 1;
}

/**
 * สำหรับลิสต์ที่มี query building_id
 * - คืน null = ไม่บังคับกรองอาคาร (เห็นทั้งหมดตามสิทธิ์)
 * - คืน [] = ไม่มีสิทธิ์เห็นข้อมูลในเงื่อนไขนี้
 */
export function resolveAllowedBuildingIdsForListQuery(
  scope: AdminBuildingScope,
  requestedBuildingId?: number | null,
): number[] | null {
  if (scope.kind === 'all') {
    if (requestedBuildingId != null && Number.isFinite(requestedBuildingId)) {
      return [Number(requestedBuildingId)];
    }
    return null;
  }
  const allowed = scope.buildingIds;
  if (requestedBuildingId != null && Number.isFinite(requestedBuildingId)) {
    const bid = Number(requestedBuildingId);
    return allowed.includes(bid) ? [bid] : [];
  }
  return [...allowed];
}

/** เพิ่มเงื่อนไข WHERE ตามคอลัมน์ building_id (เช่น r.building_id) */
export function appendBuildingScopeWhere(
  scope: AdminBuildingScope,
  column: string,
): { clause: string; params: number[] } | null {
  const ids = resolveAllowedBuildingIdsForListQuery(scope, null);
  if (ids === null) return null;
  if (ids.length === 0) {
    return { clause: ' AND 1=0', params: [] };
  }
  if (ids.length === 1) {
    return { clause: ` AND ${column} = ?`, params: [ids[0]] };
  }
  return {
    clause: ` AND ${column} IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

/** ค้นหาผู้เช่า: จำกัดตามห้องล่าสุด (หรือไม่มีห้อง = เห็นได้ทุก superuser) */
export function tenantSearchBuildingClause(
  scope: AdminBuildingScope,
): { clause: string; params: number[] } | null {
  if (scope.kind === 'all') return null;
  if (scope.buildingIds.length === 0) {
    return { clause: ' AND 1=0', params: [] };
  }
  const ph = scope.buildingIds.map(() => '?').join(',');
  return {
    clause: ` AND (r_last.room_id IS NULL OR r_last.building_id IN (${ph}))`,
    params: [...scope.buildingIds],
  };
}
