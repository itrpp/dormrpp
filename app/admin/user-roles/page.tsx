import AdminUserRolesClient from './AdminUserRolesClient';
import {
  getAllAuthUsersWithRoles,
  getAuthRoles,
  type AdminAuthUserRow,
  type AuthRoleRow,
} from '@/lib/repositories/auth-users';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * หน้าจัดการสิทธิ์ผู้ใช้: ข้อมูลและสิทธิ์อ้างอิงจาก auth_users + auth_user_roles + auth_roles เท่านั้น
 * รายการสิทธิ์ที่แสดงดึงจากตาราง auth_roles เท่านั้น
 */
export default async function AdminUserRolesPage() {
  const authResult = await requireAuth({ requiredRole: ['admin'] });
  if (!authResult.authorized) {
    return <AdminUserRolesClient initialUsers={[]} initialRoles={[]} />;
  }

  let users: AdminAuthUserRow[] = [];
  let roles: AuthRoleRow[] = [];
  try {
    [users, roles] = await Promise.all([getAllAuthUsersWithRoles(), getAuthRoles()]);
  } catch {
    users = [];
    roles = [];
  }

  return <AdminUserRolesClient initialUsers={users} initialRoles={roles} />;
}

