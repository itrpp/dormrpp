import { query } from '@/lib/db';
import type { AppRoleCode } from '@/lib/auth/app-roles';

/** รายการสิทธิ์จากตาราง auth_roles (ใช้เป็นแหล่งความจริงเดียว) */
export interface AuthRoleRow {
  auth_role_id: number;
  code: string;
  name_th: string;
  description: string | null;
}

export async function getAuthRoles(): Promise<AuthRoleRow[]> {
  const rows = await query<AuthRoleRow>(
    `SELECT auth_role_id, code, name_th, description FROM auth_roles ORDER BY auth_role_id ASC`,
  );
  return rows;
}

export interface AdminAuthUserRow {
  auth_user_id: number;
  ad_username: string;
  display_name: string;
  department?: string | null;
  roles: AppRoleCode[];
}

function parseRoleCodes(roleCodes: string | null | undefined): AppRoleCode[] {
  if (!roleCodes) {
    return [];
  }
  const codes = roleCodes
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0) as AppRoleCode[];

  // กรองเฉพาะรหัสสิทธิ์ที่เรารองรับจริง ๆ (รวม USER)
  const allowed: AppRoleCode[] = [
    'ADMIN',
    'SUPERUSER_RP',
    'SUPERUSER_MED',
    'FINANCE',
    'FINANCE-R',
    'FINANCE-M',
    'TENANT_RP',
    'TENANT_MED',
    'USER',
  ];

  return Array.from(
    new Set(
      codes.filter((code) => allowed.includes(code)),
    ),
  );
}

/**
 * ดึงรายการผู้ใช้พร้อมสิทธิ์จาก auth_user_roles + auth_roles เท่านั้น
 * สิทธิ์ที่แสดง = auth_role_id ใน auth_user_roles ที่มีอยู่จริงใน auth_roles (เอา r.code มาแสดง)
 */
export async function getAllAuthUsersWithRoles(): Promise<AdminAuthUserRow[]> {
  const rows = await query<{
    auth_user_id: number;
    ad_username: string;
    display_name: string;
    department: string | null;
    role_codes: string | null;
  }>(
    `
      SELECT
        u.auth_user_id,
        u.ad_username,
        u.display_name,
        u.department,
        GROUP_CONCAT(DISTINCT r.code ORDER BY r.code) AS role_codes
      FROM auth_users u
      LEFT JOIN auth_user_roles ur ON ur.auth_user_id = u.auth_user_id
      LEFT JOIN auth_roles r ON r.auth_role_id = ur.auth_role_id
      GROUP BY u.auth_user_id, u.ad_username, u.display_name, u.department
      ORDER BY u.display_name ASC, u.ad_username ASC
    `,
  );

  return rows.map((row) => ({
    auth_user_id: row.auth_user_id,
    ad_username: row.ad_username,
    display_name: row.display_name,
    department: row.department,
    roles: parseRoleCodes(row.role_codes),
  }));
}

export async function getAuthUserWithRolesById(
  authUserId: number,
): Promise<AdminAuthUserRow | null> {
  const row = await query<{
    auth_user_id: number;
    ad_username: string;
    display_name: string;
    department: string | null;
    role_codes: string | null;
  }>(
    `
      SELECT
        u.auth_user_id,
        u.ad_username,
        u.display_name,
        u.department,
        GROUP_CONCAT(DISTINCT r.code ORDER BY r.code) AS role_codes
      FROM auth_users u
      LEFT JOIN auth_user_roles ur ON ur.auth_user_id = u.auth_user_id
      LEFT JOIN auth_roles r ON r.auth_role_id = ur.auth_role_id
      WHERE u.auth_user_id = ?
      GROUP BY u.auth_user_id, u.ad_username, u.display_name, u.department
      LIMIT 1
    `,
    [authUserId],
  );

  if (!row || row.length === 0) {
    return null;
  }

  const first = row[0];
  return {
    auth_user_id: first.auth_user_id,
    ad_username: first.ad_username,
    display_name: first.display_name,
    department: first.department,
    roles: parseRoleCodes(first.role_codes),
  };
}

/**
 * กำหนดสิทธิ์ผู้ใช้จากรหัสใน auth_roles เท่านั้น
 * เขียนลง auth_user_roles โดยใช้ auth_role_id ที่ดึงจาก auth_roles.code
 * ถ้าบาง code ไม่มีใน auth_roles จะ throw หลัง commit ไม่ตรงจำนวน
 */
export async function setUserRoles(
  authUserId: number,
  roleCodes: AppRoleCode[],
): Promise<void> {
  const { pool } = await import('@/lib/db');
  const connection = await pool.getConnection();

  const ALLOWED_CODES: AppRoleCode[] = [
    'ADMIN',
    'SUPERUSER_RP',
    'SUPERUSER_MED',
    'FINANCE',
    'FINANCE-R',
    'FINANCE-M',
    'TENANT_RP',
    'TENANT_MED',
    'USER',
  ];

  const uniqueAllowedCodes = Array.from(new Set(roleCodes)).filter((code) =>
    ALLOWED_CODES.includes(code),
  ) as AppRoleCode[];

  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM auth_user_roles WHERE auth_user_id = ?', [authUserId]);

    if (uniqueAllowedCodes.length === 0) {
      await connection.commit();
      return;
    }

    const placeholders = uniqueAllowedCodes.map(() => '?').join(',');
    const [insertResult] = await connection.query(
      `
        INSERT INTO auth_user_roles (auth_user_id, auth_role_id)
        SELECT ?, r.auth_role_id
        FROM auth_roles r
        WHERE r.code IN (${placeholders})
      `,
      [authUserId, ...uniqueAllowedCodes],
    );

    const insertedRows = (insertResult as { affectedRows?: number })?.affectedRows ?? 0;
    if (insertedRows !== uniqueAllowedCodes.length) {
      await connection.rollback();
      throw new Error(
        `ไม่สามารถแมปสิทธิ์ทั้งหมดกับตาราง auth_roles ได้ (บันทึกได้ ${insertedRows}/${uniqueAllowedCodes.length} รายการ) กรุณาตรวจสอบว่าตาราง auth_roles มี code ครบ: ADMIN, SUPERUSER_RP, SUPERUSER_MED, FINANCE, FINANCE-R, FINANCE-M, TENANT_RP, TENANT_MED`,
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

