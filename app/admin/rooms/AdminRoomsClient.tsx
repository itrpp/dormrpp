'use client';

import { useMemo, useState, useEffect } from 'react';
import type { RoomWithDetails } from '@/lib/repositories/rooms';
import type { Building, RoomType } from '@/types/db';
import type { RoomOccupancyInfo } from '@/lib/repositories/room-occupancy';

type Props = {
  initialRooms: RoomWithDetails[];
};

type RoomForm = {
  room_id?: number;
  building_id: string;
  room_number: string;
  floor_no: string;
  status: string;
  room_type_id?: string;
};

export default function AdminRoomsClient({ initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms);
  
  // state สำหรับ buildings และ room types ที่ดึงจาก API
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  // state สำหรับข้อมูลสถานะผู้เข้าพัก
  const [roomOccupancies, setRoomOccupancies] = useState<Map<number, RoomOccupancyInfo>>(new Map());
  
  // state สำหรับข้อมูลผู้เข้าพักของแต่ละห้อง
  const [roomTenants, setRoomTenants] = useState<Map<number, Array<{ first_name: string; last_name: string }>>>(new Map());

  // state สำหรับ filter
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // state สำหรับ pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // state สำหรับ modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState<RoomForm>({
    building_id: '',
    room_number: '',
    floor_no: '',
    status: 'available',
    room_type_id: '',
  });

  // state สำหรับ modal รายละเอียด
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [roomDetails, setRoomDetails] = useState<{
    room: RoomWithDetails | null;
    tenants: Array<{
      tenant_id: number;
      contract_id?: number;
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
    occupancy: {
      current_occupants: number;
      max_occupants: number;
    } | null;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // state สำหรับ modal ย้ายผู้เช่าออก
  const [isMoveOutModalOpen, setIsMoveOutModalOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [selectedTenantName, setSelectedTenantName] = useState<string>('');
  const [moveOutDate, setMoveOutDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [isMovingOut, setIsMovingOut] = useState(false);

  // ดึงข้อมูล buildings, room types, occupancy และ tenants จาก API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [buildingsRes, roomTypesRes, occupancyRes, contractsRes] = await Promise.all([
          fetch('/api/buildings'),
          fetch('/api/room-types'),
          fetch('/api/rooms/occupancy'),
          fetch('/api/contracts?status=active'),
        ]);

        if (buildingsRes.ok) {
          const buildingsData = await buildingsRes.json();
          setBuildings(buildingsData);
        }

        if (roomTypesRes.ok) {
          const roomTypesData = await roomTypesRes.json();
          setRoomTypes(roomTypesData);
        }

        if (occupancyRes.ok) {
          const occupancyData: RoomOccupancyInfo[] = await occupancyRes.json();
          const occupancyMap = new Map<number, RoomOccupancyInfo>();
          occupancyData.forEach((occ) => {
            if (occ && occ.room_id) {
              occupancyMap.set(occ.room_id, occ);
            }
          });
          setRoomOccupancies(occupancyMap);
        } else {
          const errorText = await occupancyRes.text();
          console.error('Failed to fetch occupancy:', occupancyRes.status, errorText);
        }

        // จัดกลุ่มผู้เข้าพักตาม room_id
        if (contractsRes.ok) {
          const contractsData = await contractsRes.json();
          const tenantsMap = new Map<number, Array<{ first_name: string; last_name: string }>>();
          
          contractsData.forEach((contract: any) => {
            if (contract.room_id && contract.first_name_th && contract.last_name_th) {
              const roomId = contract.room_id;
              if (!tenantsMap.has(roomId)) {
                tenantsMap.set(roomId, []);
              }
              tenantsMap.get(roomId)!.push({
                first_name: contract.first_name_th,
                last_name: contract.last_name_th,
              });
            }
          });
          
          setRoomTenants(tenantsMap);
        }
      } catch (error) {
        console.error('Error fetching buildings/room types/occupancy/tenants:', error);
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
      return roomTypes.map((rt) => [rt.room_type_id, (rt as any).name_type || rt.name_th] as [number, string]);
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

      // 4) filter สถานะ (ตรวจสอบตามจำนวนผู้เข้าพัก)
      if (selectedStatus !== 'all') {
        const occupancy = roomOccupancies.get(r.room_id);
        const currentOccupants = occupancy?.current_occupants ?? 
          (roomTenants.get(r.room_id)?.length || 0);
        
        // กำหนดสถานะตามจำนวนผู้เข้าพัก
        let displayStatus = r.status || 'available';
        if (r.status === 'maintenance') {
          displayStatus = 'maintenance';
        } else if (currentOccupants > 0) {
          displayStatus = 'occupied';
        } else {
          displayStatus = 'available';
        }
        
        const selectedStatusLower = selectedStatus.toLowerCase().trim();
        if (displayStatus.toLowerCase().trim() !== selectedStatusLower) {
          return false;
        }
      }

      return true;
    });
  }, [rooms, selectedBuilding, selectedFloor, selectedStatus, roomOccupancies, roomTenants]);

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

  // หา building default (รวงผึ้ง) จากรายการอาคาร
  const defaultBuildingId = useMemo(() => {
    const target = buildings.find((b) => b.name_th === 'รวงผึ้ง');
    return target ? String(target.building_id) : '';
  }, [buildings]);

  // เปิด modal เพิ่ม
  const openCreateModal = () => {
    setModalMode('create');
    setForm({
      building_id: defaultBuildingId,
      room_number: '',
      floor_no: '',
      status: 'available',
      room_type_id: '',
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
      room_type_id: room.room_type_id != null ? String(room.room_type_id) : '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // คำนวณชั้นจากหมายเลขห้อง เช่น 301 -> ชั้น 3, 1205 -> ชั้น 12
  const computeFloorFromRoomNumber = (roomNumber: string): string => {
    const numeric = parseInt(roomNumber, 10);
    if (Number.isNaN(numeric)) return '';
    const floor = Math.floor(numeric / 100);
    return floor > 0 ? String(floor) : '';
  };

  // submit ฟอร์ม (create / edit)
  const handleSubmit = async () => {
    try {
      // ตรวจสอบหมายเลขห้อง: ต้องเป็นตัวเลข 3 หลักเท่านั้น
      if (!form.room_number || !/^\d{3}$/.test(form.room_number)) {
        alert('หมายเลขห้องต้องเป็นตัวเลข 3 หลักเท่านั้น (เช่น 101, 305)');
        return;
      }

      if (!form.building_id) {
        alert('กรุณาเลือกอาคาร');
        return;
      }

      const payload = {
        building_id: Number(form.building_id),
        room_number: form.room_number,
        floor_no: form.floor_no ? Number(form.floor_no) : null,
        status: form.status,
        room_type_id: form.room_type_id ? Number(form.room_type_id) : null,
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
        
        // Refetch occupancy data เพื่ออัปเดตข้อมูล occupancy ของห้องใหม่
        try {
          const occupancyRes = await fetch('/api/rooms/occupancy');
          if (occupancyRes.ok) {
            const occupancyData: RoomOccupancyInfo[] = await occupancyRes.json();
            const occupancyMap = new Map<number, RoomOccupancyInfo>();
            occupancyData.forEach((occ) => {
              if (occ && occ.room_id) {
                occupancyMap.set(occ.room_id, occ);
              }
            });
            setRoomOccupancies(occupancyMap);
          }
        } catch (err) {
          console.error('Failed to refresh occupancy data:', err);
        }
        
        alert('บันทึกห้องพักใหม่สำเร็จ');
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
        
        // Refetch occupancy data เพื่ออัปเดต max_occupants ตาม room_type_id ที่แก้ไข
        try {
          const occupancyRes = await fetch('/api/rooms/occupancy');
          if (occupancyRes.ok) {
            const occupancyData: RoomOccupancyInfo[] = await occupancyRes.json();
            const occupancyMap = new Map<number, RoomOccupancyInfo>();
            occupancyData.forEach((occ) => {
              if (occ && occ.room_id) {
                occupancyMap.set(occ.room_id, occ);
              }
            });
            setRoomOccupancies(occupancyMap);
          }
        } catch (err) {
          console.error('Failed to refresh occupancy data:', err);
        }
        
        alert('แก้ไขข้อมูลห้องพักสำเร็จ');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    }
  };

  // เปิดใช้งาน/ปิดใช้งานห้องพัก
  const handleToggleActive = async (roomId: number, newIsDeleted: boolean) => {
    const action = newIsDeleted ? 'ปิดใช้งาน' : 'เปิดใช้งาน';
    const confirmMessage = newIsDeleted 
      ? 'ยืนยันการปิดใช้งานห้องพัก? ห้องที่ปิดใช้งานจะไม่แสดงในรายการ'
      : 'ยืนยันการเปิดใช้งานห้องพัก?';
    
    if (!confirm(confirmMessage)) return;
    
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_deleted: newIsDeleted }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `${action} ไม่สำเร็จ`);
      }

      const updated: RoomWithDetails = await res.json();
      setRooms((prev) =>
        prev.map((r) => (r.room_id === updated.room_id ? updated : r))
      );
      
      alert(`${action} สำเร็จ`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || `${action} ไม่สำเร็จ`);
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

  // เปิด modal ย้ายผู้เช่าออก
  const openMoveOutModal = (contractId: number, tenantName: string) => {
    setSelectedContractId(contractId);
    setSelectedTenantName(tenantName);
    setMoveOutDate(new Date().toISOString().slice(0, 10));
    setIsMoveOutModalOpen(true);
  };

  // ปิด modal ย้ายผู้เช่าออก
  const closeMoveOutModal = () => {
    setIsMoveOutModalOpen(false);
    setSelectedContractId(null);
    setSelectedTenantName('');
    setMoveOutDate(new Date().toISOString().slice(0, 10));
  };

  // ย้ายผู้เช่าออกจากห้อง (end contract)
  const handleMoveOut = async () => {
    if (!selectedContractId) {
      alert('ไม่พบข้อมูลสัญญา');
      return;
    }

    if (!moveOutDate) {
      alert('กรุณาเลือกวันที่สิ้นสุดสัญญา');
      return;
    }

    if (!confirm(`ยืนยันการย้าย ${selectedTenantName} ออกจากห้อง?\nวันที่สิ้นสุดสัญญา: ${moveOutDate}`)) {
      return;
    }

    setIsMovingOut(true);
    try {
      const res = await fetch(`/api/contracts/${selectedContractId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          end_date: moveOutDate,
          status: 'ended',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'ไม่สามารถย้ายผู้เช่าออกได้');
      }

      alert('ย้ายผู้เช่าออกสำเร็จ');
      closeMoveOutModal();
      
      // Refresh ข้อมูลห้อง
      if (selectedRoomId) {
        const detailsRes = await fetch(`/api/rooms/${selectedRoomId}/details`);
        if (detailsRes.ok) {
          const data = await detailsRes.json();
          setRoomDetails(data);
        }
      }
      
      // Refresh ข้อมูล occupancy
      const occupancyRes = await fetch('/api/rooms/occupancy');
      if (occupancyRes.ok) {
        const occupancyData = await occupancyRes.json();
        const occupancyMap = new Map<number, RoomOccupancyInfo>();
        occupancyData.forEach((occ: RoomOccupancyInfo) => {
          occupancyMap.set(occ.room_id, occ);
        });
        setRoomOccupancies(occupancyMap);
      }
      
      // Redirect ไปหน้า rooms
      window.location.href = '/admin/rooms';
    } catch (error: any) {
      console.error('Error moving out tenant:', error);
      alert(`ไม่สามารถย้ายผู้เช่าออกได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsMovingOut(false);
    }
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

      {/* ตัวเลือกแสดงผลและข้อมูลสรุป */}
      <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-gray-700">
          แสดง {startIndex + 1} - {Math.min(endIndex, filteredRooms.length)} จาก {filteredRooms.length} รายการ
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
                ประเภทห้องพัก
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                สถานะ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                จำนวนผู้เข้าพัก
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                รายชื่อผู้เข้าพัก
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {(() => {
                    const occupancy = roomOccupancies.get(room.room_id);
                    return occupancy?.room_type_name || '-';
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {(() => {
                    // ตรวจสอบจำนวนผู้เข้าพัก
                    const occupancy = roomOccupancies.get(room.room_id);
                    const currentOccupants = occupancy?.current_occupants ?? 
                      (roomTenants.get(room.room_id)?.length || 0);
                    
                    // กำหนดสถานะตามจำนวนผู้เข้าพัก
                    let displayStatus = room.status;
                    if (room.status === 'maintenance') {
                      // ถ้าเป็น maintenance ให้คงสถานะ maintenance
                      displayStatus = 'maintenance';
                    } else if (currentOccupants > 0) {
                      // ถ้ามีผู้เข้าพัก → แสดงเป็น occupied
                      displayStatus = 'occupied';
                    } else {
                      // ถ้าไม่มีผู้เข้าพัก → แสดงเป็น available
                      displayStatus = 'available';
                    }
                    
                    return (
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          displayStatus === 'available'
                        ? 'bg-green-100 text-green-800'
                            : displayStatus === 'occupied'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                        {getStatusThai(displayStatus)}
                  </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {(() => {
                    const occupancy = roomOccupancies.get(room.room_id);
                    // ถ้าไม่มี occupancy data แต่มี tenant names ให้คำนวณจาก tenant names
                    if (!occupancy) {
                      const tenants = roomTenants.get(room.room_id);
                      if (tenants && tenants.length > 0) {
                        // ใช้ default max_occupants = 2 ถ้าไม่มีข้อมูล occupancy
                        const currentCount = tenants.length;
                        const maxOccupants = 2; // default
                        const isFull = currentCount >= maxOccupants;
                        return (
                          <span
                            className={`font-medium ${
                              isFull
                                ? 'text-red-600'
                                : 'text-green-600'
                            }`}
                          >
                            {currentCount} / {maxOccupants}
                            {isFull && <span className="ml-1">🔴</span>}
                            {!isFull && <span className="ml-1">🟢</span>}
                          </span>
                        );
                      }
                      return <span className="text-gray-400">-</span>;
                    }
                    const isFull = occupancy.current_occupants >= occupancy.max_occupants;
                    const isEmpty = occupancy.current_occupants === 0;
                    return (
                      <span
                        className={`font-medium ${
                          isFull
                            ? 'text-red-600'
                            : isEmpty
                            ? 'text-gray-500'
                            : 'text-green-600'
                        }`}
                      >
                        {occupancy.current_occupants} / {occupancy.max_occupants}
                        {isFull && <span className="ml-1">🔴</span>}
                        {!isFull && !isEmpty && <span className="ml-1">🟢</span>}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {(() => {
                    const tenants = roomTenants.get(room.room_id);
                    if (!tenants || tenants.length === 0) {
                      return <span className="text-gray-400">-</span>;
                    }
                    return (
                      <div className="space-y-1">
                        {tenants.map((tenant, index) => (
                          <div key={index} className="truncate">
                            {tenant.first_name} {tenant.last_name}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    className="text-green-600 hover:text-green-900 mr-3"
                    onClick={() => openDetailsModal(room.room_id)}
                  >
                    จัดการผู้เช่า
                  </button>
                  {(() => {
                    const occupancy = roomOccupancies.get(room.room_id);
                    // ตรวจสอบจาก occupancy หรือจาก roomTenants เป็น fallback
                    const currentOccupants = occupancy?.current_occupants ?? 
                      (roomTenants.get(room.room_id)?.length || 0);
                    const hasOccupants = currentOccupants > 0;
                    return (
                      <button
                        className={`mr-3 ${
                          hasOccupants
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-blue-600 hover:text-blue-900'
                        }`}
                        onClick={() => !hasOccupants && openEditModal(room)}
                        disabled={hasOccupants}
                        title={hasOccupants ? 'ไม่สามารถแก้ไขได้ เนื่องจากมีผู้เช่าพักอยู่' : ''}
                      >
                        แก้ไข
                      </button>
                    );
                  })()}
                  {(() => {
                    const isDeletedValue = room.is_deleted ?? 0;
                    const isDeleted = isDeletedValue === 1;
                    const isActive = !isDeleted;
                    
                    // ตรวจสอบว่าห้องมีผู้เข้าพักหรือไม่
                    const occupancy = roomOccupancies.get(room.room_id);
                    const currentOccupants = occupancy?.current_occupants ?? 
                      (roomTenants.get(room.room_id)?.length || 0);
                    const hasOccupants = currentOccupants > 0;
                    
                    return (
                      <label className={`relative inline-flex items-center ${hasOccupants ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => !hasOccupants && handleToggleActive(room.room_id, !e.target.checked)}
                          disabled={hasOccupants}
                          className="sr-only peer"
                        />
                        <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${hasOccupants ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                        <span className={`ml-3 text-sm font-medium ${hasOccupants ? 'text-gray-400' : 'text-gray-700'}`}>
                          {/* {isActive ? 'เปิด' : 'ปิด'} */}
                          {hasOccupants && (
                            <span className="ml-2 text-xs text-red-500" title="ไม่สามารถเปลี่ยนสถานะได้ เนื่องจากมีผู้เช่าพักอยู่">
                              (มีผู้เข้าพัก)
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })()}
                </td>
              </tr>
            ))}
            {paginatedRooms.length === 0 && (
              <tr>
                <td
                  colSpan={10}
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
                  type="text"
                  maxLength={3}
                  inputMode="numeric"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.room_number}
                  onChange={(e) => {
                    // อนุญาตเฉพาะตัวเลข 0-9 สูงสุด 3 หลัก
                    const onlyDigits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                    const value = onlyDigits;
                    const floor = computeFloorFromRoomNumber(value);
                    setForm((f) => ({
                      ...f,
                      room_number: value,
                      floor_no: floor,
                    }));
                  }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1">ชั้น</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.floor_no}
                  disabled
                  placeholder="คำนวณจากหมายเลขห้อง"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">ประเภทห้อง</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.room_type_id || ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, room_type_id: e.target.value }))
                  }
                >
                  <option value="">ไม่ระบุ</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.room_type_id} value={rt.room_type_id}>
                      {(rt as any).name_type || rt.name_th}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">สถานะ</label>
                {(() => {
                  // ตรวจสอบว่าห้องนี้มีผู้เข้าพักหรือไม่ (เฉพาะกรณีแก้ไข)
                  const hasOccupants = modalMode === 'edit' && form.room_id
                    ? (() => {
                        const occupancy = roomOccupancies.get(form.room_id!);
                        return occupancy && occupancy.current_occupants > 0;
                      })()
                    : false;

                  return (
                    <>
                <select
                        className={`w-full border rounded-md px-3 py-2 text-sm ${
                          hasOccupants ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                        disabled={hasOccupants}
                >
                  <option value="available">ว่าง (available)</option>
                  <option value="occupied">มีผู้เช่า (occupied)</option>
                  <option value="maintenance">ซ่อมบำรุง (maintenance)</option>
                </select>
                      {hasOccupants && (
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠️ ไม่สามารถแก้ไขสถานะได้ เนื่องจากมีผู้เช่าพักอยู่
                        </p>
                      )}
                    </>
                  );
                })()}
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
                      {(() => {
                        // กำหนดสถานะตามจำนวนผู้เข้าพัก
                        let displayStatus = roomDetails.room?.status || 'available';
                        if (roomDetails.room?.status === 'maintenance') {
                          displayStatus = 'maintenance';
                        } else if (roomDetails.occupancy && roomDetails.occupancy.current_occupants > 0) {
                          displayStatus = 'occupied';
                        } else {
                          displayStatus = 'available';
                        }
                        
                        return (
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              displayStatus === 'available'
                                ? 'bg-green-100 text-green-800'
                                : displayStatus === 'occupied'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {getStatusThai(displayStatus)}
                          </span>
                        );
                      })()}
                    </div>
                    {roomDetails.occupancy && (
                      <div>
                        <p className="text-sm text-gray-600">จำนวนผู้เข้าพัก</p>
                        <p className="font-medium">
                          <span
                            className={
                              roomDetails.occupancy.current_occupants >=
                              roomDetails.occupancy.max_occupants
                                ? 'text-red-600'
                                : roomDetails.occupancy.current_occupants === 0
                                ? 'text-gray-500'
                                : 'text-green-600'
                            }
                          >
                            {roomDetails.occupancy.current_occupants} / {roomDetails.occupancy.max_occupants}
                          </span>
                          {roomDetails.occupancy.current_occupants >=
                            roomDetails.occupancy.max_occupants && (
                            <span className="ml-1">🔴</span>
                          )}
                          {roomDetails.occupancy.current_occupants > 0 &&
                            roomDetails.occupancy.current_occupants <
                              roomDetails.occupancy.max_occupants && (
                              <span className="ml-1">🟢</span>
                            )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ผู้เข้าพัก */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">
                      ผู้เข้าพักปัจจุบัน
                  </h3>
                    <button
                      onClick={() => {
                        if (roomDetails.room?.room_id) {
                          window.location.href = `/admin/tenants/add?room_id=${roomDetails.room.room_id}`;
                        } else {
                          window.location.href = '/admin/tenants/add';
                        }
                      }}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      เพิ่มผู้เช่าใหม่
                    </button>
                  </div>
                  {roomDetails.tenants && roomDetails.tenants.length > 0 ? (
                    <div className="space-y-3">
                      {roomDetails.tenants
                        .filter((tenant) => tenant.status === 'active')
                        .map((tenant) => (
                        <div
                          key={tenant.tenant_id}
                          className="bg-white rounded-lg p-4 border border-gray-200"
                        >
                          <div className="flex justify-between items-start">
                            <div className="grid grid-cols-2 gap-4 flex-1">
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
                                  ตั้งแต่ {formatDate(tenant.move_in_date)}
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
                            {tenant.status === 'active' && tenant.contract_id && (
                              <button
                                onClick={() => openMoveOutModal(tenant.contract_id!, `${tenant.first_name} ${tenant.last_name}`)}
                                className="ml-4 text-sm text-red-600 hover:text-red-800 px-3 py-1 border border-red-300 rounded hover:bg-red-50"
                              >
                                ย้ายออก
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-500">ไม่มีผู้เข้าพักในห้องนี้</p>
                    </div>
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

      {/* Modal ย้ายผู้เช่าออก */}
      {isMoveOutModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-xl font-semibold mb-4">ย้ายผู้เช่าออกจากห้อง</h2>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">ผู้เช่า:</p>
              <p className="font-medium text-lg">{selectedTenantName}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันที่สิ้นสุดสัญญา <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                ระบบจะสิ้นสุดสัญญาและเก็บประวัติไว้ในระบบ
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-800">
                ⚠️ หมายเหตุ: การย้ายผู้เช่าออกจะสิ้นสุดสัญญาเท่านั้น ไม่ได้ลบข้อมูล<br/>
                บิลและประวัติการพักจะยังคงอยู่ในระบบ
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeMoveOutModal}
                className="px-4 py-2 rounded-md border hover:bg-gray-50"
                disabled={isMovingOut}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleMoveOut}
                disabled={isMovingOut || !moveOutDate}
                className={`px-4 py-2 rounded-md text-white ${
                  isMovingOut || !moveOutDate
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isMovingOut ? 'กำลังดำเนินการ...' : 'ยืนยันย้ายออก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

