import { redirect } from 'next/navigation';
import TenantAuthUsersClient from '@/app/admin/tenant-mappings/TenantAuthUsersClient';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';

const TENANT_MAPPING_ROLES: AppRoleCode[] = [
  'ADMIN',
  'SUPERUSER_RP',
  'SUPERUSER_MED',
];

export default async function TenantMappingsPage() {
  const authResult = await requireAppRoles(TENANT_MAPPING_ROLES);
  if (!authResult.authorized) {
    if (authResult.redirect) redirect(authResult.redirect);
    return null;
  }

  return <TenantAuthUsersClient />;
}

