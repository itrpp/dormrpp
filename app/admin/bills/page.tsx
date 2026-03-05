// app/admin/bills/page.tsx - หน้าจัดการบิลสำหรับแอดมิน/เจ้าหน้าที่การเงิน
import { redirect } from 'next/navigation';
import AdminBillsClient from './AdminBillsClient';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';

// สิทธิ์ที่เข้าถึงหน้าจัดการบิลได้ (ต้องตรงกับ API /api/bills, /api/bills/detailed ฯลฯ)
const BILL_ACCESS_ROLES: AppRoleCode[] = [
  'ADMIN',        // ผู้ดูแลระบบ
  'FINANCE',      // เจ้าหน้าที่การเงิน
  'SUPERUSER_RP', // Superuser หอพักรวงผึ้ง (ถ้าต้องการให้เห็น)
  'SUPERUSER_MED' // Superuser หอพักแพทยศาสตร์ (ถ้าต้องการให้เห็น)
];

export default async function AdminBillsPage() {
  const authResult = await requireAppRoles(BILL_ACCESS_ROLES);

  if (!authResult.authorized) {
    if (authResult.redirect) {
      redirect(authResult.redirect);
    }
    return null;
  }

  return <AdminBillsClient />;
}

