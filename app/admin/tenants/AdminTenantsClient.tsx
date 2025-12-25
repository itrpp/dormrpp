'use client';

import { useMemo, useState, useEffect } from 'react';
import type { AdminTenantRow } from '@/lib/repositories/tenants';

type Props = {
  initialTenants: AdminTenantRow[];
};

type TenantForm = {
  tenant_id?: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  room_number: string;
  status: string;
  move_in_date: string; // yyyy-mm-dd
};

export default function AdminTenantsClient({ initialTenants }: Props) {
  const [tenants, setTenants] = useState(initialTenants);

  // state สำหรับ search & filter
  const [searchText, setSearchText] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('active'); // Default: แสดงเฉพาะผู้เช่าที่ active

  // state สำหรับ pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // state สำหรับ modal (แก้ไขเท่านั้น)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<TenantForm>({
    tenant_id: undefined,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    room_number: '',
    status: 'active',
    move_in_date: '',
  });

  // สร้าง list อาคาร / ชั้น จากข้อมูลจริง
  const buildingOptions = useMemo(() => {
    const map = new Map<number, string>();
    tenants.forEach((t) => {
      if (t.building_id && t.building_name) {
        map.set(t.building_id, t.building_name);
      }
    });
    return Array.from(map.entries());
  }, [tenants]);

  const floorOptions = useMemo(() => {
    const setFloors = new Set<number>();
    tenants.forEach((t) => {
      if (t.floor_no != null) setFloors.add(t.floor_no);
    });
    return Array.from(setFloors.values()).sort((a, b) => a - b);
  }, [tenants]);

  // ฟิลเตอร์ + ค้นหา
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      // ตรวจสอบข้อมูลพื้นฐานก่อน
      if (!t.tenant_id || !t.first_name || !t.last_name) {
        return false; // กรองข้อมูลที่ไม่สมบูรณ์ออก
      }

      // 1) filter สถานะ - ต้องตรงกันเป๊ะ
      if (selectedStatus !== 'all') {
        const tenantStatus = (t.status || 'inactive').toLowerCase().trim();
        const selectedStatusLower = selectedStatus.toLowerCase().trim();
        if (tenantStatus !== selectedStatusLower) {
          return false;
        }
      }

      // 2) filter อาคาร - กรองข้อมูลที่ไม่มี building_id ออกด้วย
      if (selectedBuilding !== 'all') {
        // ถ้าไม่มี building_id หรือ building_id ไม่ตรงกับที่เลือก → กรองออก
        if (!t.building_id || String(t.building_id) !== String(selectedBuilding)) {
          return false;
        }
      }

      // 3) filter ชั้น - กรองข้อมูลที่ไม่มี floor_no ออกด้วย
      if (selectedFloor !== 'all') {
        // ถ้าไม่มี floor_no หรือ floor_no ไม่ตรงกับที่เลือก → กรองออก
        if (t.floor_no == null || String(t.floor_no) !== String(selectedFloor)) {
          return false;
        }
      }

      // 4) search ชื่อ-นามสกุล
      if (searchText.trim() !== '') {
        const keyword = searchText.trim().toLowerCase();
        const fullName = `${t.first_name || ''} ${t.last_name || ''}`.toLowerCase().trim();
        if (!fullName.includes(keyword)) {
          return false;
        }
      }

      return true;
    });
  }, [tenants, selectedStatus, selectedBuilding, selectedFloor, searchText]);

  // Reset to page 1 when filters or itemsPerPage change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, selectedBuilding, selectedFloor, searchText, itemsPerPage]);

  // คำนวณ pagination
  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTenants = filteredTenants.slice(startIndex, endIndex);

  // Functions for pagination
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // สร้าง array ของหมายเลขหน้า
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // ถ้ามีหน้าไม่มาก แสดงทั้งหมด
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // ถ้ามีหลายหน้า แสดงแบบย่อ
      if (currentPage <= 3) {
        // หน้าแรก
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // หน้าสุดท้าย
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // ตรงกลาง
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  // เปิด modal แก้ไข
  const openEditModal = (t: AdminTenantRow) => {
    // Handle move_in_date - อาจเป็น string หรือ Date object
    let moveInDateStr = '';
    if (t.move_in_date) {
      if (typeof t.move_in_date === 'string') {
        // ถ้าเป็น string ให้ตัดเอาแค่ yyyy-mm-dd
        moveInDateStr = t.move_in_date.substring(0, 10);
      } else {
        // ถ้าเป็น type อื่น (เช่น Date object) ให้แปลงเป็น Date ก่อน
        try {
          const date = new Date(t.move_in_date as any);
          if (!isNaN(date.getTime())) {
            moveInDateStr = date.toISOString().substring(0, 10);
          }
        } catch (e) {
          // ถ้าแปลงไม่ได้ให้เป็น string ว่าง
          moveInDateStr = '';
        }
      }
    }
    
    setForm({
      tenant_id: t.tenant_id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email ?? '',
      phone: t.phone ?? '',
      room_number: t.room_number ?? '',
      status: t.status ?? 'inactive',
      move_in_date: moveInDateStr,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // submit ฟอร์ม (แก้ไขเท่านั้น) - แก้ไขได้เฉพาะ 4 ฟิลด์: ชื่อ, นามสกุล, อีเมล, เบอร์โทร
  const handleSubmit = async () => {
    try {
      if (!form.tenant_id) {
        alert('ไม่พบ tenant_id');
        return;
      }

      // ตรวจสอบรูปแบบอีเมล (ถ้ามีการกรอก)
      if (form.email && form.email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(form.email.trim())) {
          alert('รูปแบบอีเมลไม่ถูกต้อง กรุณากรอกอีเมลให้ถูกต้อง (เช่น example@email.com)');
          return;
        }
      }

      // ส่งข้อมูลที่อนุญาตให้แก้ไข: ชื่อ, นามสกุล, อีเมล, เบอร์โทร, และสถานะ
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email.trim() || null, // trim และแปลงเป็น null ถ้าว่าง
        phone: form.phone,
        status: form.status, // เพิ่มการแก้ไขสถานะ
      };
      
        const res = await fetch(`/api/tenants/${form.tenant_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Update tenant failed');
        }
      
        const updated: AdminTenantRow = await res.json();
        setTenants((prev) =>
          prev.map((t) => (t.tenant_id === updated.tenant_id ? updated : t))
        );

      setIsModalOpen(false);
      alert('แก้ไขข้อมูลผู้เช่าสำเร็จ');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  };

  // soft delete
  const handleSoftDelete = async (tenantId: number) => {
    if (!confirm('ยืนยันการลบผู้เช่า (soft delete)?')) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Delete failed');
      }
      setTenants((prev) => prev.filter((t) => t.tenant_id !== tenantId));
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ลบไม่สำเร็จ');
    }
  };

  return (
    <div>
      {/* Header + ปุ่มเพิ่ม */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">จัดการผู้เช่า</h1>
        <div className="flex gap-2">
          <a
            href="/admin/tenants/add"
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
        >
            เพิ่มผู้เช่า
          </a>
        </div>
      </div>

      {/* แถว search + filter */}
      <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-col lg:flex-row gap-4 lg:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ค้นหาชื่อ-นามสกุล
          </label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="พิมพ์ชื่อหรือนามสกุล..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            อาคาร
          </label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
          >
            <option value="all">ทุกอาคาร</option>
            {buildingOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ชั้น
          </label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedFloor}
            onChange={(e) => setSelectedFloor(e.target.value)}
          >
            <option value="all">ทุกชั้น</option>
            {floorOptions.map((f) => (
              <option key={f} value={f}>
                ชั้น {f}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            สถานะ
          </label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="active">ปัจจุบันพักอยู่ (active)</option>
            <option value="inactive">ไม่พักแล้ว (inactive)</option>
            <option value="pending">รอเข้าพัก (pending)</option>
            <option value="cancelled">ยกเลิกการเช่า (cancelled)</option>
            <option value="other">อื่นๆ (other)</option>
          </select>
        </div>
      </div>

      {/* แถวแสดงจำนวนและเลือกจำนวนแสดงผล */}
      <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-gray-700">
          แสดง {startIndex + 1} - {Math.min(endIndex, filteredTenants.length)} จาก {filteredTenants.length} รายการ
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">แสดงต่อหน้า:</label>
          <select
            className="border rounded-md px-3 py-1 text-sm"
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1); // Reset to first page when changing items per page
            }}
          >
            <option value={15}>15</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* ตารางผู้เช่า */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                No.
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ชื่อ-นามสกุล
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ห้องพัก
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                อีเมล
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                เบอร์โทร
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                วันที่เข้าพัก
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                สถานะ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                การจัดการ
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedTenants.map((tenant, index) => (
              <tr key={tenant.tenant_id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                  {startIndex + index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {tenant.first_name} {tenant.last_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tenant.building_name ?? '-'}{' '}
                  {tenant.room_number ? `- ห้อง ${tenant.room_number}` : ''}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tenant.email ?? '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tenant.phone ?? '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tenant.move_in_date
                    ? new Date(tenant.move_in_date).toLocaleDateString('th-TH')
                    : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      (tenant.status || 'inactive').toLowerCase() === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {(tenant.status || 'inactive').toLowerCase() === 'active' 
                      ? 'active' 
                      : 'inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    className="text-blue-600 hover:text-blue-900 mr-3"
                    onClick={() => openEditModal(tenant)}
                  >
                    แก้ไข
                  </button>
                  {(tenant.status || 'inactive').toLowerCase() === 'inactive' && (
                    <button
                      className="text-red-600 hover:text-red-900"
                      onClick={() => handleSoftDelete(tenant.tenant_id)}
                    >
                      ลบ
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {paginatedTenants.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  ไม่พบข้อมูลผู้เช่า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white shadow rounded-lg p-4 mt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-700">
              แสดง {startIndex + 1} - {Math.min(endIndex, filteredTenants.length)} จาก {filteredTenants.length} รายการ
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevious}
                disabled={currentPage === 1}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ก่อนหน้า
              </button>

              <div className="flex items-center gap-1">
                {getPageNumbers().map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="px-2 text-gray-500">
                        ...
                      </span>
                    );
                  }
                  const pageNum = page as number;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goToNext}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal แก้ไขผู้เช่า */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              แก้ไขข้อมูลผู้เช่า
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">ชื่อ</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.first_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">นามสกุล</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.last_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm mb-1">อีเมล</label>
                <input
                  type="email"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="example@email.com"
                />
                {form.email && form.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && (
                  <p className="text-xs text-red-500 mt-1">รูปแบบอีเมลไม่ถูกต้อง</p>
                )}
              </div>
              <div>
                <label className="block text-sm mb-1">เบอร์โทร</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm mb-1">สถานะ</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="active">active (ปัจจุบันพักอยู่)</option>
                  <option value="inactive">inactive (ไม่พักแล้ว)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-md border"
                onClick={closeModal}
              >
                ยกเลิก
              </button>
              <button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                onClick={handleSubmit}
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

