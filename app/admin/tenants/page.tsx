// app/admin/tenants/page.tsx - List & manage tenants
import { getAllTenantsForAdmin } from '@/lib/repositories/tenants';
import AdminTenantsClient from './AdminTenantsClient';

export default async function AdminTenantsPage() {
  const tenants = await getAllTenantsForAdmin();
  return <AdminTenantsClient initialTenants={tenants} />;
}

