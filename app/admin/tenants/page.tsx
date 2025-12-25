// app/admin/tenants/page.tsx - List & manage tenants
import { getAllTenantsForAdmin, type AdminTenantRow } from '@/lib/repositories/tenants';
import AdminTenantsClient from './AdminTenantsClient';

export default async function AdminTenantsPage() {
  let tenants: AdminTenantRow[] = [];
  try {
    tenants = await getAllTenantsForAdmin();
  } catch (error: any) {
    // Silent fallback - return empty array ถ้าเกิด error
    tenants = [];
  }
  return <AdminTenantsClient initialTenants={tenants} />;
}

