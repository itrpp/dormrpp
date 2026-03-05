'use client';

import { useEffect, useMemo, useState } from 'react';

type TenantMappingRow = {
  auth_user_id: number;
  ad_username: string;
  display_name: string;
  department: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  room_number: string | null;
  building_name: string | null;
  /** สิทธิ์จาก auth_roles.name_th (คั่นด้วย comma ถ้ามีหลาย role) */
  role_names_th: string | null;
};

type TenantSearchRow = {
  tenant_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  last_room_number?: string | null;
  last_contract_status?: string | null;
};

export default function TenantAuthUsersClient() {
  const [rows, setRows] = useState<TenantMappingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAuthUser, setSelectedAuthUser] = useState<TenantMappingRow | null>(
    null,
  );
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantResults, setTenantResults] = useState<TenantSearchRow[]>([]);
  const [isSearchingTenants, setIsSearchingTenants] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchName, setSearchName] = useState('');
  const [searchRoom, setSearchRoom] = useState('');
  const [isSyncingFromAd, setIsSyncingFromAd] = useState(false);

  const loadRows = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/tenant-auth-users');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'โหลดข้อมูลไม่สำเร็จ');
      }
      const data: TenantMappingRow[] = await res.json();
      setRows(data);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

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
      await loadRows();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Sync ผู้ใช้จาก AD ไม่สำเร็จ');
    } finally {
      setIsSyncingFromAd(false);
    }
  };

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const nameA = a.display_name || a.ad_username;
        const nameB = b.display_name || b.ad_username;
        return nameA.localeCompare(nameB, 'th', { sensitivity: 'base' });
      }),
    [rows],
  );

  const filteredRows = useMemo(() => {
    let list = sortedRows;
    const nameKw = searchName.trim().toLowerCase();
    const roomKw = searchRoom.trim().toLowerCase();
    if (nameKw) {
      list = list.filter(
        (r) =>
          String(r.display_name ?? '').toLowerCase().includes(nameKw) ||
          String(r.ad_username ?? '').toLowerCase().includes(nameKw) ||
          String(r.department ?? '').toLowerCase().includes(nameKw),
      );
    }
    if (roomKw) {
      list = list.filter(
        (r) =>
          String(r.room_number ?? '').toLowerCase().includes(roomKw) ||
          String(r.building_name ?? '').toLowerCase().includes(roomKw) ||
          String(r.tenant_name ?? '').toLowerCase().includes(roomKw),
      );
    }
    return list;
  }, [sortedRows, searchName, searchRoom]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    setCurrentPage((p) => (p > maxPage ? 1 : p));
  }, [filteredRows.length]);

  const handleSearchTenants = async () => {
    if (!tenantQuery.trim()) {
      setTenantResults([]);
      return;
    }
    setIsSearchingTenants(true);
    try {
      const res = await fetch(`/api/tenants?q=${encodeURIComponent(tenantQuery)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ค้นหาผู้เช่าไม่สำเร็จ');
      }
      const data: any[] = await res.json();
      const mapped: TenantSearchRow[] = data.map((t) => ({
        tenant_id: t.tenant_id,
        first_name: t.first_name,
        last_name: t.last_name,
        email: t.email ?? null,
        phone: t.phone ?? null,
        last_room_number: t.last_room_number ?? null,
        last_contract_status: t.last_contract_status ?? null,
      }));
      setTenantResults(mapped);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ค้นหาผู้เช่าไม่สำเร็จ');
    } finally {
      setIsSearchingTenants(false);
    }
  };

  const handleSaveMapping = async (tenantId: number | null) => {
    if (!selectedAuthUser) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/tenant-auth-users/${selectedAuthUser.auth_user_id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'บันทึก mapping ไม่สำเร็จ');
      }
      const updated: TenantMappingRow = await res.json();
      setRows((prev) =>
        prev.map((row) =>
          row.auth_user_id === updated.auth_user_id ? updated : row,
        ),
      );
      setSelectedAuthUser(updated);
      if (!tenantId) {
        setTenantResults([]);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'บันทึก mapping ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            แมปผู้ใช้ AD ↔ ผู้เช่าหอพัก
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            ใช้หน้าจอนี้ผูก `auth_users` (AD) เข้ากับ `tenants` เพื่อให้ผู้เช่าเห็นบิลของตัวเองเท่านั้น
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={syncUsersFromAd}
            disabled={isSyncingFromAd}
            className="px-3 py-2 rounded-md border text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isSyncingFromAd ? 'กำลัง Sync จาก AD...' : 'Sync ผู้ใช้จาก AD'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ตารางผู้ใช้ AD */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                รายชื่อผู้ใช้ AD ทั้งหมด
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-600 whitespace-nowrap">ชื่อ</label>
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="ชื่อ, username, แผนก"
                  className="border rounded-md px-2 py-1.5 text-xs w-40 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-600 whitespace-nowrap">ห้อง</label>
                <input
                  type="text"
                  value={searchRoom}
                  onChange={(e) => setSearchRoom(e.target.value)}
                  placeholder="เลขห้อง, อาคาร, ผู้เช่า"
                  className="border rounded-md px-2 py-1.5 text-xs w-40 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                กำลังโหลดข้อมูล...
              </div>
            ) : sortedRows.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                ยังไม่มีผู้ใช้ในตาราง auth_users
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-12">
                      NO.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      แผนก
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      ชื่อแสดงผล
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      สิทธิ์
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      ผู้เช่าที่ผูกไว้
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center text-sm text-gray-500"
                      >
                        ไม่พบรายการตามเงื่อนไขค้นหา
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => {
                    const isSelected =
                      selectedAuthUser?.auth_user_id === row.auth_user_id;
                    const rowNo = (currentPage - 1) * PAGE_SIZE + index + 1;
                    return (
                      <tr
                        key={row.auth_user_id}
                        className={isSelected ? 'bg-blue-50' : undefined}
                      >
                        <td className="px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">
                          {rowNo}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                          {row.department ?? '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                          {row.display_name}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {row.role_names_th ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {row.tenant_id ? (
                            <div className="space-y-1">
                              <div className="font-medium">
                                {row.tenant_name || `tenant_id = ${row.tenant_id}`}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {row.tenant_email && <span>{row.tenant_email}</span>}
                                {row.room_number && (
                                  <span>
                                    {row.tenant_email ? ' · ' : ''}
                                    ห้อง {row.room_number}
                                    {row.building_name ? ` (${row.building_name})` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400">
                              ยังไม่ได้กำหนดผู้เช่า
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuthUser(row);
                              setTenantQuery('');
                              setTenantResults([]);
                            }}
                            className={`px-2 py-1 rounded text-xs border ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-blue-700 border-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            {isSelected ? 'กำลังแก้ไข' : 'เลือก / แก้ไข'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            )}
          </div>
          {sortedRows.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
              <span>
                แสดง{' '}
                {filteredRows.length === 0
                  ? '0'
                  : (currentPage - 1) * PAGE_SIZE + 1}{' '}
                -{' '}
                {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} จาก{' '}
                {filteredRows.length} รายการ
                {(searchName.trim() || searchRoom.trim()) && (
                  <span className="text-gray-400 ml-1">(กรองแล้ว)</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>

        {/* แผงแก้ไข mapping */}
        <div className="bg-white shadow rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">
            จัดการ Mapping ผู้ใช้ ↔ ผู้เช่า
          </h2>
          {!selectedAuthUser ? (
            <p className="text-xs text-gray-500">
              เลือกผู้ใช้จากตารางด้านซ้ายเพื่อเริ่มกำหนดผู้เช่า
            </p>
          ) : (
            <>
              <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
                <p className="text-xs text-gray-500">ผู้ใช้ AD ที่เลือก</p>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedAuthUser.display_name}
                </p>
                <p className="text-[11px] text-gray-500">
                  Username: {selectedAuthUser.ad_username}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  ค้นหาผู้เช่า (ชื่อ, เลขห้อง, อีเมล, เบอร์โทร)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tenantQuery}
                    onChange={(e) => setTenantQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchTenants()}
                    className="flex-1 border rounded-md px-3 py-2 text-xs"
                    placeholder="เช่น ชื่อ-สกุล, เลขห้อง 101, อีเมล"
                  />
                  <button
                    type="button"
                    onClick={handleSearchTenants}
                    disabled={isSearchingTenants}
                    className="px-3 py-2 rounded-md border text-xs bg-white hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    {isSearchingTenants ? 'กำลังค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                {tenantResults.length === 0 ? (
                  <p className="p-3 text-xs text-gray-400">
                    ยังไม่มีผลลัพธ์ค้นหา
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 text-xs">
                    {tenantResults.map((t) => {
                      const isMapped =
                        selectedAuthUser.tenant_id === t.tenant_id;
                      return (
                        <li
                          key={t.tenant_id}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {t.first_name} {t.last_name}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {t.email && <span>{t.email}</span>}
                              {t.last_room_number && (
                                <span>
                                  {t.email ? ' · ' : ''}
                                  ห้องล่าสุด {t.last_room_number}
                                </span>
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSaveMapping(t.tenant_id)}
                            className={`px-2 py-1 rounded text-[11px] border whitespace-nowrap ${
                              isMapped
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-white text-green-700 border-green-600 hover:bg-green-50'
                            }`}
                          >
                            {isMapped ? 'ผูกแล้ว' : 'ผูกผู้ใช้นี้'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {selectedAuthUser.tenant_id && (
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveMapping(null)}
                    className="px-3 py-2 rounded-md border border-red-600 text-xs text-red-700 hover:bg-red-50"
                  >
                    ลบ mapping / ยกเลิกการผูกผู้เช่า
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

