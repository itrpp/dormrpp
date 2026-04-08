import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';

export const dynamic = 'force-dynamic';

const TENANT_MAPPING_ACCESS: AppRoleCode[] = ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'];

interface TenantAuthUserRow {
  auth_user_id: number;
  ad_username: string;
  display_name: string;
  department: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  room_number: string | null;
  building_name: string | null;
  /** สิทธิ์จาก auth_roles.name_th (คั่นด้วย comma ถ้ามีหลาย role) */
  role_names_th: string | null;
}

// GET /api/admin/tenant-auth-users
// รายการผู้ใช้ AD + mapping ผู้เช่า (ถ้ามี)
export async function GET() {
  try {
    const authResult = await requireAppRoles(TENANT_MAPPING_ACCESS);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await query<TenantAuthUserRow>(
      `
      SELECT
        au.auth_user_id,
        au.ad_username,
        au.display_name,
        au.department,
        tau.tenant_id,
        CASE
          WHEN t.first_name_th IS NOT NULL OR t.last_name_th IS NOT NULL
            THEN CONCAT(COALESCE(t.first_name_th, ''), ' ', COALESCE(t.last_name_th, ''))
          ELSE NULL
        END AS tenant_name,
        t.email AS tenant_email,
        r.room_number,
        b.name_th AS building_name,
        (
          -- auth_users.auth_user_id → auth_user_roles.auth_user_id → auth_user_roles.auth_role_id → auth_roles.auth_role_id → auth_roles.name_th
          SELECT GROUP_CONCAT(ar.name_th ORDER BY ar.auth_role_id SEPARATOR ', ')
          FROM auth_user_roles aur
          JOIN auth_roles ar ON ar.auth_role_id = aur.auth_role_id
          WHERE aur.auth_user_id = au.auth_user_id
        ) AS role_names_th
      FROM auth_users au
      LEFT JOIN tenant_auth_users tau
        ON tau.auth_user_id = au.auth_user_id
      LEFT JOIN tenants t
        ON t.tenant_id = tau.tenant_id
      LEFT JOIN contracts c
        ON c.tenant_id = t.tenant_id
        AND c.status = 'active'
      LEFT JOIN rooms r
        ON r.room_id = c.room_id
      LEFT JOIN buildings b
        ON b.building_id = r.building_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM auth_user_roles aur_ex
        JOIN auth_roles ar_ex ON ar_ex.auth_role_id = aur_ex.auth_role_id
        WHERE aur_ex.auth_user_id = au.auth_user_id
          AND ar_ex.code = 'ADMIN'
      )
      ORDER BY au.display_name ASC, au.ad_username ASC
      `,
    );

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('Error fetching tenant auth users:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch tenant auth users' },
      { status: 500 },
    );
  }
}

