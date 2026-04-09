'use client';

import { useEffect, useState, useMemo } from 'react';
import type { AdminAuthUserRow, AuthRoleRow } from '@/lib/repositories/auth-users';
import { ADMIN_SURFACE_CARD } from '@/lib/ui/admin-surface';

type Props = {
  initialUsers: AdminAuthUserRow[];
  /** รายการสิทธิ์จากตาราง auth_roles เท่านั้น (แหล่งความจริงเดียว) */
  initialRoles: AuthRoleRow[];
};

/** ค่าฟิลเตอร์สิทธิ์: all = ทั้งหมด, yes = มีสิทธิ์, no = ไม่มีสิทธิ์ */
type RoleFilterValue = 'all' | 'yes' | 'no';

export default function AdminUserRolesClient({ initialUsers, initialRoles }: Props) {
  const [users, setUsers] = useState<AdminAuthUserRow[]>(initialUsers);
  const [search, setSearch] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterRoleByCode, setFilterRoleByCode] = useState<Record<string, RoleFilterValue>>({});
  const [loadingIds, setLoadingIds] = useState<number[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingFromAd, setIsSyncingFromAd] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const sortedRoles = useMemo(
    () => [...initialRoles].sort((a, b) => a.auth_role_id - b.auth_role_id),
    [initialRoles],
  );

  const filteredUsers = useMemo(() => {
    let list = users;
    const searchKw = search.trim().toLowerCase();
    if (searchKw) {
      list = list.filter((u) => {
        const name = u.display_name?.toLowerCase() || '';
        const username = u.ad_username?.toLowerCase() || '';
        const dept = (u.department || '').toLowerCase();
        return name.includes(searchKw) || username.includes(searchKw) || dept.includes(searchKw);
      });
    }
    const nameKw = filterName.trim().toLowerCase();
    if (nameKw) {
      list = list.filter((u) =>
        (u.display_name?.toLowerCase() || '').includes(nameKw),
      );
    }
    const deptKw = filterDepartment.trim().toLowerCase();
    if (deptKw) {
      list = list.filter((u) =>
        (u.department || '').toLowerCase().includes(deptKw),
      );
    }
    sortedRoles.forEach((role) => {
      const val = filterRoleByCode[role.code] ?? 'all';
      if (val === 'all') return;
      list = list.filter((u) => {
        const has = (u.roles as readonly string[]).includes(role.code);
        return val === 'yes' ? has : !has;
      });
    });
    return list;
  }, [users, search, filterName, filterDepartment, filterRoleByCode, sortedRoles]);

  const setRoleFilter = (roleCode: string, value: RoleFilterValue) => {
    setFilterRoleByCode((prev) =>
      value === 'all' ? (() => { const next = { ...prev }; delete next[roleCode]; return next; })() : { ...prev, [roleCode]: value },
    );
  };

  const isLoadingUser = (id: number) => loadingIds.includes(id);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterName, filterDepartment, filterRoleByCode, users.length]);

  const toggleRole = async (user: AdminAuthUserRow, roleCode: string) => {
    const hasRole = (user.roles as readonly string[]).includes(roleCode);
    const nextRoles = hasRole
      ? user.roles.filter((r) => r !== roleCode)
      : [...user.roles, roleCode];

    setLoadingIds((prev) => [...prev, user.auth_user_id]);

    try {
      const res = await fetch(`/api/admin/auth-users/${user.auth_user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleCodes: nextRoles }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'อัปเดตสิทธิ์ไม่สำเร็จ');
      }

      const updated: AdminAuthUserRow = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.auth_user_id === updated.auth_user_id ? updated : u)),
      );
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'อัปเดตสิทธิ์ไม่สำเร็จ');
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== user.auth_user_id));
    }
  };

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/auth-users');
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'โหลดข้อมูลไม่สำเร็จ');
      }
      const data: AdminAuthUserRow[] = await res.json();
      setUsers(data);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setIsRefreshing(false);
    }
  };

  const syncUsersFromAd = async () => {
    if (!window.confirm('ต้องการ Sync ผู้ใช้จาก AD group DromRpp เข้าสู่ตาราง auth_users และให้สิทธิ์ USER อัตโนมัติหรือไม่?')) {
      return;
    }
    setIsSyncingFromAd(true);
    try {
      const res = await fetch('/api/admin/sync-auth-users-from-ad', {
        method: 'POST',
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Sync ผู้ใช้จาก AD ไม่สำเร็จ');
      }
      const result = await res.json().catch(() => ({}));
      const total = result.totalFromAd ?? 0;
      const processed = result.processed ?? 0;
      alert(`Sync ผู้ใช้จาก AD สำเร็จ\nดึงจาก AD: ${total} รายการ\nอัปเดตในระบบ: ${processed} รายการ`);
      await refresh();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Sync ผู้ใช้จาก AD ไม่สำเร็จ');
    } finally {
      setIsSyncingFromAd(false);
    }
  };

  useEffect(() => {
    // sync initialUsers -> state เมื่อ mount ครั้งแรก
    setUsers(initialUsers);
  }, [initialUsers]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการสิทธิ์ผู้ใช้ (RBAC)</h1>
          <p className="text-xs text-gray-500 mt-1">
            เฉพาะผู้ดูแลระบบ (ADMIN) เท่านั้นที่สามารถปรับสิทธิ์ได้
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="ค้นหาชื่อ, username, แผนก..."
            className="border rounded-md px-3 py-2 text-sm w-full md:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-md border text-sm bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
          >
            {isRefreshing ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
          <button
            onClick={syncUsersFromAd}
            disabled={isSyncingFromAd}
            className="px-3 py-2 rounded-md border text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isSyncingFromAd ? 'กำลัง Sync จาก AD...' : 'Sync ผู้ใช้จาก AD'}
          </button>
        </div>
      </div>

      <div className={`${ADMIN_SURFACE_CARD} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[140px]">
                ชื่อ-นามสกุล
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[120px]">
                แผนก
              </th>
              {sortedRoles.map((role) => (
                <th
                  key={role.auth_role_id}
                  className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase"
                  title={role.description ?? undefined}
                >
                  {role.name_th || role.code}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-100/80">
              <th className="px-2 py-1.5" />
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  placeholder="ฟิลเตอร์ชื่อ..."
                  className="w-full border rounded px-2 py-1 text-xs"
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                />
              </th>
              <th className="px-2 py-1.5">
                <input
                  type="text"
                  placeholder="ฟิลเตอร์แผนก..."
                  className="w-full border rounded px-2 py-1 text-xs"
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                />
              </th>
              {sortedRoles.map((role) => (
                <th key={role.auth_role_id} className="px-2 py-1.5">
                  <select
                    className="w-full border rounded px-1 py-1 text-xs bg-white min-w-[70px]"
                    value={filterRoleByCode[role.code] ?? 'all'}
                    onChange={(e) =>
                      setRoleFilter(role.code, e.target.value as RoleFilterValue)
                    }
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="yes">มีสิทธิ์</option>
                    <option value="no">ไม่มีสิทธิ์</option>
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + sortedRoles.length}
                  className="px-4 py-4 text-center text-sm text-gray-500"
                >
                  ยังไม่มีข้อมูลผู้ใช้ (ระบบจะสร้างรายการเมื่อมีการล็อกอินผ่าน AD)
                </td>
              </tr>
            ) : (
              paginatedUsers.map((user, index) => (
                <tr key={user.auth_user_id}>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                    {(currentPage - 1) * PAGE_SIZE + index + 1}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                    {user.display_name}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-600">
                    {user.department || '-'}
                  </td>
                  {sortedRoles.map((role) => (
                    <td
                      key={role.auth_role_id}
                      className="px-4 py-2 text-center align-middle"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={(user.roles as readonly string[]).includes(role.code)}
                        disabled={isLoadingUser(user.auth_user_id)}
                        onChange={() => toggleRole(user, role.code)}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredUsers.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div>
            แสดง{' '}
            {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredUsers.length)} -{' '}
            {Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} จาก{' '}
            {filteredUsers.length} รายการ
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ก่อนหน้า
            </button>
            <span>
              หน้า {currentPage} / {totalPages}
            </span>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

