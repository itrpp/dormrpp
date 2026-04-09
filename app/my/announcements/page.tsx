import { getSession } from '@/lib/auth/session';
import { getAppRolesForSessionUser, type AppRoleCode } from '@/lib/auth/app-roles';
import { getAuthRoles } from '@/lib/repositories/auth-users';
import AdminLayoutClient from '@/components/AdminLayout';
import AnnouncementsClient from '@/app/announcements/AnnouncementsClient';

export default async function TenantAnnouncementsPage() {
  const session = await getSession();
  const appRoleCodes =
    session && session.username
      ? await getAppRolesForSessionUser(session).catch(() => [])
      : [];

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
      'USER',
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
      <AnnouncementsClient />
    </AdminLayoutClient>
  );
}


