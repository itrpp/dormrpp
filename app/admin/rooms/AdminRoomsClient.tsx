'use client';

import { useMemo, useState, useEffect } from 'react';
import type { RoomWithDetails } from '@/lib/repositories/rooms';
import type { Building, RoomType } from '@/types/db';

type Props = {
  initialRooms: RoomWithDetails[];
};

type RoomForm = {
  room_id?: number;
  building_id: string;
  room_number: string;
  floor_no: string;
  status: string;
};

export default function AdminRoomsClient({ initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms);
  
  // state สำหรับ buildings และ room types ที่ดึงจาก API
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  // state สำหรับ filter
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // state สำหรับ pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // state สำหรับ modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<RoomForm>({
    building_id: '',
    room_number: '',
    floor_no: '',
    status: 'available',
  });

  // state สำหรับ modal รายละเอียด
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [roomDetails, setRoomDetails] = useState<{
    room: RoomWithDetails | null;
    tenants: Array<{
      tenant_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      move_in_date: string | null;
      status: string | null;
    }>;
    recentBills: Array<{
      bill_id: number;
      billing_year: number;
      billing_month: number;
      total_amount: number;
      status: string;
      due_date: string;
    }>;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // ดึงข้อมูล buildings และ room types จาก API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [buildingsRes, roomTypesRes] = await Promise.all([
          fetch('/api/buildings'),
          fetch('/api/room-types'),
        ]);

        if (buildingsRes.ok) {
          const buildingsData = await buildingsRes.json();
          setBuildings(buildingsData);
        }

        if (roomTypesRes.ok) {
          const roomTypesData = await roomTypesRes.json();
          setRoomTypes(roomTypesData);
        }
      } catch (error) {
        console.error('Error fetching buildings/room types:', error);
      }
    };

    fetchData();
  }, []);

  // สร้าง list อาคาร / ชั้น / ประเภทห้อง
  const buildingOptions = useMemo(() => {
    // ใช้ข้อมูลจาก API ก่อน ถ้าไม่มีให้ใช้ข้อมูลจาก rooms
    if (buildings.length > 0) {
      return buildings.map((b) => [b.building_id, b.name_th] as [number, string]);
    }
    // Fallback: ใช้ข้อมูลจาก rooms
    const map = new Map<number, string>();
    rooms.forEach((r) => {
      if (r.building_id && r.building_name) {
        map.set(r.building_id, r.building_name);
      }
    });
    return Array.from(map.entries());
  }, [buildings, rooms]);

  const floorOptions = useMemo(() => {
    const setFloors = new Set<number>();
    rooms.forEach((r) => {
      if (r.floor_no != null) setFloors.add(r.floor_no);
    });
    return Array.from(setFloors.values()).sort((a, b) => a - b);
  }, [rooms]);

  const roomTypeOptions = useMemo(() => {
    // ใช้ข้อมูลจาก API ก่อน ถ้าไม่มีให้ใช้ข้อมูลจาก rooms
    if (roomTypes.length > 0) {
      return roomTypes.map((rt) => [rt.room_type_id, rt.name_th] as [number, string]);
    }
    // Fallback: ถ้าไม่มี room types จาก API ให้ return array ว่าง
    return [];
  }, [roomTypes]);

  // ฟิลเตอร์
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      // 1) filter อาคาร
      if (selectedBuilding !== 'all') {
        if (!r.building_id || String(r.building_id) !== String(selectedBuilding)) {
          return false;
        }
      }

      // 2) filter ชั้น
      if (selectedFloor !== 'all') {
        if (r.floor_no == null || String(r.floor_no) !== String(selectedFloor)) {
          return false;
        }
      }

      // 3) filter ประเภทห้อง (ลบออกเพราะไม่มี room_type_id ในโครงสร้างใหม่)
      // if (selectedRoomType !== 'all') {
      //   if (!r.room_type_id || String(r.room_type_id) !== String(selectedRoomType)) {
      //     return false;
      //   }
      // }

      // 4) filter สถานะ
      if (selectedStatus !== 'all') {
        const roomStatus = (r.status || '').toLowerCase().trim();
        const selectedStatusLower = selectedStatus.toLowerCase().trim();
        if (roomStatus !== selectedStatusLower) {
          return false;
        }
      }

      return true;
    });
  }, [rooms, selectedBuilding, selectedFloor, selectedStatus]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBuilding, selectedFloor, selectedStatus]);

  // คำนวณ pagination
  const totalPages = Math.ceil(filteredRooms.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRooms = filteredRooms.slice(startIndex, endIndex);

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

  // เปิด modal เพิ่ม
  const openCreateModal = () => {
    setModalMode('create');
    setForm({
      building_id: '',
      room_number: '',
      floor_no: '',
      status: 'available',
    });
    setIsModalOpen(true);
  };

  // เปิด modal แก้ไข
  const openEditModal = (room: RoomWithDetails) => {
    setModalMode('edit');
    setForm({
      room_id: room.room_id,
      building_id: String(room.building_id),
      room_number: room.room_number,
      floor_no: room.floor_no ? String(room.floor_no) : '',
      status: room.status || 'available',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // submit ฟอร์ม (create / edit)
  const handleSubmit = async () => {
    try {
      const payload = {
        building_id: Number(form.building_id),
        room_number: form.room_number,
        floor_no: form.floor_no ? Number(form.floor_no) : null,
        status: form.status,
      };

      if (modalMode === 'create') {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Create room failed');
        }

        const newRoom: RoomWithDetails = await res.json();
        setRooms((prev) => [newRoom, ...prev]);
      } else {
        if (!form.room_id) {
          alert('ไม่พบ room_id');
          return;
        }

        const res = await fetch(`/api/rooms/${form.room_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Update room failed');
        }

        const updated: RoomWithDetails = await res.json();
        setRooms((prev) =>
          prev.map((r) => (r.room_id === updated.room_id ? updated : r))
        );
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  };

  // ลบห้องพัก
  const handleDelete = async (roomId: number) => {
    if (!confirm('ยืนยันการลบห้องพัก?')) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Delete failed');
      }
      setRooms((prev) => prev.filter((r) => r.room_id !== roomId));
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ลบไม่สำเร็จ');
    }
  };

  // แปลงสถานะเป็นภาษาไทย
  const getStatusThai = (status: string | null | undefined): string => {
    if (!status) return '-';
    const statusLower = status.toLowerCase().trim();
    switch (statusLower) {
      case 'available':
        return 'ว่าง';
      case 'occupied':
        return 'มีผู้อาศัย';
      case 'maintenance':
        return 'ซ่อมบำรุง';
      default:
        return status;
    }
  };

  // เปิด modal รายละเอียด
  const openDetailsModal = async (roomId: number) => {
    setSelectedRoomId(roomId);
    setIsDetailsModalOpen(true);
    setIsLoadingDetails(true);

    try {
      const res = await fetch(`/api/rooms/${roomId}/details`);
      if (!res.ok) {
        throw new Error('Failed to fetch room details');
      }
      const data = await res.json();
      setRoomDetails(data);
    } catch (error) {
      console.error('Error fetching room details:', error);
      alert('ไม่สามารถโหลดข้อมูลรายละเอียดห้องได้');
      setIsDetailsModalOpen(false);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const closeDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedRoomId(null);
    setRoomDetails(null);
  };

  // จัดรูปแบบวันที่
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">จัดการห้องพัก</h1>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          เพิ่มห้องพัก
        </button>
      </div>

      {/* แถว filter */}
      <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-col lg:flex-row gap-4 lg:items-end">
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
            <option value="available">ว่าง (available)</option>
            <option value="occupied">มีผู้เช่า (occupied)</option>
            <option value="maintenance">ซ่อมบำรุง (maintenance)</option>
          </select>
        </div>
      </div>

      {/* ตารางห้องพัก */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                No.
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                อาคาร
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ห้อง
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ชั้น
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
            {paginatedRooms.map((room, index) => (
              <tr key={room.room_id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {startIndex + index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {room.building_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {room.room_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {room.floor_no ?? '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      room.status === 'available'
                        ? 'bg-green-100 text-green-800'
                        : room.status === 'occupied'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {getStatusThai(room.status)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    className="text-green-600 hover:text-green-900 mr-3"
                    onClick={() => openDetailsModal(room.room_id)}
                  >
                    รายละเอียด
                  </button>
                  <button
                    className="text-blue-600 hover:text-blue-900 mr-3"
                    onClick={() => openEditModal(room)}
                  >
                    แก้ไข
                  </button>
                  <button
                    className="text-red-600 hover:text-red-900"
                    onClick={() => handleDelete(room.room_id)}
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {paginatedRooms.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  ไม่พบข้อมูลห้องพัก
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
              แสดง {startIndex + 1} - {Math.min(endIndex, filteredRooms.length)} จาก {filteredRooms.length} รายการ
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

      {/* Modal เพิ่ม/แก้ไขห้องพัก */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {modalMode === 'create' ? 'เพิ่มห้องพัก' : 'แก้ไขข้อมูลห้องพัก'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm mb-1">อาคาร</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.building_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, building_id: e.target.value }))
                  }
                >
                  <option value="">เลือกอาคาร</option>
                  {buildingOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">หมายเลขห้อง</label>
                <input
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.room_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, room_number: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm mb-1">ชั้น</label>
                <input
                  type="number"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.floor_no}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, floor_no: e.target.value }))
                  }
                  placeholder="ไม่ระบุ"
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
                  <option value="available">ว่าง (available)</option>
                  <option value="occupied">มีผู้เช่า (occupied)</option>
                  <option value="maintenance">ซ่อมบำรุง (maintenance)</option>
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

      {/* Modal รายละเอียดห้อง */}
      {isDetailsModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">รายละเอียดห้องพัก</h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={closeDetailsModal}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="flex justify-center items-center py-8">
                <div className="text-gray-500">กำลังโหลดข้อมูล...</div>
              </div>
            ) : roomDetails ? (
              <div className="space-y-6">
                {/* ข้อมูลห้อง */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    ข้อมูลห้องพัก
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">อาคาร</p>
                      <p className="font-medium">{roomDetails.room?.building_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">หมายเลขห้อง</p>
                      <p className="font-medium">{roomDetails.room?.room_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">ชั้น</p>
                      <p className="font-medium">
                        {roomDetails.room?.floor_no ? `ชั้น ${roomDetails.room.floor_no}` : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">สถานะ</p>
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          roomDetails.room?.status === 'available'
                            ? 'bg-green-100 text-green-800'
                            : roomDetails.room?.status === 'occupied'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {getStatusThai(roomDetails.room?.status)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ผู้เข้าพัก */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    ผู้เข้าพัก
                  </h3>
                  {roomDetails.tenants && roomDetails.tenants.length > 0 ? (
                    <div className="space-y-3">
                      {roomDetails.tenants.map((tenant) => (
                        <div
                          key={tenant.tenant_id}
                          className="bg-white rounded-lg p-4 border border-gray-200"
                        >
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">ชื่อ-นามสกุล</p>
                              <p className="font-medium">
                                {tenant.first_name} {tenant.last_name}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">อีเมล</p>
                              <p className="font-medium">{tenant.email || '-'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">เบอร์โทร</p>
                              <p className="font-medium">{tenant.phone || '-'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">วันที่เข้าพัก</p>
                              <p className="font-medium">
                                {formatDate(tenant.move_in_date)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">สถานะสัญญา</p>
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  tenant.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {tenant.status === 'active' ? 'ใช้งาน' : tenant.status || '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      ไม่มีผู้เข้าพักในห้องนี้
                    </p>
                  )}
                </div>

                {/* บิลล่าสุด */}
                {roomDetails.recentBills && roomDetails.recentBills.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3 text-gray-800">
                      บิลล่าสุด (3 รายการ)
                    </h3>
                    <div className="space-y-2">
                      {roomDetails.recentBills.map((bill) => (
                        <div
                          key={bill.bill_id}
                          className="bg-white rounded-lg p-3 border border-gray-200 flex justify-between items-center"
                        >
                          <div>
                            <p className="font-medium">
                              {bill.billing_month}/{bill.billing_year}
                            </p>
                            <p className="text-sm text-gray-600">
                              ครบกำหนด: {formatDate(bill.due_date)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-lg">
                              ฿{new Intl.NumberFormat('th-TH').format(bill.total_amount)}
                            </p>
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                bill.status === 'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : bill.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {bill.status === 'paid'
                                ? 'ชำระแล้ว'
                                : bill.status === 'pending'
                                ? 'รอชำระ'
                                : bill.status || '-'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                ไม่พบข้อมูล
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                className="px-4 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300"
                onClick={closeDetailsModal}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

