import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';

const TENANT_MAPPING_ACCESS: AppRoleCode[] = ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'];

interface UpdateBody {
  tenantId?: number | null;
}

// PUT /api/admin/tenant-auth-users/[authUserId]
// body: { tenantId?: number | null }
export async function PUT(
  req: Request,
  context: { params: { authUserId: string } },
) {
  try {
    const authResult = await requireAppRoles(TENANT_MAPPING_ACCESS);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const authUserId = Number(context.params.authUserId);
    if (!authUserId || Number.isNaN(authUserId)) {
      return NextResponse.json({ error: 'Invalid authUserId' }, { status: 400 });
    }

    const body = (await req.json()) as UpdateBody;
    const tenantId =
      body.tenantId === null || body.tenantId === undefined
        ? null
        : Number(body.tenantId);

    // ถ้า tenantId เป็น null => ลบ mapping เดิม
    if (!tenantId) {
      await query('DELETE FROM tenant_auth_users WHERE auth_user_id = ?', [
        authUserId,
      ]);
    } else {
      // ตรวจสอบว่า tenant มีอยู่จริง
      const tenants = await query<{ tenant_id: number }>(
        'SELECT tenant_id FROM tenants WHERE tenant_id = ? LIMIT 1',
        [tenantId],
      );
      if (!tenants.length) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 400 },
        );
      }

      // ลบ mapping เดิม แล้วสร้างใหม่ 1 แถว
      await query('DELETE FROM tenant_auth_users WHERE auth_user_id = ?', [
        authUserId,
      ]);
      await query(
        `INSERT INTO tenant_auth_users (auth_user_id, tenant_id, is_primary)
         VALUES (?, ?, 1)`,
        [authUserId, tenantId],
      );

      // ถ้ามี record ใน tenant_auth_users และ auth_user มี auth_role_id = 7 (USER) ให้ปรับเป็น:
      // 5 (TENANT_RP) ถ้าห้องผู้เช่าอยู่ dorm_id=1, 6 (TENANT_MED) ถ้า dorm_id=2
      // ปัจจุบันใช้ r.building_id (1=รวงผึ้ง, 2=แพทยศาสตร์); ถ้าเพิ่มคอลัมน์ rooms.dorm_id แล้วใช้ COALESCE(r.dorm_id, r.building_id) ได้
      const dormRows = await query<{ dorm_id: number }>(
        `SELECT r.building_id AS dorm_id
         FROM contracts c
         JOIN rooms r ON r.room_id = c.room_id
         WHERE c.tenant_id = ? AND c.status = 'active'
         LIMIT 1`,
        [tenantId],
      );
      const dormId = dormRows[0]?.dorm_id;
      if (dormId === 1 || dormId === 2) {
        const newRoleId = dormId === 1 ? 5 : 6; // 5 = TENANT_RP, 6 = TENANT_MED
        await query(
          `UPDATE auth_user_roles
           SET auth_role_id = ?
           WHERE auth_user_id = ? AND auth_role_id = 7`,
          [newRoleId, authUserId],
        );
      }
    }

    // ดึง row ที่อัปเดตแล้วกลับไปให้ client
    const rows = await query<{
      auth_user_id: number;
      ad_username: string;
      display_name: string;
      department: string | null;
      tenant_id: number | null;
      tenant_name: string | null;
      tenant_email: string | null;
      room_number: string | null;
      building_name: string | null;
      role_names_th: string | null;
    }>(
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
          -- auth_users.auth_user_id → auth_user_roles.auth_user_id → auth_roles.auth_role_id → auth_roles.name_th
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
      WHERE au.auth_user_id = ?
      LIMIT 1
      `,
      [authUserId],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: 'User not found after update' },
        { status: 404 },
      );
    }

    return NextResponse.json(rows[0]);
  } catch (error: any) {
    console.error('Error updating tenant auth user mapping:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update tenant mapping' },
      { status: 500 },
    );
  }
}

