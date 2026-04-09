import TenantBillsClient from './TenantBillsClient';
import { getSession } from '@/lib/auth/session';
import { getAppRolesForSessionUser, type AppRoleCode } from '@/lib/auth/app-roles';
import { getAuthRoles } from '@/lib/repositories/auth-users';
import AdminLayoutClient from '@/components/AdminLayout';
import { redirect } from 'next/navigation';

// หน้า /my/bills สำหรับผู้เช่า ใช้เมนูร่วมกับ lib/menu-items.ts ผ่าน AdminLayoutClient
export default async function MyBillsPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const appRoleCodes =
    session.username
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
      sessionName={session.name}
      sessionRole={session.role}
      appRoleCodes={appRoleCodes}
      sessionRoleLabel={sessionRoleLabel}
    >
      <TenantBillsClient />
    </AdminLayoutClient>
  );
}

