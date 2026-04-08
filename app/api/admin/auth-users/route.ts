import { NextResponse } from 'next/server';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import { getAllAuthUsersWithRoles } from '@/lib/repositories/auth-users';

export const dynamic = 'force-dynamic';

const ADMIN_ONLY: AppRoleCode[] = ['ADMIN'];

// GET /api/admin/auth-users - รายชื่อผู้ใช้ + สิทธิ์ (สำหรับหน้าจัดการสิทธิ์)
export async function GET() {
  try {
    const authResult = await requireAppRoles(ADMIN_ONLY);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await getAllAuthUsersWithRoles();
    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error fetching auth users:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch auth users' },
      { status: 500 },
    );
  }
}

