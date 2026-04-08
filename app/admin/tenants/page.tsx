// app/admin/tenants/page.tsx - List & manage tenants
import { getAllTenantsForAdmin, type AdminTenantRow } from '@/lib/repositories/tenants';
import { getResolvedAllowedBuildingIdsForServerUser } from '@/lib/auth/server-building-scope';
import AdminTenantsClient from './AdminTenantsClient';

export const dynamic = 'force-dynamic';

export default async function AdminTenantsPage() {
  let tenants: AdminTenantRow[] = [];
  let allowedBuildingIds: number[] | undefined;
  try {
    allowedBuildingIds =
      await getResolvedAllowedBuildingIdsForServerUser();
    tenants = await getAllTenantsForAdmin(allowedBuildingIds);
  } catch (error: any) {
    // Silent fallback - return empty array ถ้าเกิด error
    tenants = [];
  }
  return (
    <AdminTenantsClient
      initialTenants={tenants}
      visibleBuildingIds={allowedBuildingIds}
    />
  );
}

