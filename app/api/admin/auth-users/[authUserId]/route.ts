import { NextResponse } from 'next/server';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import { getAuthUserWithRolesById, setUserRoles } from '@/lib/repositories/auth-users';

const ADMIN_ONLY: AppRoleCode[] = ['ADMIN'];

interface UpdateRolesBody {
  roleCodes?: string[];
}

// PUT /api/admin/auth-users/[authUserId]
// body: { roleCodes: AppRoleCode[] }
export async function PUT(
  req: Request,
  context: { params: { authUserId: string } },
) {
  try {
    const authResult = await requireAppRoles(ADMIN_ONLY);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const authUserId = Number(context.params.authUserId);
    if (!authUserId || Number.isNaN(authUserId)) {
      return NextResponse.json({ error: 'Invalid authUserId' }, { status: 400 });
    }

    const body = (await req.json()) as UpdateRolesBody;
    if (!body || !Array.isArray(body.roleCodes)) {
      return NextResponse.json(
        { error: 'roleCodes is required and must be an array' },
        { status: 400 },
      );
    }

    const normalisedCodes = body.roleCodes.map((code) =>
      String(code).trim().toUpperCase(),
    ) as AppRoleCode[];

    await setUserRoles(authUserId, normalisedCodes);

    const updated = await getAuthUserWithRolesById(authUserId);
    if (!updated) {
      return NextResponse.json({ error: 'User not found after update' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating user roles:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update user roles' },
      { status: 500 },
    );
  }
}

