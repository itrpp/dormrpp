// app/admin/layout.tsx - Admin layout with sidebar navigation
import { ReactNode } from 'react';
import { getSession } from '@/lib/auth/session';
import { getAppRolesForSessionUser, type AppRoleCode } from '@/lib/auth/app-roles';
import { getAuthRoles } from '@/lib/repositories/auth-users';
import AdminLayoutClient from '@/components/AdminLayout';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const appRoleCodes =
    session && session.username
      ? await getAppRolesForSessionUser(session).catch(() => [])
      : [];

  // หาชื่อสิทธิ์หลักจาก auth_roles.name_th ตามสิทธิ์ที่ผู้ใช้มี
  let sessionRoleLabel: string | undefined;
  try {
    const allRoles = await getAuthRoles();
    const priority: AppRoleCode[] = [
      'ADMIN',
      'SUPERUSER_RP',
      'SUPERUSER_MED',
      'FINANCE',
      'FINANCE-R',
      'FINANCE-M',
      'TENANT_RP',
      'TENANT_MED',
    ];
    const primaryCode =
      priority.find((code) => appRoleCodes.includes(code)) || appRoleCodes[0];
    const primaryRole = primaryCode
      ? allRoles.find((r) => r.code === primaryCode)
      : undefined;
    sessionRoleLabel = primaryRole?.name_th;
  } catch {
    sessionRoleLabel = undefined;
  }

  return (
    <AdminLayoutClient
      sessionName={session?.name}
      sessionRole={session?.role}
      appRoleCodes={appRoleCodes}
      sessionRoleLabel={sessionRoleLabel}
    >
      {children}
    </AdminLayoutClient>
  );
}

