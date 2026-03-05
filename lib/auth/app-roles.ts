import { query } from '@/lib/db';
import type { SessionUser } from './session';

/**
 * รหัสสิทธิ์เชิงธุรกิจในระบบ (ผูกกับตาราง auth_roles/auth_user_roles)
 *
 * ADMIN         : ผู้ดูแลระบบ จัดการได้ทั้งหมด
 * SUPERUSER_RP  : Superuser หอพักรวงผึ้ง
 * SUPERUSER_MED : Superuser หอพักแพทยศาสตร์
 * FINANCE       : เจ้าหน้าที่การเงิน จัดการบิลทั้ง 2 อาคาร
 * TENANT_RP     : ผู้เช่าหอพักรวงผึ้ง เห็นบิลเฉพาะห้องตัวเอง
 * TENANT_MED    : ผู้เช่าหอพักแพทยศาสตร์ เห็นบิลเฉพาะห้องตัวเอง
 * USER          : ผู้ใช้งานทั่วไป – เห็นเฉพาะ Dashboard, ตรวจสอบมิเตอร์, ประกาศ
 */
export type AppRoleCode =
  | 'ADMIN'
  | 'SUPERUSER_RP'
  | 'SUPERUSER_MED'
  | 'FINANCE'
  | 'TENANT_RP'
  | 'TENANT_MED'
  | 'USER';

/**
 * สร้าง/อัปเดตข้อมูลผู้ใช้ในตาราง auth_users
 * ใช้ ad_username เป็น key หลัก (UNIQUE)
 * บันทึกเฉพาะ display_name + department (ไม่ใช้ email แล้ว)
 */
export async function upsertAuthUser(
  adUsername: string,
  displayName: string,
  department?: string | null,
): Promise<void> {
  await query(
    `
      INSERT INTO auth_users (ad_username, display_name, department)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        department = VALUES(department)
    `,
    [adUsername, displayName, department ?? null],
  );
}

/**
 * สร้าง/อัปเดตข้อมูลผู้ใช้ในตาราง auth_users จาก Session
 * ใช้ session.username (ซึ่งปัจจุบันคือ AD object GUID) เป็น key หลัก
 */
async function upsertAuthUserFromSession(session: SessionUser): Promise<void> {
  await upsertAuthUser(session.username, session.name, session.department ?? null);
}

/**
 * ให้ user ได้สิทธิ์ USER อัตโนมัติ (ครั้งแรกที่มีการกำหนดสิทธิ์)
 * - ถ้ามี row ใน auth_user_roles อยู่แล้ว จะไม่ทำอะไร
 * - ถ้าไม่มีสิทธิ์เลย จะ insert สิทธิ์ USER ให้ 1 แถว
 */
export async function ensureUserRoleForNewUser(adUsername: string): Promise<void> {
  await query(
    `
      INSERT INTO auth_user_roles (auth_user_id, auth_role_id)
      SELECT u.auth_user_id, r.auth_role_id
      FROM auth_users u
      JOIN auth_roles r ON r.code = 'USER'
      LEFT JOIN auth_user_roles ur
        ON ur.auth_user_id = u.auth_user_id
       AND ur.auth_role_id = r.auth_role_id
      WHERE u.ad_username = ?
        AND ur.auth_user_id IS NULL
    `,
    [adUsername],
  );
}

/**
 * ดึงสิทธิ์เชิงธุรกิจของผู้ใช้จากฐานข้อมูล (ตาราง auth_user_roles + auth_roles)
 * ไม่ผูกสิทธิ์ ADMIN อัตโนมัติจาก AD อีกต่อไป ทุกสิทธิ์ต้องมาจากตาราง auth_user_roles เท่านั้น
 */
export async function getAppRolesForSessionUser(
  session: SessionUser,
): Promise<AppRoleCode[]> {
  // ให้แน่ใจว่ามี record ของผู้ใช้ใน auth_users ก่อน
  await upsertAuthUserFromSession(session);

  const rows = await query<{ code: AppRoleCode }>(
    `
      SELECT r.code
      FROM auth_user_roles ur
      JOIN auth_users u ON ur.auth_user_id = u.auth_user_id
      JOIN auth_roles r ON r.auth_role_id = ur.auth_role_id
      WHERE u.ad_username = ?
    `,
    [session.username],
  );

  return rows.map((r) => r.code);
}

/**
 * ตรวจสอบว่า session ปัจจุบันมีสิทธิ์ใดสิทธิ์หนึ่งในชุดที่กำหนดหรือไม่
 */
export async function hasAnyAppRole(
  session: SessionUser,
  requiredRoles: AppRoleCode[],
): Promise<boolean> {
  const roles = await getAppRolesForSessionUser(session);
  return requiredRoles.some((r) => roles.includes(r));
}

