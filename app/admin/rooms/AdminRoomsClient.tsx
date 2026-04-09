'use client';

import { useMemo, useState, useEffect } from 'react';
import type { RoomWithDetails } from '@/lib/repositories/rooms';
import type { Building, RoomType } from '@/types/db';
import type { RoomOccupancyInfo } from '@/lib/repositories/room-occupancy';

type Props = {
  initialRooms: RoomWithDetails[];
  /** ถ้ามี = ผู้ดูแลรายอาคาร — แสดงเฉพาะแท็บอาคารนี้ ไม่มีแท็บ "ทุกอาคาร" และเลือกอาคารนั้นเป็นค่าเริ่มต้น */
  visibleBuildingIds?: number[];
};

type RoomForm = {
  room_id?: number;
  building_id: string;
  room_number: string;
  floor_no: string;
  status: string;
  room_type_id?: string;
};

export default function AdminRoomsClient({
  initialRooms,
  visibleBuildingIds,
}: Props) {
  const [rooms, setRooms] = useState(initialRooms);
  
  // state สำหรับ buildings และ room types ที่ดึงจาก API
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  // state สำหรับข้อมูลสถานะผู้เข้าพัก
  const [roomOccupancies, setRoomOccupancies] = useState<Map<number, RoomOccupancyInfo>>(new Map());
  
  // state สำหรับข้อมูลผู้เข้าพักของแต่ละห้อง (พร้อม contract_id, start_date และ end_date)
  const [roomTenants, setRoomTenants] = useState<Map<number, Array<{ first_name: string; last_name: string; contract_id?: number; start_date?: string | null; end_date?: string | null }>>>(new Map());
  
  // state สำหรับข้อมูล contracts (เพื่อดึง end_date)
  const [roomContracts, setRoomContracts] = useState<Map<number, Array<{ contract_id: number; end_date: string | null; start_date?: string | null }>>>(new Map());

  const isScopedToBuildings =
    Array.isArray(visibleBuildingIds) && visibleBuildingIds.length > 0;

  // state สำหรับ filter — superuser รายอาคารให้เริ่มที่แท็บอาคารนั้น ไม่ใช่ "ทุกอาคาร"
  const [selectedBuilding, setSelectedBuilding] = useState<string>(() =>
    visibleBuildingIds?.length
      ? String(visibleBuildingIds[0])
      : 'all',
  );
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all'); // รวมสถานะและจำนวนผู้เข้าพัก
  const [showInactiveRooms, setShowInactiveRooms] = useState<boolean>(true);

  // state สำหรับ pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // state สำหรับเลือกมุมมอง
  const [viewMode, setViewMode] = useState<'table' | 'floorplan'>('floorplan');

  // จัดการประเภทห้องพัก (CRUD)
  const [isRoomTypesModalOpen, setIsRoomTypesModalOpen] = useState(false);
  const [newRoomTypeName, setNewRoomTypeName] = useState('');
  const [newRoomTypeMax, setNewRoomTypeMax] = useState('2');
  const [editingRoomTypeId, setEditingRoomTypeId] = useState<number | null>(null);
  const [editRoomTypeName, setEditRoomTypeName] = useState('');
  const [editRoomTypeMax, setEditRoomTypeMax] = useState('');
  const [isSavingRoomType, setIsSavingRoomType] = useState(false);

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
      department: string | null;
      move_in_date: string | null;
      move_out_date: string | null;
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

  // state สำหรับแก้ไขวันที่เข้าพัก
  const [editingMoveInDate, setEditingMoveInDate] = useState<{ contractId: number; date: string } | null>(null);
  const [isUpdatingMoveInDate, setIsUpdatingMoveInDate] = useState(false);

  // state สำหรับแก้ไขวันที่ย้ายออก
  const [editingMoveOutDate, setEditingMoveOutDate] = useState<{ contractId: number; date: string } | null>(null);
  const [isUpdatingMoveOutDate, setIsUpdatingMoveOutDate] = useState(false);

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

        // จัดกลุ่มผู้เข้าพักตาม room_id และเก็บข้อมูล contracts
        if (contractsRes.ok) {
          const contractsData = await contractsRes.json();
          const tenantsMap = new Map<number, Array<{ first_name: string; last_name: string; contract_id?: number; start_date?: string | null; end_date?: string | null }>>();
          const contractsMap = new Map<number, Array<{ contract_id: number; end_date: string | null; start_date?: string | null }>>();
          
          contractsData.forEach((contract: any) => {
            if (contract.room_id) {
              const roomId = contract.room_id;
              
              // เก็บข้อมูล tenants พร้อม contract_id, start_date และ end_date
              if (contract.first_name_th && contract.last_name_th) {
                if (!tenantsMap.has(roomId)) {
                  tenantsMap.set(roomId, []);
                }
                tenantsMap.get(roomId)!.push({
                  first_name: contract.first_name_th,
                  last_name: contract.last_name_th,
                  contract_id: contract.contract_id,
                  start_date: contract.start_date || null,
                  end_date: contract.end_date || null,
                });
              }
              
              // เก็บข้อมูล contracts (start_date และ end_date)
              if (contract.contract_id) {
                if (!contractsMap.has(roomId)) {
                  contractsMap.set(roomId, []);
                }
                contractsMap.get(roomId)!.push({
                  contract_id: contract.contract_id,
                  start_date: contract.start_date || null,
                  end_date: contract.end_date || null,
                });
              }
            }
          });
          
          setRoomTenants(tenantsMap);
          setRoomContracts(contractsMap);
        }
      } catch (error) {
        console.error('Error fetching buildings/room types/occupancy/tenants:', error);
      }
    };

    fetchData();
  }, []);

  const refreshRoomTypesAndOccupancy = async () => {
    const [rtRes, occRes] = await Promise.all([
      fetch('/api/room-types'),
      fetch('/api/rooms/occupancy'),
    ]);
    if (rtRes.ok) {
      const data = await rtRes.json();
      setRoomTypes(Array.isArray(data) ? data : []);
    }
    if (occRes.ok) {
      const occupancyData: RoomOccupancyInfo[] = await occRes.json();
      const occupancyMap = new Map<number, RoomOccupancyInfo>();
      occupancyData.forEach((occ) => {
        if (occ && occ.room_id) {
          occupancyMap.set(occ.room_id, occ);
        }
      });
      setRoomOccupancies(occupancyMap);
    }
  };

  const getRoomTypeLabel = (rt: RoomType) =>
    (rt as { name_type?: string }).name_type || rt.name_th || `ประเภท #${rt.room_type_id}`;

  const openRoomTypesModal = () => {
    setNewRoomTypeName('');
    setNewRoomTypeMax('2');
    setEditingRoomTypeId(null);
    setEditRoomTypeName('');
    setEditRoomTypeMax('');
    setIsRoomTypesModalOpen(true);
    void refreshRoomTypesAndOccupancy();
  };

  const closeRoomTypesModal = () => {
    setIsRoomTypesModalOpen(false);
    setEditingRoomTypeId(null);
  };

  const handleAddRoomType = async () => {
    if (!newRoomTypeName.trim()) {
      alert('กรุณากรอกชื่อประเภทห้อง');
      return;
    }
    setIsSavingRoomType(true);
    try {
      const res = await fetch('/api/room-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_th: newRoomTypeName.trim(),
          max_occupants: Number(newRoomTypeMax) || 2,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถเพิ่มประเภทห้องได้');
      }
      setNewRoomTypeName('');
      setNewRoomTypeMax('2');
      await refreshRoomTypesAndOccupancy();
      alert('เพิ่มประเภทห้องสำเร็จ');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(msg);
    } finally {
      setIsSavingRoomType(false);
    }
  };

  const startEditRoomType = (rt: RoomType) => {
    setEditingRoomTypeId(rt.room_type_id);
    setEditRoomTypeName(getRoomTypeLabel(rt));
    setEditRoomTypeMax(
      String(rt.max_occupants != null && rt.max_occupants !== undefined ? rt.max_occupants : 2),
    );
  };

  const cancelEditRoomType = () => {
    setEditingRoomTypeId(null);
    setEditRoomTypeName('');
    setEditRoomTypeMax('');
  };

  const handleSaveEditRoomType = async () => {
    if (editingRoomTypeId == null) return;
    if (!editRoomTypeName.trim()) {
      alert('กรุณากรอกชื่อประเภทห้อง');
      return;
    }
    setIsSavingRoomType(true);
    try {
      const res = await fetch(`/api/room-types/${editingRoomTypeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_th: editRoomTypeName.trim(),
          max_occupants: Number(editRoomTypeMax) || 2,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถบันทึกได้');
      }
      cancelEditRoomType();
      await refreshRoomTypesAndOccupancy();
      alert('บันทึกประเภทห้องสำเร็จ');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(msg);
    } finally {
      setIsSavingRoomType(false);
    }
  };

  const handleDeleteRoomType = async (rt: RoomType) => {
    const label = getRoomTypeLabel(rt);
    if (
      !confirm(
        `ลบประเภทห้อง "${label}"?\nถ้ามีห้องพักใช้ประเภทนี้อยู่ ระบบจะไม่อนุญาตให้ลบ`,
      )
    ) {
      return;
    }
    setIsSavingRoomType(true);
    try {
      const res = await fetch(`/api/room-types/${rt.room_type_id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถลบได้');
      }
      if (form.room_type_id === String(rt.room_type_id)) {
        setForm((f) => ({ ...f, room_type_id: '' }));
      }
      await refreshRoomTypesAndOccupancy();
      alert('ลบประเภทห้องสำเร็จ');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(msg);
    } finally {
      setIsSavingRoomType(false);
    }
  };

  // สร้าง list อาคาร / ชั้น / ประเภทห้อง
  const buildingOptions = useMemo(() => {
    // ใช้ข้อมูลจาก API ก่อน ถ้าไม่มีให้ใช้ข้อมูลจาก rooms
    let opts: [number, string][];
    if (buildings.length > 0) {
      opts = buildings.map((b) => [b.building_id, b.name_th] as [number, string]);
    } else {
      const map = new Map<number, string>();
      rooms.forEach((r) => {
        if (r.building_id && r.building_name) {
          map.set(r.building_id, r.building_name);
        }
      });
      opts = Array.from(map.entries());
    }
    if (isScopedToBuildings && visibleBuildingIds) {
      const allow = new Set(visibleBuildingIds);
      opts = opts.filter(([id]) => allow.has(id));
    }
    return opts;
  }, [buildings, rooms, isScopedToBuildings, visibleBuildingIds]);

  const floorOptions = useMemo(() => {
    const setFloors = new Set<number>();
    rooms.forEach((r) => {
      if (r.floor_no == null) return;
      if (
        selectedBuilding !== 'all' &&
        String(r.building_id) !== String(selectedBuilding)
      ) {
        return;
      }
      setFloors.add(r.floor_no);
    });
    return Array.from(setFloors.values()).sort((a, b) => a - b);
  }, [rooms, selectedBuilding]);

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
      // 0) filter ห้องปิดใช้งาน
      const isDeleted = Number(r.is_deleted ?? 0) === 1;
      if (!showInactiveRooms && isDeleted) {
        return false;
      }

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

      // 3) filter สถานะและจำนวนผู้เข้าพัก (รวมกัน)
      if (selectedStatus !== 'all') {
        const occupancy = roomOccupancies.get(r.room_id);
        const currentOccupants = occupancy?.current_occupants ?? 
          (roomTenants.get(r.room_id)?.length || 0);
        const maxOccupants = occupancy?.max_occupants ?? 2;
        const isMaintenance = r.status === 'maintenance';
        const isFull = currentOccupants >= maxOccupants;
        const isEmpty = currentOccupants === 0;
        const isOccupiedNotFull = currentOccupants > 0 && !isFull;
        
        if (selectedStatus === 'maintenance') {
          // ซ่อมบำรุง
          if (!isMaintenance) {
            return false;
          }
        } else if (selectedStatus === 'empty') {
          // ว่าง (0 คน, ไม่ซ่อมบำรุง)
          if (!isEmpty || isMaintenance) {
            return false;
          }
        } else if (selectedStatus === 'occupied-not-full') {
          // มีคนพักไม่เต็ม
          if (!isOccupiedNotFull || isMaintenance) {
            return false;
          }
        } else if (selectedStatus === 'full') {
          // เต็ม
          if (!isFull || isMaintenance) {
            return false;
          }
        }
      }

      return true;
    });
  }, [rooms, selectedBuilding, selectedFloor, selectedStatus, showInactiveRooms, roomOccupancies, roomTenants]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBuilding, selectedFloor, selectedStatus, showInactiveRooms]);

  // เปลี่ยนอาคารแล้วรีเซ็ตชั้น (กันค้างชั้นที่ไม่มีในอาคารใหม่)
  useEffect(() => {
    setSelectedFloor('all');
  }, [selectedBuilding]);

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

  // เปิด modal เพิ่ม — ถ้าเลือกแท็บอาคารอยู่ ให้ตั้งอาคารในฟอร์มตามแท็บ
  const openCreateModal = () => {
    setModalMode('create');
    const buildingForForm =
      selectedBuilding !== 'all'
        ? String(selectedBuilding)
        : defaultBuildingId;
    setForm({
      building_id: buildingForForm,
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

  // จัดกลุ่มห้องตามชั้นสำหรับ floor plan view
  const roomsByFloor = useMemo(() => {
    const grouped = new Map<number, RoomWithDetails[]>();
    filteredRooms.forEach((room) => {
      if (room.floor_no != null) {
        if (!grouped.has(room.floor_no)) {
          grouped.set(room.floor_no, []);
        }
        grouped.get(room.floor_no)!.push(room);
      }
    });
    // เรียงลำดับห้องในแต่ละชั้นตามหมายเลขห้อง
    grouped.forEach((rooms, floor) => {
      rooms.sort((a, b) => {
        const numA = parseInt(a.room_number, 10) || 0;
        const numB = parseInt(b.room_number, 10) || 0;
        return numB - numA; // เรียงจากมากไปน้อย (712, 711, 710...)
      });
    });
    return grouped;
  }, [filteredRooms]);

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
          const error = await res.json().catch(() => ({}));
          if (
            res.status === 409 &&
            error?.is_deleted === true &&
            Number.isFinite(Number(error?.room_id))
          ) {
            const roomId = Number(error.room_id);
            const shouldReactivate = confirm(
              'พบห้องเลขนี้ในสถานะปิดใช้งานอยู่แล้ว ต้องการเปิดใช้งานห้องเดิมหรือไม่?',
            );
            if (shouldReactivate) {
              const reactivateRes = await fetch(`/api/rooms/${roomId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_deleted: false }),
              });
              const reactivated = await reactivateRes.json().catch(() => ({}));
              if (!reactivateRes.ok) {
                throw new Error(
                  reactivated.error || 'ไม่สามารถเปิดใช้งานห้องเดิมได้',
                );
              }
              setRooms((prev) =>
                prev.map((r) =>
                  r.room_id === roomId
                    ? { ...(r as RoomWithDetails), is_deleted: 0 }
                    : r,
                ),
              );
              alert('เปิดใช้งานห้องเดิมสำเร็จ');
              setIsModalOpen(false);
              return;
            }
          }
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
      ? 'ยืนยันการปิดใช้งานห้องพัก? ห้องจะถูกซ่อนเมื่อปิดตัวเลือก "แสดงห้องปิดใช้งาน"'
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

  // ฟังก์ชันตรวจสอบว่ามีผู้เช่าที่ยังไม่ถึงวันที่เข้าพักหรือไม่
  const hasReservedTenants = (roomId: number): boolean => {
    const tenants = roomTenants.get(roomId) || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return tenants.some(tenant => {
      if (!tenant.start_date) return false;
      try {
        const startDate = new Date(tenant.start_date);
        startDate.setHours(0, 0, 0, 0);
        return startDate > today;
      } catch {
        return false;
      }
    });
  };

  // ฟังก์ชันนับจำนวนผู้เข้าพักจริง (ไม่นับผู้จองที่ยังไม่ถึงวันที่เข้าพัก)
  const getActualOccupants = (roomId: number): number => {
    const tenants = roomTenants.get(roomId) || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return tenants.filter(tenant => {
      // ถ้าไม่มี start_date ให้นับเป็นผู้เข้าพักจริง
      if (!tenant.start_date) return true;
      try {
        const startDate = new Date(tenant.start_date);
        startDate.setHours(0, 0, 0, 0);
        // นับเฉพาะผู้ที่ถึงวันที่เข้าพักแล้ว (start_date <= today)
        return startDate <= today;
      } catch {
        return true;
      }
    }).length;
  };

  // ฟังก์ชันตรวจสอบว่าห้องมีทั้งผู้เข้าพักจริงและผู้จองหรือไม่
  const hasBothActualAndReserved = (roomId: number): boolean => {
    const actualOccupants = getActualOccupants(roomId);
    const isReserved = hasReservedTenants(roomId);
    return actualOccupants > 0 && isReserved;
  };

  // ฟังก์ชันกำหนดสีตามสถานะห้อง (ใช้ร่วมกันทั้ง 2 มุมมอง)
  const getRoomStatusColor = (
    room: RoomWithDetails,
    currentOccupants: number,
    maxOccupants: number,
    roomId?: number
  ): { bg: string; text: string; border: string } => {
    const isMaintenance = room.status === 'maintenance';
    const isFull = currentOccupants >= maxOccupants;
    const isEmpty = currentOccupants === 0;
    const isOccupiedNotFull = currentOccupants > 0 && !isFull;
    const isReserved = roomId ? hasReservedTenants(roomId) : false;
    const hasBoth = roomId ? hasBothActualAndReserved(roomId) : false;

    if (isMaintenance) {
      // ซ่อมบำรุง - สีส้ม
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-800',
        border: 'border-orange-400',
      };
    } else if (hasBoth) {
      // มีทั้งผู้เข้าพักจริงและผู้จอง - สีฟ้าอ่อน (indigo)
      return {
        bg: 'bg-indigo-100',
        text: 'text-indigo-800',
        border: 'border-indigo-400',
      };
    } else if (isReserved && isEmpty) {
      // จอง (มีผู้เช่าที่ยังไม่ถึงวันที่เข้าพัก และห้องว่าง) - สีม่วง
      return {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        border: 'border-purple-400',
      };
    } else if (isFull) {
      // เต็ม - สีเทา
      return {
        bg: 'bg-gray-200',
        text: 'text-gray-800',
        border: 'border-gray-400',
      };
    } else if (isEmpty) {
      // ว่างไม่มีคนพัก - สีเขียว
      return {
        bg: 'bg-green-100',
        text: 'text-green-800',
        border: 'border-green-400',
      };
    } else if (isOccupiedNotFull) {
      // มีคนพักไม่เต็ม - สีฟ้า
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        border: 'border-blue-400',
      };
    } else {
      // Default
      return {
        bg: 'bg-gray-50',
        text: 'text-gray-800',
        border: 'border-gray-300',
      };
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

  // เริ่มแก้ไขวันที่เข้าพัก
  const startEditingMoveInDate = (contractId: number, currentDate: string | null) => {
    setEditingMoveInDate({
      contractId,
      date: currentDate ? new Date(currentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
  };

  // ยกเลิกการแก้ไขวันที่เข้าพัก
  const cancelEditingMoveInDate = () => {
    setEditingMoveInDate(null);
  };

  // บันทึกวันที่เข้าพักใหม่
  const saveMoveInDate = async (contractId: number, newDate: string) => {
    if (!newDate) {
      alert('กรุณาเลือกวันที่เข้าพัก');
      return;
    }

    setIsUpdatingMoveInDate(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: newDate }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'ไม่สามารถอัปเดตวันที่เข้าพักได้');
      }

      // Refresh ข้อมูลห้อง
      if (selectedRoomId) {
        const detailsRes = await fetch(`/api/rooms/${selectedRoomId}/details`);
        if (detailsRes.ok) {
          const data = await detailsRes.json();
          setRoomDetails(data);
        }
      }

      // Refresh ข้อมูล occupancy, tenants และ contracts
      const [occupancyRes, contractsRes] = await Promise.all([
        fetch('/api/rooms/occupancy'),
        fetch('/api/contracts?status=active'),
      ]);
      
      if (occupancyRes.ok) {
        const occupancyData = await occupancyRes.json();
        const occupancyMap = new Map<number, RoomOccupancyInfo>();
        occupancyData.forEach((occ: RoomOccupancyInfo) => {
          occupancyMap.set(occ.room_id, occ);
        });
        setRoomOccupancies(occupancyMap);
      }
      
      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        const tenantsMap = new Map<number, Array<{ first_name: string; last_name: string; contract_id?: number; start_date?: string | null; end_date?: string | null }>>();
        const contractsMap = new Map<number, Array<{ contract_id: number; end_date: string | null; start_date?: string | null }>>();
        
        contractsData.forEach((contract: any) => {
          if (contract.room_id) {
            const roomId = contract.room_id;
            
            if (contract.first_name_th && contract.last_name_th) {
              if (!tenantsMap.has(roomId)) {
                tenantsMap.set(roomId, []);
              }
              tenantsMap.get(roomId)!.push({
                first_name: contract.first_name_th,
                last_name: contract.last_name_th,
                contract_id: contract.contract_id,
                start_date: contract.start_date || null,
                end_date: contract.end_date || null,
              });
            }
            
            if (contract.contract_id) {
              if (!contractsMap.has(roomId)) {
                contractsMap.set(roomId, []);
              }
              contractsMap.get(roomId)!.push({
                contract_id: contract.contract_id,
                start_date: contract.start_date || null,
                end_date: contract.end_date || null,
              });
            }
          }
        });
        
        setRoomTenants(tenantsMap);
        setRoomContracts(contractsMap);
      }

      setEditingMoveInDate(null);
      alert('อัปเดตวันที่เข้าพักสำเร็จ');
    } catch (error: any) {
      console.error('Error updating move-in date:', error);
      alert(`ไม่สามารถอัปเดตวันที่เข้าพักได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUpdatingMoveInDate(false);
    }
  };

  // เริ่มแก้ไขวันที่ย้ายออก
  const startEditingMoveOutDate = (contractId: number, currentDate: string | null) => {
    setEditingMoveOutDate({
      contractId,
      date: currentDate ? new Date(currentDate).toISOString().slice(0, 10) : '',
    });
  };

  // ยกเลิกการแก้ไขวันที่ย้ายออก
  const cancelEditingMoveOutDate = () => {
    setEditingMoveOutDate(null);
  };

  // บันทึกวันที่ย้ายออกใหม่
  const saveMoveOutDate = async (contractId: number, newDate: string | null) => {
    setIsUpdatingMoveOutDate(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_date: newDate || null }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'ไม่สามารถอัปเดตวันที่ย้ายออกได้');
      }

      // Refresh ข้อมูลห้อง
      if (selectedRoomId) {
        const detailsRes = await fetch(`/api/rooms/${selectedRoomId}/details`);
        if (detailsRes.ok) {
          const data = await detailsRes.json();
          setRoomDetails(data);
        }
      }

      // Refresh ข้อมูล occupancy, tenants และ contracts
      const [occupancyRes, contractsRes] = await Promise.all([
        fetch('/api/rooms/occupancy'),
        fetch('/api/contracts?status=active'),
      ]);
      
      if (occupancyRes.ok) {
        const occupancyData = await occupancyRes.json();
        const occupancyMap = new Map<number, RoomOccupancyInfo>();
        occupancyData.forEach((occ: RoomOccupancyInfo) => {
          occupancyMap.set(occ.room_id, occ);
        });
        setRoomOccupancies(occupancyMap);
      }
      
      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        const tenantsMap = new Map<number, Array<{ first_name: string; last_name: string; contract_id?: number; start_date?: string | null; end_date?: string | null }>>();
        const contractsMap = new Map<number, Array<{ contract_id: number; end_date: string | null; start_date?: string | null }>>();
        
        contractsData.forEach((contract: any) => {
          if (contract.room_id) {
            const roomId = contract.room_id;
            
            if (contract.first_name_th && contract.last_name_th) {
              if (!tenantsMap.has(roomId)) {
                tenantsMap.set(roomId, []);
              }
              tenantsMap.get(roomId)!.push({
                first_name: contract.first_name_th,
                last_name: contract.last_name_th,
                contract_id: contract.contract_id,
                start_date: contract.start_date || null,
                end_date: contract.end_date || null,
              });
            }
            
            if (contract.contract_id) {
              if (!contractsMap.has(roomId)) {
                contractsMap.set(roomId, []);
              }
              contractsMap.get(roomId)!.push({
                contract_id: contract.contract_id,
                start_date: contract.start_date || null,
                end_date: contract.end_date || null,
              });
            }
          }
        });
        
        setRoomTenants(tenantsMap);
        setRoomContracts(contractsMap);
      }

      setEditingMoveOutDate(null);
      alert('อัปเดตวันที่ย้ายออกสำเร็จ');
    } catch (error: any) {
      console.error('Error updating move-out date:', error);
      alert(`ไม่สามารถอัปเดตวันที่ย้ายออกได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUpdatingMoveOutDate(false);
    }
  };

  // ฟังก์ชันคำนวณสีตามวันที่ย้ายออก (ล่วงหน้า 1 สัปดาห์)
  const getMoveOutDateColor = (endDate: string | null): { bg: string; text: string; border: string } | null => {
    if (!endDate) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const moveOutDate = new Date(endDate);
    moveOutDate.setHours(0, 0, 0, 0);
    
    const diffTime = moveOutDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // ถ้าเลยกำหนดแล้ว
    if (diffDays < 0) {
      return {
        bg: 'bg-red-200',
        text: 'text-red-800',
        border: 'border-red-400',
      };
    }
    
    // ถ้าเหลือไม่เกิน 7 วัน (1 สัปดาห์)
    if (diffDays <= 7) {
      return {
        bg: 'bg-yellow-200',
        text: 'text-yellow-800',
        border: 'border-yellow-400',
      };
    }
    
    return null;
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start mb-4">
          <h1 className="text-3xl font-bold text-gray-800">จัดการห้องพัก</h1>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 p-1">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📋 ตาราง
              </button>
              <button
                type="button"
                onClick={() => setViewMode('floorplan')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === 'floorplan'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                🏢 แผนผัง
              </button>
            </div>
            <button
              type="button"
              onClick={openRoomTypesModal}
              className="bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              จัดการประเภทห้องพัก
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              เพิ่มห้องพัก
            </button>
          </div>
        </div>

        {/* แท็บเลือกอาคาร — แยกมุมมองชัดเจน */}
        <div
          className="bg-white rounded-lg border border-gray-200 shadow-sm px-2 sm:px-3 pt-2"
          role="tablist"
          aria-label="เลือกอาคาร"
        >
          <div className="overflow-x-auto">
            <div className="flex flex-nowrap gap-1 min-w-0 pb-0">
              {!isScopedToBuildings && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedBuilding === 'all'}
                  onClick={() => setSelectedBuilding('all')}
                  className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                    selectedBuilding === 'all'
                      ? 'border-blue-600 text-blue-800 bg-blue-50/90'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  ทุกอาคาร
                </button>
              )}
              {buildingOptions.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={String(selectedBuilding) === String(id)}
                  onClick={() => setSelectedBuilding(String(id))}
                  className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                    String(selectedBuilding) === String(id)
                      ? 'border-slate-700 text-slate-900 bg-slate-100'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 px-2 pb-2 pt-1 border-t border-gray-100">
            {isScopedToBuildings
              ? `มุมมองตามสิทธิ์ผู้ดูแล: ${buildingOptions.map(([, n]) => n).join(' · ')}`
              : selectedBuilding === 'all'
                ? 'แสดงห้องทุกอาคารตามตัวกรองชั้นและสถานะ — เลือกแท็บอาคารเพื่อโฟกัสเฉพาะหอนั้น'
                : `กำลังดูเฉพาะ: ${buildingOptions.find(([bid]) => String(bid) === String(selectedBuilding))?.[1] ?? 'อาคารที่เลือก'}`}
          </p>
        </div>
      </div>

      {/* แถว filter (ชั้น + สถานะ) */}
      <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-col lg:flex-row gap-4 lg:items-end">
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
            สถานะห้อง
          </label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              color: selectedStatus === 'empty' ? '#16a34a' : 
                     selectedStatus === 'occupied-not-full' ? '#2563eb' : 
                     selectedStatus === 'full' ? '#6b7280' : 
                     selectedStatus === 'maintenance' ? '#ea580c' : 
                     '#374151'
            }}
          >
            <option value="all">ทั้งหมด</option>
            <option value="empty">🟢 ว่าง (ไม่มีคนพัก)</option>
            <option value="occupied-not-full">🔵 มีคนพักไม่เต็ม</option>
            <option value="full">⚫ เต็ม</option>
            <option value="maintenance">🟠 ซ่อมบำรุง</option>
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showInactiveRooms}
            onChange={(e) => setShowInactiveRooms(e.target.checked)}
          />
          แสดงห้องปิดใช้งาน
        </label>
      </div>

      {/* ตัวเลือกแสดงผลและข้อมูลสรุป - แสดงเฉพาะในมุมมองตาราง */}
      {viewMode === 'table' && (
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
      )}

      {/* แสดงตามมุมมองที่เลือก */}
      {viewMode === 'table' ? (
        <>
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
                  <div className="flex items-center gap-2">
                    <span>{room.room_number}</span>
                    {Number(room.is_deleted ?? 0) === 1 ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-700">
                        ปิดใช้งาน
                      </span>
                    ) : null}
                  </div>
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
                    // ตรวจสอบจำนวนผู้เข้าพักจริง (ไม่นับผู้จอง)
                    const occupancy = roomOccupancies.get(room.room_id);
                    const actualOccupants = getActualOccupants(room.room_id);
                    const maxOccupants = occupancy?.max_occupants ?? 2;
                    
                    // ตรวจสอบว่ามีผู้เช่าที่ยังไม่ถึงวันที่เข้าพักหรือไม่
                    const isReserved = hasReservedTenants(room.room_id);
                    
                    // กำหนดสถานะตามจำนวนผู้เข้าพักจริง
                    let displayStatus: 'available' | 'occupied' | 'maintenance' | 'full' | 'reserved' = room.status || 'available';
                    if (room.status === 'maintenance') {
                      // ถ้าเป็น maintenance ให้คงสถานะ maintenance
                      displayStatus = 'maintenance';
                    } else if (actualOccupants >= maxOccupants) {
                      // เต็ม
                      displayStatus = 'full';
                    } else if (actualOccupants > 0) {
                      // ถ้ามีผู้เข้าพักจริงแต่ไม่เต็ม → แสดงเป็น occupied
                      displayStatus = 'occupied';
                    } else if (isReserved) {
                      // ถ้าไม่มีผู้เข้าพักจริงแต่มีผู้จอง → แสดงเป็น reserved
                      displayStatus = 'reserved';
                    } else {
                      // ถ้าไม่มีผู้เข้าพัก → แสดงเป็น available
                      displayStatus = 'available';
                    }
                    
                    const colors = getRoomStatusColor(room, actualOccupants, maxOccupants, room.room_id);
                    
                    return (
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colors.bg} ${colors.text}`}
                  >
                        {displayStatus === 'full' ? 'เต็ม' : displayStatus === 'reserved' ? 'จอง' : getStatusThai(displayStatus)}
                  </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {(() => {
                    const occupancy = roomOccupancies.get(room.room_id);
                    const actualOccupants = getActualOccupants(room.room_id);
                    // ถ้าไม่มี occupancy data แต่มี tenant names ให้คำนวณจาก tenant names
                    if (!occupancy) {
                      const tenants = roomTenants.get(room.room_id);
                      if (tenants && tenants.length > 0) {
                        // ใช้ default max_occupants = 2 ถ้าไม่มีข้อมูล occupancy
                        const maxOccupants = 2; // default
                        const colors = getRoomStatusColor(room, actualOccupants, maxOccupants, room.room_id);
                        return (
                          <span
                            className={`font-medium ${colors.text}`}
                          >
                            {actualOccupants} / {maxOccupants}
                          </span>
                        );
                      }
                      return <span className="text-gray-400">-</span>;
                    }
                    const colors = getRoomStatusColor(room, actualOccupants, occupancy.max_occupants, room.room_id);
                    return (
                      <span
                        className={`font-medium ${colors.text}`}
                      >
                        {actualOccupants} / {occupancy.max_occupants}
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
                    const occupancy = roomOccupancies.get(room.room_id);
                    const currentOccupants = occupancy?.current_occupants ?? tenants.length;
                    const maxOccupants = occupancy?.max_occupants ?? 2;
                    const colors = getRoomStatusColor(room, currentOccupants, maxOccupants, room.room_id);
                    // ใช้สีเดียวกับ text color ของ badge สถานะ โดยแปลงเป็น bg color สำหรับวงกลม
                    // เพื่อให้สีตรงกับ badge สถานะ (text-orange-800 -> bg-orange-800)
                    const circleColor = colors.text.replace('text-', 'bg-');
                    return (
                      <div className="space-y-1">
                        {tenants.map((tenant, index) => (
                          <div key={index} className="flex items-center gap-2 truncate">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${circleColor}`}></span>
                            <span className="truncate">{tenant.first_name} {tenant.last_name}</span>
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
                  <button
                    className="text-blue-600 hover:text-blue-900 mr-3"
                    onClick={() => openEditModal(room)}
                  >
                    แก้ไข
                  </button>
                  {(() => {
                    const isDeletedValue = room.is_deleted ?? 0;
                    const isDeleted = isDeletedValue === 1;
                    const isActive = !isDeleted;
                    
                    return (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => handleToggleActive(room.room_id, !e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
        </>
      ) : (
        /* Floor Plan View */
        <div className="space-y-3">
          {Array.from(roomsByFloor.entries())
            .sort(([a], [b]) => b - a) // เรียงชั้นจากมากไปน้อย (7, 6, 5, 4, 3...)
            .map(([floor, floorRooms]) => {
              // จัดกลุ่มห้องตามหลักร้อย (700s, 600s, 500s...)
              const roomGroups = new Map<number, RoomWithDetails[]>();
              floorRooms.forEach((room) => {
                const roomNum = parseInt(room.room_number, 10);
                if (!isNaN(roomNum)) {
                  const hundred = Math.floor(roomNum / 100) * 100;
                  if (!roomGroups.has(hundred)) {
                    roomGroups.set(hundred, []);
                  }
                  roomGroups.get(hundred)!.push(room);
                }
              });

              return (
                <div key={floor} className="bg-white shadow rounded-lg p-4">
                  <h2 className="text-xl font-bold text-gray-800 mb-2">
                    ชั้น {floor}
                  </h2>
                  {Array.from(roomGroups.entries())
                    .sort(([a], [b]) => b - a) // เรียงกลุ่มจากมากไปน้อย
                    .map(([hundred, groupRooms]) => (
                      <div key={hundred} className="mb-3">
                        <div className="grid grid-cols-12 gap-2">
                          {groupRooms.map((room) => {
                            const tenants = roomTenants.get(room.room_id) || [];
                            const contracts = roomContracts.get(room.room_id) || [];
                            const occupancy = roomOccupancies.get(room.room_id);
                            const actualOccupants = getActualOccupants(room.room_id);
                            const maxOccupants = occupancy?.max_occupants ?? 2;
                            
                            // ใช้ฟังก์ชันเดียวกันกับ table view
                            let colors = getRoomStatusColor(room, actualOccupants, maxOccupants, room.room_id);
                            
                            // ตรวจสอบ end_date ของผู้เช่า - ถ้ามี end_date ที่ใกล้ครบกำหนด (ภายใน 1 สัปดาห์) ให้เปลี่ยนสี
                            const hasNearEndDate = contracts.some(c => {
                              if (!c.end_date) return false;
                              const colorInfo = getMoveOutDateColor(c.end_date);
                              return colorInfo !== null;
                            });
                            
                            if (hasNearEndDate) {
                              // หา end_date ที่ใกล้ที่สุด
                              const nearestEndDate = contracts
                                .filter(c => c.end_date)
                                .map(c => new Date(c.end_date!))
                                .sort((a, b) => a.getTime() - b.getTime())[0];
                              
                              if (nearestEndDate) {
                                const colorInfo = getMoveOutDateColor(nearestEndDate.toISOString().slice(0, 10));
                                if (colorInfo) {
                                  colors = colorInfo;
                                }
                              }
                            }

                            return (
                              <div
                                key={room.room_id}
                                className={`${colors.bg} ${colors.border} border-2 rounded-lg p-2 cursor-pointer hover:shadow-lg transition-all min-h-[80px]`}
                                onClick={() => openDetailsModal(room.room_id)}
                                title={`ห้อง ${room.room_number} - ${tenants.length > 0 ? tenants.map(t => `${t.first_name} ${t.last_name}`).join(', ') : (room.status === 'maintenance' ? 'ซ่อมบำรุง' : 'ว่าง')}${contracts.some(c => c.end_date) ? ` - ครบกำหนดย้ายออก: ${contracts.filter(c => c.end_date).map(c => formatDate(c.end_date!)).join(', ')}` : ''}`}
                              >
                                <div className="text-xs font-bold text-gray-800 mb-1.5 text-center border-b border-gray-300 pb-1">
                                  {room.room_number}
                                </div>
                                <div className="space-y-1">
                                  {(() => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    
                                    // แยกผู้เข้าพักจริงกับผู้จอง
                                    const actualTenants = tenants.filter(tenant => {
                                      if (!tenant.start_date) return true;
                                      try {
                                        const startDate = new Date(tenant.start_date);
                                        startDate.setHours(0, 0, 0, 0);
                                        return startDate <= today;
                                      } catch {
                                        return true;
                                      }
                                    });
                                    
                                    const reservedTenants = tenants.filter(tenant => {
                                      if (!tenant.start_date) return false;
                                      try {
                                        const startDate = new Date(tenant.start_date);
                                        startDate.setHours(0, 0, 0, 0);
                                        return startDate > today;
                                      } catch {
                                        return false;
                                      }
                                    });
                                    
                                    if (actualTenants.length > 0) {
                                      // แสดงผู้เข้าพักจริง
                                      return (
                                        <>
                                          {actualTenants.slice(0, 2).map((tenant, idx) => {
                                            // ตรวจสอบว่า tenant นี้มี end_date ที่ใกล้ครบกำหนดหรือไม่
                                            const hasNearEndDate = tenant.end_date ? (() => {
                                              const colorInfo = getMoveOutDateColor(tenant.end_date);
                                              return colorInfo !== null;
                                            })() : false;
                                            
                                            return (
                                              <div
                                                key={idx}
                                                className={`text-[10px] truncate leading-tight ${
                                                  hasNearEndDate 
                                                    ? 'text-red-800 font-semibold' 
                                                    : 'text-gray-700'
                                                }`}
                                              >
                                                {tenant.first_name} {tenant.last_name}
                                              </div>
                                            );
                                          })}
                                          {actualTenants.length > 2 && (
                                            <div className="text-[9px] text-gray-500 text-center">
                                              +{actualTenants.length - 2} คน
                                            </div>
                                          )}
                                          {/* แสดงผู้จองถ้ามี */}
                                          {reservedTenants.length > 0 && (
                                            <>
                                              <div className="text-[9px] text-purple-600 text-center font-medium mt-1 pt-1 border-t border-purple-200">
                                                (จอง)
                                              </div>
                                              {reservedTenants.slice(0, 2).map((tenant, idx) => (
                                                <div
                                                  key={`reserved-${idx}`}
                                                  className="text-[10px] truncate leading-tight text-purple-700 font-semibold"
                                                >
                                                  {tenant.first_name} {tenant.last_name}
                                                </div>
                                              ))}
                                              {reservedTenants.length > 2 && (
                                                <div className="text-[9px] text-purple-500 text-center">
                                                  +{reservedTenants.length - 2} คน
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </>
                                      );
                                    } else if (reservedTenants.length > 0) {
                                      // แสดงผู้จอง
                                      return (
                                        <>
                                          {reservedTenants.slice(0, 2).map((tenant, idx) => (
                                            <div
                                              key={idx}
                                              className="text-[10px] truncate leading-tight text-purple-700 font-semibold"
                                            >
                                              {tenant.first_name} {tenant.last_name}
                                            </div>
                                          ))}
                                          {reservedTenants.length > 2 && (
                                            <div className="text-[9px] text-purple-500 text-center">
                                              +{reservedTenants.length - 2} คน
                                            </div>
                                          )}
                                          <div className="text-[9px] text-purple-600 text-center font-medium">
                                            (จอง)
                                          </div>
                                        </>
                                      );
                                    } else {
                                      // ไม่มีผู้เข้าพักและผู้จอง
                                      return (
                                        <div className="text-[10px] text-center italic">
                                          {room.status === 'maintenance' ? (
                                            <span className="text-orange-700 font-medium">ซ่อมบำรุง</span>
                                          ) : (
                                            <span className="text-gray-400">ว่าง</span>
                                          )}
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                                {actualOccupants > 0 && (
                                  <div className="text-[9px] text-gray-600 text-center mt-1 pt-1 border-t border-gray-200">
                                    {actualOccupants}/{maxOccupants}
                                  </div>
                                )}
                                {(() => {
                                  const nearEndContracts = contracts.filter(c => {
                                    if (!c.end_date) return false;
                                    const colorInfo = getMoveOutDateColor(c.end_date);
                                    return colorInfo !== null;
                                  });
                                  
                                  if (nearEndContracts.length > 0) {
                                    const nearestEndDate = nearEndContracts
                                      .map(c => new Date(c.end_date!))
                                      .sort((a, b) => a.getTime() - b.getTime())[0];
                                    
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const diffTime = nearestEndDate.getTime() - today.getTime();
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    
                                    return (
                                      <div className="text-[9px] text-center mt-1 pt-1 border-t border-gray-200">
                                        {diffDays < 0 ? (
                                          <span className="text-red-700 font-semibold">⚠️ เกินกำหนด</span>
                                        ) : diffDays <= 7 ? (
                                          <span className="text-yellow-700 font-semibold">⚠️ เหลือ {diffDays} วัน</span>
                                        ) : null}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              );
            })}
          {roomsByFloor.size === 0 && (
            <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
              ไม่พบข้อมูลห้องพัก
            </div>
          )}
          
          {/* แถบอธิบายสีและความหมายของสถานะห้อง */}
          <div className="bg-white shadow rounded-lg p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">คำอธิบายสีและสถานะห้อง</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-green-400 bg-green-100 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">ว่าง</p>
                  <p className="text-[10px] text-gray-500">ไม่มีผู้เข้าพัก</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-purple-400 bg-purple-100 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">จอง</p>
                  <p className="text-[10px] text-gray-500">มีผู้จอง</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-blue-400 bg-blue-100 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">มีคนพัก</p>
                  <p className="text-[10px] text-gray-500">ไม่เต็ม</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-indigo-400 bg-indigo-100 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">มีคนพัก+จอง</p>
                  <p className="text-[10px] text-gray-500">มีทั้งผู้เข้าพักและผู้จอง</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-gray-400 bg-gray-200 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">เต็ม</p>
                  <p className="text-[10px] text-gray-500">เต็มความจุ</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-orange-400 bg-orange-100 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">ซ่อมบำรุง</p>
                  <p className="text-[10px] text-gray-500">อยู่ระหว่างซ่อม</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-yellow-400 bg-yellow-200 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">ใกล้ย้ายออก</p>
                  <p className="text-[10px] text-gray-500">เหลือ ≤ 7 วัน</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border-2 border-red-400 bg-red-200 flex-shrink-0"></div>
                <div>
                  <p className="text-xs font-medium text-gray-800">เกินกำหนด</p>
                  <p className="text-[10px] text-gray-500">เลยกำหนดย้ายออก</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal จัดการประเภทห้องพัก */}
      {isRoomTypesModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  จัดการประเภทห้องพัก
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  เพิ่ม แก้ไข หรือลบประเภทห้อง (ใช้กำหนดจำนวนผู้เข้าพักสูงสุดต่อห้อง)
                </p>
              </div>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
                onClick={closeRoomTypesModal}
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            <div className="border rounded-lg p-3 mb-4 bg-gray-50">
              <p className="text-sm font-medium text-gray-700 mb-2">เพิ่มประเภทใหม่</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  className="border rounded-md px-3 py-2 text-sm"
                  placeholder="ชื่อประเภทห้อง (เช่น ห้องปกติ, VIP)"
                  value={newRoomTypeName}
                  onChange={(e) => setNewRoomTypeName(e.target.value)}
                  disabled={isSavingRoomType}
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="border rounded-md px-3 py-2 text-sm"
                  placeholder="จำนวนผู้เข้าพักสูงสุด"
                  value={newRoomTypeMax}
                  onChange={(e) => setNewRoomTypeMax(e.target.value)}
                  disabled={isSavingRoomType}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleAddRoomType()}
                disabled={isSavingRoomType}
                className="w-full sm:w-auto px-4 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSavingRoomType ? 'กำลังบันทึก...' : 'เพิ่มประเภท'}
              </button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-left text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="px-3 py-2 w-12">#</th>
                    <th className="px-3 py-2">ชื่อประเภท</th>
                    <th className="px-3 py-2 w-24 text-center">สูงสุด (คน)</th>
                    <th className="px-3 py-2 text-right w-36">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {roomTypes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        ไม่มีข้อมูลประเภทห้อง
                      </td>
                    </tr>
                  ) : (
                    roomTypes.map((rt, idx) => (
                      <tr key={rt.room_type_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {editingRoomTypeId === rt.room_type_id ? (
                            <input
                              type="text"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editRoomTypeName}
                              onChange={(e) => setEditRoomTypeName(e.target.value)}
                              disabled={isSavingRoomType}
                            />
                          ) : (
                            <span className="font-medium text-gray-900">
                              {getRoomTypeLabel(rt)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {editingRoomTypeId === rt.room_type_id ? (
                            <input
                              type="number"
                              min={1}
                              max={20}
                              className="w-16 border rounded px-1 py-1 text-sm text-center mx-auto"
                              value={editRoomTypeMax}
                              onChange={(e) => setEditRoomTypeMax(e.target.value)}
                              disabled={isSavingRoomType}
                            />
                          ) : (
                            <span>{rt.max_occupants ?? '-'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {editingRoomTypeId === rt.room_type_id ? (
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => void handleSaveEditRoomType()}
                                disabled={isSavingRoomType}
                                className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                              >
                                บันทึก
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditRoomType}
                                disabled={isSavingRoomType}
                                className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                              >
                                ยกเลิก
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => startEditRoomType(rt)}
                                disabled={isSavingRoomType}
                                className="px-2 py-1 rounded text-amber-700 bg-amber-50 text-xs hover:bg-amber-100"
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteRoomType(rt)}
                                disabled={isSavingRoomType}
                                className="px-2 py-1 rounded text-red-700 bg-red-50 text-xs hover:bg-red-100"
                              >
                                ลบ
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={closeRoomTypesModal}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
              >
                ปิด
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
                      {(() => {
                        if (!roomDetails.room) return '-';
                        
                        // ตรวจสอบว่ามีผู้เช่าที่ยังไม่ถึงวันที่เข้าพักหรือไม่
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const hasReserved = roomDetails.tenants?.some(tenant => {
                          if (!tenant.move_in_date) return false;
                          try {
                            const startDate = new Date(tenant.move_in_date);
                            startDate.setHours(0, 0, 0, 0);
                            return startDate > today;
                          } catch {
                            return false;
                          }
                        }) || false;
                        
                        // นับจำนวนผู้เข้าพักจริง (ไม่นับผู้จอง)
                        const actualOccupants = roomDetails.tenants?.filter(tenant => {
                          if (!tenant.move_in_date) return true;
                          try {
                            const startDate = new Date(tenant.move_in_date);
                            startDate.setHours(0, 0, 0, 0);
                            return startDate <= today;
                          } catch {
                            return true;
                          }
                        }).length || 0;
                        
                        const maxOccupants = roomDetails.occupancy?.max_occupants ?? 2;
                        
                        let displayStatus: 'available' | 'occupied' | 'maintenance' | 'full' | 'reserved' = roomDetails.room.status || 'available';
                        if (roomDetails.room.status === 'maintenance') {
                          displayStatus = 'maintenance';
                        } else if (actualOccupants >= maxOccupants) {
                          displayStatus = 'full';
                        } else if (actualOccupants > 0) {
                          displayStatus = 'occupied';
                        } else if (hasReserved) {
                          displayStatus = 'reserved';
                        } else {
                          displayStatus = 'available';
                        }
                        
                        const colors = getRoomStatusColor(roomDetails.room, actualOccupants, maxOccupants, roomDetails.room?.room_id);
                        
                        return (
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colors.bg} ${colors.text}`}
                          >
                            {displayStatus === 'full' ? 'เต็ม' : displayStatus === 'reserved' ? 'จอง' : getStatusThai(displayStatus)}
                          </span>
                        );
                      })()}
                    </div>
                    {roomDetails.occupancy && (
                      <div>
                        <p className="text-sm text-gray-600">จำนวนผู้เข้าพัก</p>
                        <p className="font-medium">
                          {(() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const actualOccupants = roomDetails.tenants?.filter(tenant => {
                              if (!tenant.move_in_date) return true;
                              try {
                                const startDate = new Date(tenant.move_in_date);
                                startDate.setHours(0, 0, 0, 0);
                                return startDate <= today;
                              } catch {
                                return true;
                              }
                            }).length || 0;
                            const maxOccupants = roomDetails.occupancy.max_occupants;
                            const colors = getRoomStatusColor(roomDetails.room!, actualOccupants, maxOccupants, roomDetails.room?.room_id);
                            return (
                              <>
                                <span className={colors.text}>
                                  {actualOccupants} / {maxOccupants}
                                </span>
                                {actualOccupants >= maxOccupants && (
                                  <span className="ml-1">🔴</span>
                                )}
                                {actualOccupants > 0 && actualOccupants < maxOccupants && (
                                  <span className="ml-1">🟢</span>
                                )}
                              </>
                            );
                          })()}
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
                              <p className="text-sm text-gray-600">หน่วยงาน</p>
                              <p className="font-medium">{tenant.department || '-'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">เบอร์โทร</p>
                              <p className="font-medium">{tenant.phone || '-'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">วันที่เข้าพัก</p>
                              {editingMoveInDate?.contractId === tenant.contract_id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="date"
                                    className="border rounded-md px-2 py-1 text-sm"
                                    value={editingMoveInDate?.date || ''}
                                    onChange={(e) => editingMoveInDate && setEditingMoveInDate({ ...editingMoveInDate, date: e.target.value })}
                                    disabled={isUpdatingMoveInDate}
                                  />
                                  <button
                                    onClick={() => editingMoveInDate && saveMoveInDate(tenant.contract_id!, editingMoveInDate.date)}
                                    disabled={isUpdatingMoveInDate}
                                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:bg-gray-400"
                                  >
                                    บันทึก
                                  </button>
                                  <button
                                    onClick={cancelEditingMoveInDate}
                                    disabled={isUpdatingMoveInDate}
                                    className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:bg-gray-100"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    ตั้งแต่ {formatDate(tenant.move_in_date)}
                                  </p>
                                  {tenant.status === 'active' && tenant.contract_id && (
                                    <button
                                      onClick={() => startEditingMoveInDate(tenant.contract_id!, tenant.move_in_date)}
                                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                                      title="แก้ไขวันที่เข้าพัก"
                                    >
                                      แก้ไข
                                    </button>
                                  )}
                                </div>
                              )}
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
                            <div>
                              <p className="text-sm text-gray-600">วันที่ย้ายออก</p>
                              {editingMoveOutDate?.contractId === tenant.contract_id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="date"
                                    className="border rounded-md px-2 py-1 text-sm"
                                    value={editingMoveOutDate?.date || ''}
                                    onChange={(e) => editingMoveOutDate && setEditingMoveOutDate({ ...editingMoveOutDate, date: e.target.value })}
                                    disabled={isUpdatingMoveOutDate}
                                  />
                                  <button
                                    onClick={() => editingMoveOutDate && saveMoveOutDate(tenant.contract_id!, editingMoveOutDate.date || null)}
                                    disabled={isUpdatingMoveOutDate}
                                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:bg-gray-400"
                                  >
                                    บันทึก
                                  </button>
                                  <button
                                    onClick={cancelEditingMoveOutDate}
                                    disabled={isUpdatingMoveOutDate}
                                    className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:bg-gray-100"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <p className={`font-medium ${
                                    tenant.move_out_date ? (() => {
                                      const colorInfo = getMoveOutDateColor(tenant.move_out_date);
                                      return colorInfo ? colorInfo.text : '';
                                    })() : ''
                                  }`}>
                                    {tenant.move_out_date ? formatDate(tenant.move_out_date) : '-'}
                                    {tenant.move_out_date && (() => {
                                      const colorInfo = getMoveOutDateColor(tenant.move_out_date);
                                      if (colorInfo) {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const moveOutDate = new Date(tenant.move_out_date);
                                        moveOutDate.setHours(0, 0, 0, 0);
                                        const diffTime = moveOutDate.getTime() - today.getTime();
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        if (diffDays <= 7 && diffDays >= 0) {
                                          return <span className="ml-1 text-xs">⚠️ เหลือ {diffDays} วัน</span>;
                                        } else if (diffDays < 0) {
                                          return <span className="ml-1 text-xs">⚠️ เกินกำหนด</span>;
                                        }
                                      }
                                      return null;
                                    })()}
                                  </p>
                                  {tenant.status === 'active' && tenant.contract_id && (
                                    <button
                                      onClick={() => startEditingMoveOutDate(tenant.contract_id!, tenant.move_out_date)}
                                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                                      title="แก้ไขวันที่ย้ายออก"
                                    >
                                      แก้ไข
                                    </button>
                                  )}
                                </div>
                              )}
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

