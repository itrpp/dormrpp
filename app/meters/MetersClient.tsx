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

// ฟังก์ชันจัดรูปแบบตัวเลข (ไม่ใส่ comma)
function formatNumber(num: number): string {
  return num.toString();
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

  // Debug: Log initial data
  console.log('[MetersClient] Initial data:', {
    cyclesCount: initialCycles?.length || 0,
    roomsCount: initialRooms?.length || 0,
    readingsCount: initialReadings?.length || 0,
    sampleReading: initialReadings?.[0],
  });

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

    if (selectedCycleId) {
      filtered = filtered.filter((r) => r.cycle_id === selectedCycleId);
    }

    // Filter ตามชั้น (แทนที่จะเป็นห้อง)
    if (selectedFloor !== '') {
      filtered = filtered.filter((r) => r.floor_no === selectedFloor);
    }

    console.log('[MetersClient] Filtered readings:', {
      selectedCycleId,
      selectedFloor,
      showRoomsWithZeroUsageWater,
      showRoomsWithZeroUsageElectric,
      filteredCount: filtered.length,
    });

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
          console.warn('[MetersClient] Invalid reading:', reading);
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

    console.log('[MetersClient] Grouped readings:', {
      totalGroups: result.length,
      showRoomsWithZeroUsageWater,
      showRoomsWithZeroUsageElectric,
      sampleGroup: result[0],
    });

    return result;
  }, [filteredReadings, showRoomsWithZeroUsageWater, showRoomsWithZeroUsageElectric, selectedCycleId, selectedFloor, initialRooms, initialCycles]);

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
                  <th colSpan={3} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                    ⚡ มิเตอร์ไฟฟ้า
                  </th>
                  <th colSpan={3} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
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
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 border-l border-gray-200">
                    เริ่มต้น
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    สิ้นสุด
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                    ใช้ไป (หน่วย)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedReadings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
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
    </div>
  );
}

