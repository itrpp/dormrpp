'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';

interface BillingCycle {
  cycle_id: number;
  billing_year: number;
  billing_month: number;
  start_date: string;
  end_date: string;
  due_date: string;
  status: string;
}

interface Room {
  room_id: number;
  room_number: string;
  floor_no: number | null;
  building_name: string;
  building_id: number;
}

interface MeterReading {
  reading_id: number;
  room_id: number;
  cycle_id: number;
  meter_start: number;
  meter_end: number;
  usage: number;
  billing_year: number;
  billing_month: number;
  room_number: string;
  floor_no: number | null;
  building_name: string;
  utility_code: string;
  utility_name: string;
  utility_type_id: number;
}

interface Props {
  initialCycles: BillingCycle[];
  initialRooms: Room[];
  initialReadings: MeterReading[];
}

// ฟังก์ชันจัดรูปแบบตัวเลข
function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num);
}

// ฟังก์ชันแปลงเดือนเป็นชื่อภาษาไทย
function getMonthName(month: number): string {
  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  return monthNames[month - 1] || month.toString();
}

export default function MetersClient({
  initialCycles,
  initialRooms,
  initialReadings,
}: Props) {
  // สำหรับ month picker
  const now = new Date();
  const adYear = now.getFullYear();
  const adMonth = String(now.getMonth() + 1).padStart(2, '0');
  const initialMonthValue = `${adYear}-${adMonth}`;
  const maxMonthValue = `${adYear}-${adMonth}`;
  
  const [monthValue, setMonthValue] = useState<string>(initialMonthValue); // Format: "YYYY-MM" (ค.ศ.) - เริ่มต้นด้วยเดือนปัจจุบัน
  const [selectedCycleId, setSelectedCycleId] = useState<number | ''>('');
  const [selectedFloor, setSelectedFloor] = useState<number | ''>(''); // เปลี่ยนจาก selectedRoomId เป็น selectedFloor
  const [showRoomsWithZeroUsageWater, setShowRoomsWithZeroUsageWater] = useState<boolean>(false); // แสดงห้องที่มีหน่วยใช้งานน้ำ = 0
  const [showRoomsWithZeroUsageElectric, setShowRoomsWithZeroUsageElectric] = useState<boolean>(false); // แสดงห้องที่มีหน่วยใช้งานไฟฟ้า = 0
  
  // State สำหรับดูรูปมิเตอร์
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    photo_id: number;
    photo_path: string;
    utility_type: string;
    meter_value: number;
    reading_date: string;
    room_number: string;
    building_name: string;
  } | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  
  // State สำหรับเก็บสถานะว่ามีรูปหรือไม่ (key: `${room_id}-${billing_year}-${billing_month}-${utility_type}`)
  const [photoStatus, setPhotoStatus] = useState<Map<string, boolean>>(new Map());
  
  // แปลง month value เป็น cycle_id
  useEffect(() => {
    if (monthValue) {
      const [adYearStr, monthStr] = monthValue.split('-');
      const adYear = Number(adYearStr);
      const monthNum = Number(monthStr);
      const beYear = adYear + 543;
      
      // หา cycle_id ที่ตรงกับ year และ month
      const matchingCycle = initialCycles.find(
        cycle => cycle.billing_year === beYear && cycle.billing_month === monthNum
      );
      
      if (matchingCycle) {
        setSelectedCycleId(matchingCycle.cycle_id);
      } else {
        setSelectedCycleId('');
      }
    } else {
      setSelectedCycleId('');
    }
  }, [monthValue, initialCycles]);

  // ดึงสถานะรูปภาพเมื่อเลือกรอบบิล
  useEffect(() => {
    const fetchPhotoStatus = async () => {
      if (!selectedCycleId) {
        setPhotoStatus(new Map());
        return;
      }

      try {
        // หา billing_year และ billing_month จาก cycle_id
        const cycle = initialCycles.find(c => c.cycle_id === selectedCycleId);
        if (!cycle) {
          setPhotoStatus(new Map());
          return;
        }

        // ดึงข้อมูลรูปภาพทั้งหมดในรอบบิลนี้ในครั้งเดียว
        const statusMap = new Map<string, boolean>();
        
        try {
          // ดึงรูปภาพไฟฟ้าทั้งหมดในรอบบิลนี้
          const electricRes = await fetch(
            `/api/meter-photos?year=${cycle.billing_year}&month=${cycle.billing_month}&utility_type=electric`
          );
          if (electricRes.ok) {
            const electricPhotos = await electricRes.json();
            electricPhotos.forEach((photo: any) => {
              const key = `${photo.room_id}-${cycle.billing_year}-${cycle.billing_month}-electric`;
              statusMap.set(key, true);
            });
          }
        } catch (error) {
          console.error('Error fetching electric photos:', error);
        }

        try {
          // ดึงรูปภาพน้ำทั้งหมดในรอบบิลนี้
          const waterRes = await fetch(
            `/api/meter-photos?year=${cycle.billing_year}&month=${cycle.billing_month}&utility_type=water`
          );
          if (waterRes.ok) {
            const waterPhotos = await waterRes.json();
            waterPhotos.forEach((photo: any) => {
              const key = `${photo.room_id}-${cycle.billing_year}-${cycle.billing_month}-water`;
              statusMap.set(key, true);
            });
          }
        } catch (error) {
          console.error('Error fetching water photos:', error);
        }

        setPhotoStatus(statusMap);
      } catch (error) {
        console.error('Error fetching photo status:', error);
        setPhotoStatus(new Map());
      }
    };

    fetchPhotoStatus();
  }, [selectedCycleId, initialCycles]);

  // สร้างรายการชั้นจาก rooms
  const floorOptions = useMemo(() => {
    const floors = new Set<number>();
    initialRooms.forEach((room) => {
      if (room.floor_no != null) {
        floors.add(room.floor_no);
      }
    });
    return Array.from(floors).sort((a, b) => a - b);
  }, [initialRooms]);

  // Filter readings ตามที่เลือก
  const filteredReadings = useMemo(() => {
    let filtered = initialReadings || [];

    // กรองตามรอบบิลที่เลือก (บังคับ - ถ้าเลือกรอบบิลแล้วต้องแสดงเฉพาะรอบบิลนั้น)
    if (selectedCycleId && selectedCycleId !== '') {
      filtered = filtered.filter((r) => {
        // ตรวจสอบ type และค่า cycle_id ให้ตรงกัน
        const readingCycleId = Number(r.cycle_id);
        const selectedCycleIdNum = Number(selectedCycleId);
        return readingCycleId === selectedCycleIdNum;
      });
    } else {
      // ถ้ายังไม่ได้เลือกรอบบิล ให้แสดงเป็น array ว่าง (ไม่แสดงข้อมูล)
      filtered = [];
    }

    // Filter ตามชั้น (แทนที่จะเป็นห้อง)
    if (selectedFloor !== '') {
      filtered = filtered.filter((r) => r.floor_no === selectedFloor);
    }

    return filtered;
  }, [initialReadings, selectedCycleId, selectedFloor, showRoomsWithZeroUsageWater, showRoomsWithZeroUsageElectric]);

  // จัดกลุ่มตามห้องและรอบบิล
  const groupedReadings = useMemo(() => {
    const grouped: Record<string, {
      room: { room_id: number; room_number: string; building_name: string; floor_no: number | null };
      cycle: { cycle_id: number; billing_year: number; billing_month: number };
      water: MeterReading | null;
      electric: MeterReading | null;
    }> = {};

    // เพิ่ม readings ที่มีอยู่
    if (filteredReadings && filteredReadings.length > 0) {
           filteredReadings.forEach((reading) => {
             if (!reading || !reading.room_id || !reading.cycle_id) {
               return;
             }

        const key = `${reading.room_id}-${reading.cycle_id}`;
        if (!grouped[key]) {
          grouped[key] = {
            room: {
              room_id: reading.room_id,
              room_number: String(reading.room_number || ''),
              building_name: String(reading.building_name || ''),
              floor_no: reading.floor_no,
            },
            cycle: {
              cycle_id: reading.cycle_id,
              billing_year: reading.billing_year,
              billing_month: reading.billing_month,
            },
            water: null,
            electric: null,
          };
        }

        if (reading.utility_code === 'water') {
          grouped[key].water = reading;
        } else if (reading.utility_code === 'electric') {
          grouped[key].electric = reading;
        }
      });
    }

    // Filter ตาม checkbox: แสดงเฉพาะห้องที่มีหน่วยใช้งาน = 0
    let result = Object.values(grouped);

    // ถ้าเลือกทั้งสอง checkbox ให้แสดงห้องที่มีหน่วยใช้งาน = 0 ทั้งน้ำและไฟ
    if (showRoomsWithZeroUsageWater && showRoomsWithZeroUsageElectric) {
      result = result.filter((group) => {
        const waterUsage = group.water?.usage ?? (group.water ? (group.water.meter_end - group.water.meter_start) : 0);
        const electricUsage = group.electric?.usage ?? (group.electric ? (group.electric.meter_end - group.electric.meter_start) : 0);
        return waterUsage === 0 && electricUsage === 0;
      });
    } else if (showRoomsWithZeroUsageWater) {
      // Filter ห้องที่มีหน่วยใช้งานน้ำ = 0
      result = result.filter((group) => {
        const waterUsage = group.water?.usage ?? (group.water ? (group.water.meter_end - group.water.meter_start) : 0);
        return waterUsage === 0;
      });
    } else if (showRoomsWithZeroUsageElectric) {
      // Filter ห้องที่มีหน่วยใช้งานไฟฟ้า = 0
      result = result.filter((group) => {
        const electricUsage = group.electric?.usage ?? (group.electric ? (group.electric.meter_end - group.electric.meter_start) : 0);
        return electricUsage === 0;
      });
    }

    // ถ้าไม่เลือก checkbox ใดๆ ให้แสดงทั้งหมด
    // (ไม่ต้อง filter เพิ่ม)

    // Sort
    result.sort((a, b) => {
      // เรียงตามรอบบิล (ใหม่สุดก่อน) แล้วตามอาคารและห้อง
      if (a.cycle.billing_year !== b.cycle.billing_year) {
        return b.cycle.billing_year - a.cycle.billing_year;
      }
      if (a.cycle.billing_month !== b.cycle.billing_month) {
        return b.cycle.billing_month - a.cycle.billing_month;
      }
      if (a.room.building_name !== b.room.building_name) {
        const buildingA = String(a.room.building_name || '');
        const buildingB = String(b.room.building_name || '');
        return buildingA.localeCompare(buildingB, 'th');
      }
      const roomA = String(a.room.room_number || '');
      const roomB = String(b.room.room_number || '');
      return roomA.localeCompare(roomB, 'th');
    });

    return result;
  }, [filteredReadings, showRoomsWithZeroUsageWater, showRoomsWithZeroUsageElectric, selectedCycleId, selectedFloor, initialRooms, initialCycles]);

  // ฟังก์ชันดึงและแสดงรูปมิเตอร์
  const viewMeterPhoto = async (roomId: number, utilityType: 'electric' | 'water', billingYear: number, billingMonth: number, roomNumber: string, buildingName: string) => {
    setLoadingPhoto(true);
    setPhotoModalOpen(true);
    setSelectedPhoto(null);
    
    try {
      const response = await fetch(
        `/api/meter-photos?room_id=${roomId}&year=${billingYear}&month=${billingMonth}&utility_type=${utilityType}`
      );
      
      if (!response.ok) {
        throw new Error('ไม่สามารถดึงรูปมิเตอร์ได้');
      }
      
      const photos = await response.json();
      
      if (photos && photos.length > 0) {
        // เลือกรูปแรก (หรือรูปล่าสุด)
        const photo = photos[0];
        setSelectedPhoto({
          photo_id: photo.photo_id,
          photo_path: photo.photo_path,
          utility_type: photo.utility_type,
          meter_value: photo.meter_value,
          reading_date: photo.reading_date,
          room_number: roomNumber,
          building_name: buildingName,
        });
      } else {
        // ไม่พบรูป
        setSelectedPhoto(null);
      }
    } catch (error: any) {
      console.error('Error fetching meter photo:', error);
      setSelectedPhoto(null);
    } finally {
      setLoadingPhoto(false);
    }
  };

  // ปิด modal
  const closePhotoModal = () => {
    setPhotoModalOpen(false);
    setSelectedPhoto(null);
  };

  return (
    <div>
        {/* Filters */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
            🔍 กรองข้อมูล
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📅 เลือกรอบบิล (เดือน/ปี)
              </label>
              <input
                type="month"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                max={maxMonthValue}
              />
              {monthValue && (
                <p className="mt-2 text-xs text-gray-500">
                  {(() => {
                    const [adYearStr, monthStr] = monthValue.split('-');
                    const adYear = Number(adYearStr);
                    const monthNum = Number(monthStr);
                    const beYear = adYear + 543;
                    return `รอบบิล: ${getMonthName(monthNum)} ${beYear} `;
                  })()}
                </p>
              )}
              {selectedCycleId && (
                <p className="mt-1 text-sm text-green-600 font-medium">
                  ✓ พร้อมแสดงข้อมูล
                </p>
              )}
              {monthValue && !selectedCycleId && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠️ ไม่พบรอบบิลสำหรับเดือน/ปีที่เลือก
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชั้น
              </label>
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">ทุกชั้น</option>
                {floorOptions.map((floor) => (
                  <option key={floor} value={floor}>
                    ชั้น {floor}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRoomsWithZeroUsageWater}
                  onChange={(e) => setShowRoomsWithZeroUsageWater(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  💧 แสดงห้องที่ใช้น้ำ = 0 หน่วย
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRoomsWithZeroUsageElectric}
                  onChange={(e) => setShowRoomsWithZeroUsageElectric(e.target.checked)}
                  className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  ⚡ แสดงห้องที่ใช้ไฟฟ้า = 0 หน่วย
                </span>
              </label>
              {(showRoomsWithZeroUsageWater || showRoomsWithZeroUsageElectric) && (
                <p className="mt-1 text-xs text-gray-500">
                  {showRoomsWithZeroUsageWater && showRoomsWithZeroUsageElectric
                    ? 'แสดงเฉพาะห้องที่ใช้น้ำและไฟฟ้า = 0 หน่วย'
                    : showRoomsWithZeroUsageWater
                    ? 'แสดงเฉพาะห้องที่ใช้น้ำ = 0 หน่วย'
                    : 'แสดงเฉพาะห้องที่ใช้ไฟฟ้า = 0 หน่วย'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    No.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ห้อง
                  </th>
                  <th colSpan={4} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                    ⚡ มิเตอร์ไฟฟ้า
                  </th>
                  <th colSpan={4} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                    💧 มิเตอร์น้ำ
                  </th>
                </tr>
                <tr className="bg-gray-50">
                  <th></th>
                  <th></th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 border-l border-gray-200">
                    เริ่มต้น
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    สิ้นสุด
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    ใช้ไป (หน่วย)
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    รูปภาพ
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 border-l border-gray-200">
                    เริ่มต้น
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    สิ้นสุด
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    ใช้ไป (หน่วย)
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    รูปภาพ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedReadings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <p>ไม่พบข้อมูล</p>
                        {initialReadings.length === 0 && (
                          <p className="text-xs text-gray-400">
                            ไม่มีข้อมูลในตาราง bill_utility_readings
                          </p>
                        )}
                        {initialReadings.length > 0 && filteredReadings.length === 0 && (
                          <p className="text-xs text-gray-400">
                            ไม่พบข้อมูลที่ตรงกับเงื่อนไขที่เลือก
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  groupedReadings.map((group, idx) => (
                    <tr key={`${group.room.room_id}-${group.cycle.cycle_id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-600">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {group.room.room_number}
                      </td>
                      {/* มิเตอร์ไฟฟ้า */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600 border-l border-gray-200">
                        {group.electric ? formatNumber(group.electric.meter_start) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {group.electric ? formatNumber(group.electric.meter_end) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-yellow-600">
                        {group.electric ? formatNumber(group.electric.usage ?? (group.electric.meter_end - group.electric.meter_start)) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {group.electric ? (() => {
                          const photoKey = `${group.room.room_id}-${group.cycle.billing_year}-${group.cycle.billing_month}-electric`;
                          const hasPhoto = photoStatus.get(photoKey) || false;
                          
                          return (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  if (!hasPhoto) return;
                                  viewMeterPhoto(
                                    group.room.room_id,
                                    'electric',
                                    group.cycle.billing_year,
                                    group.cycle.billing_month,
                                    group.room.room_number,
                                    group.room.building_name
                                  );
                                }}
                                disabled={!hasPhoto}
                                className={`text-sm px-2 py-1 rounded transition-colors flex items-center justify-center ${
                                  hasPhoto
                                    ? 'text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 cursor-pointer'
                                    : 'text-gray-400 bg-gray-50 cursor-not-allowed'
                                }`}
                                title={hasPhoto ? 'ดูรูปมิเตอร์ไฟฟ้า' : 'ยังไม่มีรูปมิเตอร์ไฟฟ้า'}
                              >
                                📷
                              </button>
                              {hasPhoto ? (
                                <span className="text-[11px] text-green-600 font-medium">
                                  เปิดดูรูป
                                </span>
                              ) : (
                                <span className="text-[11px] text-gray-400">
                                  ยังไม่มีรูป
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {/* มิเตอร์น้ำ */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600 border-l border-gray-200">
                        {group.water ? formatNumber(group.water.meter_start) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {group.water ? formatNumber(group.water.meter_end) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-blue-600">
                        {group.water ? formatNumber(group.water.usage ?? (group.water.meter_end - group.water.meter_start)) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {group.water ? (() => {
                          const photoKey = `${group.room.room_id}-${group.cycle.billing_year}-${group.cycle.billing_month}-water`;
                          const hasPhoto = photoStatus.get(photoKey) || false;
                          
                          return (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  if (!hasPhoto) return;
                                  viewMeterPhoto(
                                    group.room.room_id,
                                    'water',
                                    group.cycle.billing_year,
                                    group.cycle.billing_month,
                                    group.room.room_number,
                                    group.room.building_name
                                  );
                                }}
                                disabled={!hasPhoto}
                                className={`text-sm px-2 py-1 rounded transition-colors flex items-center justify-center ${
                                  hasPhoto
                                    ? 'text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 cursor-pointer'
                                    : 'text-gray-400 bg-gray-50 cursor-not-allowed'
                                }`}
                                title={hasPhoto ? 'ดูรูปมิเตอร์น้ำ' : 'ยังไม่มีรูปมิเตอร์น้ำ'}
                              >
                                📷
                              </button>
                              {hasPhoto ? (
                                <span className="text-[11px] text-green-600 font-medium">
                                  เปิดดูรูป
                                </span>
                              ) : (
                                <span className="text-[11px] text-gray-400">
                                  ยังไม่มีรูป
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 text-sm text-gray-600 text-center space-y-1">
          {groupedReadings.length > 0 ? (
            <p>แสดง {groupedReadings.length} รายการ</p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-500">ไม่พบข้อมูล</p>
              <div className="text-xs text-gray-400 space-y-1">
                <p>ข้อมูลเริ่มต้น: {initialReadings?.length || 0} รายการ</p>
                <p>ข้อมูลที่กรองแล้ว: {filteredReadings?.length || 0} รายการ</p>
                <p>รอบบิลทั้งหมด: {initialCycles?.length || 0} รอบ</p>
                <p>ห้องทั้งหมด: {initialRooms?.length || 0} ห้อง</p>
              </div>
            </div>
          )}
        </div>

      {/* Modal สำหรับแสดงรูปมิเตอร์ */}
      {photoModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={closePhotoModal}>
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                {selectedPhoto ? (
                  `รูปมิเตอร์${selectedPhoto.utility_type === 'electric' ? 'ไฟฟ้า' : 'น้ำ'} - ${selectedPhoto.building_name} ห้อง ${selectedPhoto.room_number}`
                ) : (
                  'รูปมิเตอร์'
                )}
              </h2>
              <button
                onClick={closePhotoModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              {loadingPhoto ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <span className="ml-4 text-gray-600">กำลังโหลดรูปภาพ...</span>
                </div>
              ) : selectedPhoto ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">ค่าที่อ่านได้:</span>
                        <span className="ml-2 text-gray-900">{formatNumber(selectedPhoto.meter_value)}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">วันที่อ่าน:</span>
                        <span className="ml-2 text-gray-900">
                          {new Date(selectedPhoto.reading_date).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <img
                      src={`/api/meter-photos/${selectedPhoto.photo_id}/download`}
                      alt={`มิเตอร์${selectedPhoto.utility_type === 'electric' ? 'ไฟฟ้า' : 'น้ำ'}`}
                      className="max-w-full h-auto rounded-lg shadow-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-image.png';
                        (e.target as HTMLImageElement).alt = 'ไม่พบรูปภาพ';
                      }}
                    />
                  </div>
                  
                  <div className="text-center">
                    <a
                      href={`/api/meter-photos/${selectedPhoto.photo_id}/download`}
                      download
                      className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      ดาวน์โหลดรูปภาพ
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">ไม่พบรูปภาพสำหรับมิเตอร์นี้</p>
                  <p className="text-gray-400 text-sm mt-2">กรุณาตรวจสอบว่ามีการอัปโหลดรูปภาพแล้วหรือไม่</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

