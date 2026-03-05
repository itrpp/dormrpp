// app/api/admin/sync-auth-users-from-ad/route.ts
// ดึงรายชื่อผู้ใช้ทั้งหมดจาก AD Group DromRpp เข้ามาเก็บใน auth_users
// และกำหนดสิทธิ์เริ่มต้น USER โดยไม่ต้องให้ผู้ใช้ login

import { NextResponse } from 'next/server';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import { runSyncAuthUsersFromAd } from '@/lib/auth/sync-auth-users-from-ad';

const ADMIN_ROLES: AppRoleCode[] = ['ADMIN'];

export async function POST() {
  const authResult = await requireAppRoles(ADMIN_ROLES);
  if (!authResult.authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await runSyncAuthUsersFromAd();
    return NextResponse.json({
      success: true,
      totalFromAd: result.totalFromAd,
      processed: result.processed,
      usedGroupDn: result.usedGroupDn,
    });
  } catch (error: any) {
    console.error('Error syncing auth_users from AD group:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync users from AD' },
      { status: 500 },
    );
  }
}
