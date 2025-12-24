'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Building } from '@/types/db';

interface Room {
  room_id: number;
  room_number: string;
  floor_no: number | null;
  building_id: number;
  building_name: string;
  room_type_name: string | null;
  max_occupants: number;
  current_occupants: number;
  status?: 'available' | 'occupied' | 'maintenance';
}

interface RoomOccupancy {
  room_id: number;
  room_number: string;
  building_name: string;
  room_type_name: string | null;
  max_occupants: number;
  current_occupants: number;
  occupancy_status: 'empty' | 'available' | 'full';
}

type TenantForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  start_date: string; // yyyy-mm-dd
  notes: string;
};

type TenantSearchResult = {
  tenant_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  last_room_id?: number | null;
  last_room_number?: string | null;
  last_start_date?: string | null;
  last_end_date?: string | null;
  last_contract_status?: string | null;
};

// แปลงวันที่เป็นรูปแบบไทยอ่านง่าย
const formatThaiDate = (isoString: string | null | undefined): string => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function AddTenantClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialRoomIdParam = searchParams.get('room_id');
  const initialRoomId = initialRoomIdParam ? Number(initialRoomIdParam) : null;
  const [initializedFromRoom, setInitializedFromRoom] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
  const [selectedFloor, setSelectedFloor] = useState<string>('all');
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomOccupancy, setRoomOccupancy] = useState<RoomOccupancy | null>(null);
  const [selectedRoomStatus, setSelectedRoomStatus] = useState<'available' | 'occupied' | 'maintenance' | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingOccupancy, setIsLoadingOccupancy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // โหมดการเพิ่มผู้เช่า: new = ผู้เช่าใหม่, existing = ผู้เช่าเคยพักแล้ว
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TenantSearchResult[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null);

  const [form, setForm] = useState<TenantForm>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    start_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  // ดึงข้อมูลอาคาร
  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        const res = await fetch('/api/buildings');
        if (res.ok) {
          const data = await res.json();
          setBuildings(data);
        }
      } catch (error) {
        console.error('Error fetching buildings:', error);
      }
    };
    fetchBuildings();
  }, []);

  // ถ้ามี room_id มาจาก query ให้ตั้งค่าอาคารและห้องเริ่มต้นตามห้องนั้น
  useEffect(() => {
    const initFromRoom = async () => {
      if (!initialRoomId || initializedFromRoom) return;
      try {
        const res = await fetch(`/api/rooms/${initialRoomId}/details`);
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (data?.room?.building_id) {
          // กำหนดอาคารให้ตรงกับห้องนั้น
          setSelectedBuildingId(String(data.room.building_id));
        }
      } catch (error) {
        console.error('Error initializing room from query:', error);
      } finally {
        setInitializedFromRoom(true);
      }
    };

    initFromRoom();
  }, [initialRoomId, initializedFromRoom]);

  // ดึงข้อมูลห้องตามอาคารและชั้น
  useEffect(() => {
    const fetchRooms = async () => {
      if (selectedBuildingId === 'all') {
        setRooms([]);
        setSelectedRoomId(null);
        return;
      }

      setIsLoadingRooms(true);
      try {
        let url = `/api/rooms?building_id=${selectedBuildingId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          // กรองตามชั้น
          let filteredRooms = data;
          if (selectedFloor !== 'all') {
            filteredRooms = data.filter((r: any) => r.floor_no === Number(selectedFloor));
          }
          setRooms(filteredRooms);

          // ถ้ามี initialRoomId ให้เลือกห้องนั้นอัตโนมัติ
          if (initialRoomId) {
            const found = filteredRooms.find((r: any) => r.room_id === initialRoomId);
            if (found) {
              setSelectedRoomId(initialRoomId);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching rooms:', error);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    fetchRooms();
  }, [selectedBuildingId, selectedFloor, initialRoomId]);

  // ดึงข้อมูลสถานะผู้เข้าพักและสถานะห้องเมื่อเลือกห้อง
  useEffect(() => {
    const fetchOccupancy = async () => {
      if (!selectedRoomId) {
        setRoomOccupancy(null);
        setSelectedRoomStatus(null);
        return;
      }

      setIsLoadingOccupancy(true);
      try {
        // ดึงข้อมูล occupancy
        const occupancyRes = await fetch(`/api/rooms/occupancy?room_id=${selectedRoomId}`);
        if (occupancyRes.ok) {
          const data = await occupancyRes.json();
          // ตรวจสอบว่า data มี current_occupants และ max_occupants
          if (data && typeof data.current_occupants === 'number' && typeof data.max_occupants === 'number') {
            setRoomOccupancy(data);
          } else {
            // ถ้าข้อมูลไม่ครบ ให้ใช้ค่า default
            setRoomOccupancy({
              ...data,
              current_occupants: data.current_occupants ?? 0,
              max_occupants: data.max_occupants ?? 2,
            });
          }
        } else {
          // ถ้า API error ให้ set เป็น null เพื่อแสดง "ไม่พบข้อมูลห้อง"
          setRoomOccupancy(null);
          console.error('Failed to fetch occupancy:', occupancyRes.status);
        }

        // ดึงข้อมูลสถานะห้องจาก room details
        const detailsRes = await fetch(`/api/rooms/${selectedRoomId}/details`);
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          if (detailsData?.room?.status) {
            setSelectedRoomStatus(detailsData.room.status);
          } else {
            // ถ้าไม่มี status ให้ดึงจาก rooms array
            const room = rooms.find(r => r.room_id === selectedRoomId);
            setSelectedRoomStatus(room?.status || null);
          }
        } else {
          // ถ้า API error ให้ดึงจาก rooms array
          const room = rooms.find(r => r.room_id === selectedRoomId);
          setSelectedRoomStatus(room?.status || null);
        }
      } catch (error) {
        console.error('Error fetching room occupancy:', error);
        setRoomOccupancy(null);
        // ถ้า error ให้ดึงจาก rooms array
        const room = rooms.find(r => r.room_id === selectedRoomId);
        setSelectedRoomStatus(room?.status || null);
      } finally {
        setIsLoadingOccupancy(false);
      }
    };

    fetchOccupancy();
  }, [selectedRoomId, rooms]);

  // สร้างรายการชั้น
  const floorOptions = useMemo(() => {
    const floors = new Set<number>();
    rooms.forEach((room) => {
      if (room.floor_no != null) {
        floors.add(room.floor_no);
      }
    });
    return Array.from(floors).sort((a, b) => a - b);
  }, [rooms]);

  // ตรวจสอบว่าห้องเต็มหรือไม่
  const isRoomFull = roomOccupancy 
    ? roomOccupancy.current_occupants >= roomOccupancy.max_occupants
    : false;

  // ตรวจสอบว่าห้องอยู่ในสถานะ maintenance หรือไม่
  const isRoomMaintenance = selectedRoomStatus === 'maintenance';

  const canAddTenant = !isRoomFull && !isRoomMaintenance && selectedRoomId !== null;

  // ค้นหาผู้เช่าเก่า
  const handleSearchTenants = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/tenants?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!res.ok) {
        throw new Error('ค้นหาผู้เช่าไม่สำเร็จ');
      }
      const data = await res.json();
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching tenants:', error);
      alert('ไม่สามารถค้นหาผู้เช่าได้');
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search เมื่อพิมพ์ (debounce)
  useEffect(() => {
    if (mode !== 'existing' || !canAddTenant) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearchTenants();
      } else {
        setSearchResults([]);
      }
    }, 500); // debounce 500ms

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, mode, canAddTenant]);

  // จับ Enter key เพื่อค้นหา
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchTenants();
    }
  };

  // บันทึกผู้เช่า
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRoomId) {
      alert('กรุณาเลือกห้อง');
      return;
    }

    if (mode === 'new') {
      if (!form.first_name || !form.last_name) {
        alert('กรุณากรอกชื่อและนามสกุล');
        return;
      }
    } else {
      if (!selectedTenant) {
        alert('กรุณาเลือกผู้เช่าที่เคยพักแล้ว');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const selectedRoom = rooms.find(r => r.room_id === selectedRoomId);
      if (!selectedRoom) {
        throw new Error('ไม่พบข้อมูลห้อง');
      }

      if (mode === 'new') {
        // โหมดผู้เช่าใหม่: ใช้ API เดิม /api/tenants เพื่อสร้าง tenant + contract
        const res = await fetch('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email || null,
            phone: form.phone || null,
            room_number: selectedRoom.room_number,
            status: 'active',
            move_in_date: form.start_date || new Date().toISOString().slice(0, 10),
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'ไม่สามารถเพิ่มผู้เช่าได้');
        }

        alert('เพิ่มผู้เช่าใหม่สำเร็จ');
      } else {
        // โหมดผู้เช่าเคยพักแล้ว: สร้าง contract ใหม่ให้ tenant เดิม
        const res = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: selectedTenant!.tenant_id,
            room_id: selectedRoom.room_id,
            start_date: form.start_date || new Date().toISOString().slice(0, 10),
            status: 'active',
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'ไม่สามารถสร้างสัญญาใหม่ได้');
        }

        alert('สร้างสัญญาใหม่ให้ผู้เช่าที่เคยพักแล้วสำเร็จ');
      }

      router.push('/admin/rooms');
    } catch (error: any) {
      console.error('Error creating tenant:', error);
      alert(`ไม่สามารถเพิ่มผู้เช่าได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-800 mb-4 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          กลับ
        </button>
        <h1 className="text-3xl font-bold text-gray-800">เพิ่มผู้เช่าใหม่</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ส่วนซ้าย: เลือกห้อง */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">เลือกห้อง</h2>
            
            {/* กรณีมาจากห้องที่ระบุใน URL: แสดงเป็นข้อความ ไม่ต้องเลือกใหม่ */}
            {initialRoomId ? (
              <div className="space-y-3 text-sm text-gray-800">
                <div>
                  <span className="font-medium">อาคาร:</span>{' '}
                  {(() => {
                    const room = rooms.find((r) => r.room_id === initialRoomId);
                    if (room) return room.building_name;
                    const building = buildings.find(
                      (b) => String(b.building_id) === selectedBuildingId
                    );
                    return building?.name_th || '-';
                  })()}
                </div>
                <div>
                  <span className="font-medium">ชั้น:</span>{' '}
                  {(() => {
                    const room = rooms.find((r) => r.room_id === initialRoomId);
                    return room?.floor_no != null ? `ชั้น ${room.floor_no}` : '-';
                  })()}
                </div>
                <div>
                  <span className="font-medium">ห้อง:</span>{' '}
                  {(() => {
                    const room = rooms.find((r) => r.room_id === initialRoomId);
                    return room
                      ? `ห้อง ${room.room_number}${
                          room.floor_no ? ` (ชั้น ${room.floor_no})` : ''
                        }`
                      : '-';
                  })()}
                </div>
              </div>
            ) : (
              <>
                {/* เลือกอาคาร */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อาคาร <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={selectedBuildingId}
                    onChange={(e) => {
                      setSelectedBuildingId(e.target.value);
                      setSelectedFloor('all');
                      setSelectedRoomId(null);
                    }}
                  >
                    <option value="all">-- เลือกอาคาร --</option>
                    {buildings.map((building) => (
                      <option key={building.building_id} value={building.building_id}>
                        {building.name_th}
                      </option>
                    ))}
                  </select>
                </div>

                {/* เลือกชั้น */}
                {selectedBuildingId !== 'all' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ชั้น
                    </label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      value={selectedFloor}
                      onChange={(e) => {
                        setSelectedFloor(e.target.value);
                        setSelectedRoomId(null);
                      }}
                      disabled={isLoadingRooms}
                    >
                      <option value="all">ทุกชั้น</option>
                      {floorOptions.map((floor) => (
                        <option key={floor} value={floor}>
                          ชั้น {floor}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* เลือกห้อง */}
                {selectedBuildingId !== 'all' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ห้อง <span className="text-red-500">*</span>
                    </label>
                    {isLoadingRooms ? (
                      <div className="text-sm text-gray-500">กำลังโหลด...</div>
                    ) : (
                      <select
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        value={selectedRoomId || ''}
                        onChange={(e) =>
                          setSelectedRoomId(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      >
                        <option value="">-- เลือกห้อง --</option>
                        {rooms.map((room) => (
                          <option key={room.room_id} value={room.room_id}>
                            ห้อง {room.room_number}
                            {room.floor_no ? ` (ชั้น ${room.floor_no})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ส่วนขวา: การ์ดสถานะ + ฟอร์ม */}
        <div className="lg:col-span-2">
          {/* การ์ดสถานะห้อง */}
          {selectedRoomId && (
            <div className="bg-white shadow rounded-lg p-4 mb-6">
              {isLoadingOccupancy ? (
                <div className="text-center py-4 text-gray-500">กำลังโหลดข้อมูล...</div>
              ) : roomOccupancy ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-800">
                      ห้อง {roomOccupancy.room_number}
                      {roomOccupancy.room_type_name && (
                        <span className="text-sm font-normal text-gray-600 ml-2">
                          ({roomOccupancy.room_type_name})
                        </span>
                      )}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-600">
                      ผู้เข้าพัก: <span className="font-semibold">
                        {roomOccupancy.current_occupants ?? 0} / {roomOccupancy.max_occupants ?? 2}
                      </span>
                      {roomOccupancy.room_type_name && (
                        <span className="text-xs text-gray-500 ml-2">
                          (ประเภท: {roomOccupancy.room_type_name})
                        </span>
                      )}
                    </div>
                    {isRoomMaintenance ? (
                      <div className="flex items-center gap-2 text-orange-600 font-semibold">
                        <span>🔧</span>
                        <span>ห้องนี้อยู่ในสถานะซ่อมบำรุง</span>
                      </div>
                    ) : isRoomFull ? (
                      <div className="flex items-center gap-2 text-red-600 font-semibold">
                        <span>🔴</span>
                        <span>ห้องนี้เต็มแล้ว</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600 font-semibold">
                        <span>🟢</span>
                        <span>
                          ว่างอีก {Math.max(0, (roomOccupancy.max_occupants ?? 2) - (roomOccupancy.current_occupants ?? 0))} คน
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">ไม่พบข้อมูลห้อง</div>
              )}
            </div>
          )}

          {/* ฟอร์มเพิ่มผู้เช่า */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">ข้อมูลผู้เช่า</h2>

            {/* โหมดผู้เช่าใหม่ / ผู้เช่าเคยพักแล้ว */}
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="mode-new"
                  name="tenant-mode"
                  value="new"
                  checked={mode === 'new'}
                  onChange={() => {
                    setMode('new');
                    setSelectedTenant(null);
                  }}
                />
                <label htmlFor="mode-new" className="text-sm text-gray-700">
                  ผู้เช่าใหม่
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="mode-existing"
                  name="tenant-mode"
                  value="existing"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                />
                <label htmlFor="mode-existing" className="text-sm text-gray-700">
                  ผู้เช่าเคยพักแล้ว
                </label>
              </div>
            </div>

            {/* ส่วนค้นหาและเลือกผู้เช่าเก่า */}
            {mode === 'existing' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค้นหาผู้เช่า (ชื่อ, เบอร์, อีเมล)
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="เช่น นางสาว..., 08x..., email@example.com"
                    disabled={!canAddTenant}
                  />
                  <button
                    type="button"
                    onClick={handleSearchTenants}
                    disabled={!canAddTenant || isSearching}
                    className="px-4 py-2 rounded-md bg-gray-700 text-white text-sm hover:bg-gray-800 disabled:bg-gray-400"
                  >
                    {isSearching ? 'กำลังค้นหา...' : 'ค้นหา'}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                    {searchResults.map((t) => (
                      <button
                        key={t.tenant_id}
                        type="button"
                        onClick={() => setSelectedTenant(t)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                          selectedTenant?.tenant_id === t.tenant_id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="font-medium">
                          {t.first_name} {t.last_name}
                          {t.status && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              สถานะ: {t.status}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          {t.phone && <span>โทร: {t.phone} </span>}
                          {t.email && <span>| อีเมล: {t.email}</span>}
                        </div>
                        {t.last_room_number && (
                          <div className="text-xs text-gray-500 mt-1">
                            เคยพัก: ห้อง {t.last_room_number}{' '}
                            {t.last_start_date && (
                              <span>
                                (
                                {formatThaiDate(t.last_start_date)}
                                {t.last_end_date
                                  ? ` – ${formatThaiDate(t.last_end_date)}`
                                  : ' – ปัจจุบัน'}
                                )
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedTenant && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-900">
                    <div className="font-semibold">
                      เลือกผู้เช่า: {selectedTenant.first_name} {selectedTenant.last_name}
                    </div>
                    <div className="text-xs">
                      {selectedTenant.phone && <span>โทร: {selectedTenant.phone} </span>}
                      {selectedTenant.email && <span>| อีเมล: {selectedTenant.email}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {!selectedRoomId && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ กรุณาเลือกห้องก่อนกรอกข้อมูลผู้เช่า
                </p>
              </div>
            )}
            {selectedRoomId && isRoomMaintenance && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-orange-800 font-semibold">
                  🔧 ห้องนี้อยู่ในสถานะซ่อมบำรุง (maintenance) ไม่สามารถเพิ่มผู้เช่าได้
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={mode === 'new' ? form.first_name : selectedTenant?.first_name || ''}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required={mode === 'new'}
                    disabled={!canAddTenant || mode === 'existing'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    นามสกุล <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={mode === 'new' ? form.last_name : selectedTenant?.last_name || ''}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required={mode === 'new'}
                    disabled={!canAddTenant || mode === 'existing'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เบอร์โทร
                  </label>
                  <input
                    type="tel"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={mode === 'new' ? form.phone : selectedTenant?.phone || ''}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={!canAddTenant || mode === 'existing'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อีเมล
                  </label>
                  <input
                    type="email"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={mode === 'new' ? form.email : selectedTenant?.email || ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={!canAddTenant || mode === 'existing'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่เริ่มสัญญา <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    required
                    disabled={!canAddTenant}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมายเหตุ
                  </label>
                  <textarea
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    disabled={!canAddTenant}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-4 py-2 rounded-md border hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!canAddTenant || isSubmitting}
                  className={`px-4 py-2 rounded-md text-white ${
                    canAddTenant
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                  title={!canAddTenant ? (isRoomMaintenance ? 'ห้องนี้อยู่ในสถานะซ่อมบำรุง' : 'ห้องนี้มีผู้เข้าพักครบแล้ว') : ''}
                >
                  {isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
