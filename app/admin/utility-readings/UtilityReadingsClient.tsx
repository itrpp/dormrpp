'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMonthNameThai } from '@/lib/date-utils';

interface Room {
  room_id: number;
  room_number: string;
  floor_no: number | null;
  building_name: string;
  building_id: number;
}

interface UtilityReading {
  reading_id: number;
  room_id: number;
  cycle_id: number;
  utility_type_id: number;
  meter_start: number;
  meter_end: number;
  utility_code: string;
  utility_name: string;
  created_at?: string | null;
}

interface RoomReadingForm {
  room_id: number;
  electric: {
    meter_start: number | '';
    meter_end: number | '';
    previous_end: number | null; // เลขมิเตอร์สิ้นสุดของรอบก่อนหน้า
  };
  water: {
    meter_start: number | '';
    meter_end: number | '';
    previous_end: number | null; // เลขมิเตอร์สิ้นสุดของรอบก่อนหน้า
  };
}

interface BillingCycle {
  cycle_id: number;
  billing_year: number;
  billing_month: number;
  start_date: string;
  end_date: string;
  due_date: string;
  status: string;
}

export default function UtilityReadingsClient() {
  const now = new Date();
  const searchParams = useSearchParams();
  const targetRoomIdParam = searchParams.get('room_id');
  const targetRoomId = targetRoomIdParam ? Number(targetRoomIdParam) : null;
  const hasAutoFocused = useRef(false);
  
  // แปลง พ.ศ. เป็น ค.ศ. สำหรับ month picker
  const beYear = now.getFullYear() + 543;
  const beMonth = now.getMonth() + 1;
  const adYear = now.getFullYear();
  const adMonth = String(now.getMonth() + 1).padStart(2, '0');
  const initialMonthValue = `${adYear}-${adMonth}`;
  const maxMonthValue = `${adYear}-${adMonth}`; // จำกัดไม่ให้เลือกเกินเดือนปัจจุบัน
  
  const [monthValue, setMonthValue] = useState(initialMonthValue); // Format: "YYYY-MM" (ค.ศ.)
  const [year, setYear] = useState(beYear); // พ.ศ.
  const [month, setMonth] = useState(beMonth); // เดือน (1-12)
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingCycle, setIsLoadingCycle] = useState(false);
  const [roomForms, setRoomForms] = useState<Map<number, RoomReadingForm>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [savedReadings, setSavedReadings] = useState<UtilityReading[]>([]);

  // แปลง month value (ค.ศ.) เป็น year และ month (พ.ศ.)
  useEffect(() => {
    if (monthValue) {
      const [adYearStr, monthStr] = monthValue.split('-');
      const adYear = Number(adYearStr);
      const monthNum = Number(monthStr);
      const beYear = adYear + 543;
      setYear(beYear);
      setMonth(monthNum);
    }
  }, [monthValue]);

  // ดึงหรือสร้าง billing cycle
  useEffect(() => {
    const fetchCycle = async () => {
      setIsLoadingCycle(true);
      // Clear ข้อมูลเก่าก่อนดึงข้อมูลใหม่
      setCycleId(null);
      setRooms([]);
      setRoomForms(new Map());
      setSavedReadings([]);
      
      try {
        const res = await fetch(`/api/billing/cycle?year=${year}&month=${month}`);
        if (res.ok) {
          const data = await res.json();
          if (data.cycle_id) {
            setCycleId(data.cycle_id);
          } else {
            // ไม่พบรอบบิล
            setCycleId(null);
          }
        } else {
          // ไม่พบรอบบิล
          setCycleId(null);
        }
      } catch (error) {
        console.error('Error fetching cycle:', error);
        setCycleId(null);
      } finally {
        setIsLoadingCycle(false);
      }
    };
    if (year && month) {
      fetchCycle();
    }
  }, [year, month]);

  // ดึงข้อมูลห้องที่มี active contracts
  useEffect(() => {
    const fetchRooms = async () => {
      setIsLoadingRooms(true);
      try {
        const res = await fetch('/api/rooms');
        if (res.ok) {
          const data = await res.json();
          // กรองเฉพาะห้องที่มี active contracts
          const roomsWithContracts = await Promise.all(
            data.map(async (room: Room) => {
              const contractsRes = await fetch(`/api/contracts?room_id=${room.room_id}&status=active`);
              if (contractsRes.ok) {
                const contracts = await contractsRes.json();
                return contracts.length > 0 ? room : null;
              }
              return null;
            })
          );
          const filteredRooms = roomsWithContracts.filter((r: Room | null) => r !== null);
          setRooms(filteredRooms);

          // สร้าง form สำหรับแต่ละห้อง
          const forms = new Map<number, RoomReadingForm>();
          
          // ดึงข้อมูลเลขเก่าทั้งหมดในครั้งเดียว (batch query)
          const roomIds = filteredRooms.map(r => r.room_id);
          const allPreviousReadings = await fetchPreviousReadingsBatch(roomIds, cycleId);
          
          for (const room of filteredRooms) {
            const previousReadings = allPreviousReadings[room.room_id] || { electric: null, water: null };
            forms.set(room.room_id, {
              room_id: room.room_id,
              electric: {
                meter_start: '',
                meter_end: '',
                previous_end: previousReadings.electric,
              },
              water: {
                meter_start: '',
                meter_end: '',
                previous_end: previousReadings.water,
              },
            });
          }
          setRoomForms(forms);
        }
      } catch (error) {
        console.error('Error fetching rooms:', error);
      } finally {
        setIsLoadingRooms(false);
      }
    };
    if (cycleId) {
      fetchRooms();
    }
  }, [cycleId]);

  // ดึงข้อมูล readings ที่บันทึกแล้วสำหรับรอบบิลนี้
  useEffect(() => {
    const fetchSavedReadings = async () => {
      if (!cycleId) return;
      try {
        const res = await fetch(`/api/utility-readings?cycle_id=${cycleId}`);
        if (res.ok) {
          const data = await res.json();
          setSavedReadings(data);

          // อัปเดต form ด้วยข้อมูลที่บันทึกแล้ว
          const forms = new Map(roomForms);
          data.forEach((reading: UtilityReading) => {
            const form = forms.get(reading.room_id);
            if (form) {
              if (reading.utility_code === 'electric') {
                form.electric.meter_start = reading.meter_start;
                form.electric.meter_end = reading.meter_end;
              } else if (reading.utility_code === 'water') {
                form.water.meter_start = reading.meter_start;
                form.water.meter_end = reading.meter_end;
              }
              forms.set(reading.room_id, form);
            }
          });
          setRoomForms(forms);
        }
      } catch (error) {
        console.error('Error fetching saved readings:', error);
      }
    };
    if (cycleId && rooms.length > 0) {
      fetchSavedReadings();
    }
  }, [cycleId, rooms.length]);

  // โฟกัสและเลื่อนจอไปยังห้องที่ส่งมาจาก query string (room_id)
  useEffect(() => {
    if (hasAutoFocused.current) return;
    if (!targetRoomId) return;
    if (rooms.length === 0) return;

    // รอให้ DOM เรนเดอร์ก่อนโฟกัส
    const timer = setTimeout(() => {
      const rowEl = document.getElementById(`room-row-${targetRoomId}`);
      const inputEl = document.getElementById(
        `room-electric-start-${targetRoomId}`
      ) as HTMLInputElement | null;

      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (inputEl) {
        inputEl.focus();
      }
      hasAutoFocused.current = true;
    }, 200);

    return () => clearTimeout(timer);
  }, [rooms.length, targetRoomId]);

  // ดึงเลขมิเตอร์ล่าสุดจากรอบก่อนหน้ารอบบิลปัจจุบัน (สำหรับห้องเดียว - backward compatible)
  const fetchPreviousReadings = async (roomId: number, currentCycleId: number | null): Promise<{ electric: number | null; water: number | null }> => {
    try {
      // ส่ง cycle_id ไปด้วยเพื่อดึงข้อมูลจากรอบบิลก่อนหน้า
      const url = currentCycleId 
        ? `/api/utility-readings/latest?room_id=${roomId}&cycle_id=${currentCycleId}`
        : `/api/utility-readings/latest?room_id=${roomId}`;
      
      const res = await fetch(url);
      if (!res.ok) {
        return { electric: null, water: null };
      }
      const data = await res.json();
      return {
        electric: data.electric || null,
        water: data.water || null,
      };
    } catch (error) {
      // Silent fallback - ไม่ log เพื่อลด log noise
      return { electric: null, water: null };
    }
  };

  // ดึงเลขมิเตอร์ล่าสุดจากรอบก่อนหน้ารอบบิลปัจจุบัน (สำหรับหลายห้อง - batch query)
  const fetchPreviousReadingsBatch = async (roomIds: number[], currentCycleId: number | null): Promise<{ [roomId: number]: { electric: number | null; water: number | null } }> => {
    try {
      if (roomIds.length === 0) {
        return {};
      }

      // ส่ง room_ids หลายตัวพร้อมกัน
      const roomIdsParam = roomIds.join(',');
      const url = currentCycleId 
        ? `/api/utility-readings/latest?room_ids=${roomIdsParam}&cycle_id=${currentCycleId}`
        : `/api/utility-readings/latest?room_ids=${roomIdsParam}`;
      
      const res = await fetch(url);
      if (!res.ok) {
        // Return empty object ถ้า error
        return {};
      }
      const data = await res.json();
      return data || {};
    } catch (error) {
      // Silent fallback - ไม่ log เพื่อลด log noise
      return {};
    }
  };

  // อัปเดต form
  const updateForm = (roomId: number, field: 'electric' | 'water', subField: 'meter_start' | 'meter_end', value: number | '') => {
    const forms = new Map(roomForms);
    const form = forms.get(roomId);
    if (form) {
      form[field][subField] = value;
      forms.set(roomId, form);
      setRoomForms(forms);
    }
  };

  // บันทึก readings สำหรับห้องเดียว
  const saveRoomReading = async (roomId: number) => {
    if (!cycleId) {
      alert('กรุณาเลือกรอบบิล');
      return;
    }

    const form = roomForms.get(roomId);
    if (!form) return;

    // ตรวจสอบ validation ก่อนบันทึก
    if (form.electric.meter_start !== '' && form.electric.meter_end !== '') {
      const electricStart = Number(form.electric.meter_start);
      const electricEnd = Number(form.electric.meter_end);
      if (electricEnd < electricStart) {
        alert(`ค่าสิ้นสุด (${electricEnd}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${electricStart}) สำหรับค่าไฟฟ้า`);
        return;
      }
    }

    if (form.water.meter_start !== '' && form.water.meter_end !== '') {
      const waterStart = Number(form.water.meter_start);
      const waterEnd = Number(form.water.meter_end);
      if (waterEnd < waterStart) {
        alert(`ค่าสิ้นสุด (${waterEnd}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${waterStart}) สำหรับค่าน้ำ`);
        return;
      }
    }

    try {
      const payload: any = {
        cycle_id: cycleId,
        room_id: roomId,
      };

      if (form.electric.meter_start !== '' && form.electric.meter_end !== '') {
        payload.electric = {
          start: Number(form.electric.meter_start),
          end: Number(form.electric.meter_end),
        };
      }

      if (form.water.meter_start !== '' && form.water.meter_end !== '') {
        payload.water = {
          start: Number(form.water.meter_start),
          end: Number(form.water.meter_end),
        };
      }

      const res = await fetch('/api/utility-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save readings');
      }

      alert('บันทึกเลขมิเตอร์สำเร็จ');
      // Refresh saved readings
      const readingsRes = await fetch(`/api/utility-readings?cycle_id=${cycleId}`);
      if (readingsRes.ok) {
        const data = await readingsRes.json();
        setSavedReadings(data);
      }
    } catch (error: any) {
      console.error('Error saving readings:', error);
      alert(`ไม่สามารถบันทึกได้: ${error.message || 'Unknown error'}`);
    }
  };

  // บันทึกทั้งหมด
  const saveAll = async () => {
    if (!cycleId) {
      alert('กรุณาเลือกรอบบิล');
      return;
    }

    // ตรวจสอบ validation ก่อนบันทึกทั้งหมด
    const errors: string[] = [];
    roomForms.forEach((form, roomId) => {
      const room = rooms.find(r => r.room_id === roomId);
      const roomLabel = room ? `${room.building_name} - ห้อง ${room.room_number}` : `ห้อง ${roomId}`;

      if (form.electric.meter_start !== '' && form.electric.meter_end !== '') {
        const electricStart = Number(form.electric.meter_start);
        const electricEnd = Number(form.electric.meter_end);
        if (electricEnd < electricStart) {
          errors.push(`${roomLabel}: ค่าสิ้นสุด (${electricEnd}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${electricStart}) สำหรับค่าไฟฟ้า`);
        }
      }

      if (form.water.meter_start !== '' && form.water.meter_end !== '') {
        const waterStart = Number(form.water.meter_start);
        const waterEnd = Number(form.water.meter_end);
        if (waterEnd < waterStart) {
          errors.push(`${roomLabel}: ค่าสิ้นสุด (${waterEnd}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${waterStart}) สำหรับค่าน้ำ`);
        }
      }
    });

    if (errors.length > 0) {
      alert('พบข้อผิดพลาด:\n' + errors.join('\n'));
      return;
    }

    setIsSaving(true);
    try {
      const promises: Promise<any>[] = [];
      
      roomForms.forEach((form, roomId) => {
        const payload: any = {
          cycle_id: cycleId,
          room_id: roomId,
        };

        if (form.electric.meter_start !== '' && form.electric.meter_end !== '') {
          payload.electric = {
            start: Number(form.electric.meter_start),
            end: Number(form.electric.meter_end),
          };
        }

        if (form.water.meter_start !== '' && form.water.meter_end !== '') {
          payload.water = {
            start: Number(form.water.meter_start),
            end: Number(form.water.meter_end),
          };
        }

        if (payload.electric || payload.water) {
          promises.push(
            fetch('/api/utility-readings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          );
        }
      });

      await Promise.all(promises);
      alert('บันทึกเลขมิเตอร์ทั้งหมดสำเร็จ');
      
      // Refresh saved readings
      const readingsRes = await fetch(`/api/utility-readings?cycle_id=${cycleId}`);
      if (readingsRes.ok) {
        const data = await readingsRes.json();
        setSavedReadings(data);
      }
    } catch (error: any) {
      console.error('Error saving all readings:', error);
      alert(`ไม่สามารถบันทึกได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ตรวจสอบว่าห้องนี้บันทึกแล้วหรือยัง
  const isRoomSaved = (roomId: number): boolean => {
    return savedReadings.some(r => r.room_id === roomId);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">บันทึกเลขมิเตอร์ (ค่าน้ำ/ค่าไฟ)</h1>
        
        {/* เลือกรอบบิล */}
        <div className="bg-white shadow rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                📅 เลือกรอบบิล (เดือน/ปี)
              </label>
              <input
                type="month"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                max={maxMonthValue}
              />
              <p className="mt-2 text-xs text-gray-500">
                รอบบิล: {getMonthNameThai(month)} {year} 
              </p>
            </div>
            <div className="flex items-end">
              <div className="w-full">
                {isLoadingCycle && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังโหลดรอบบิล...
                  </div>
                )}
                {!isLoadingCycle && cycleId && (
                  <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    พร้อมบันทึก: {getMonthNameThai(month)} {year}
                  </div>
                )}
                {!isLoadingCycle && !cycleId && (
                  <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    ไม่พบรอบบิลสำหรับเดือน/ปีที่เลือก
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ปุ่มบันทึกทั้งหมด */}
        <div className="mb-4">
          <button
            onClick={saveAll}
            disabled={isSaving || !cycleId}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
          </button>
        </div>
      </div>

      {/* ตารางบันทึกเลขมิเตอร์ */}
      {!cycleId ? (
        !isLoadingCycle ? (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <svg className="h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 text-lg">กรุณาเลือกรอบบิลที่ต้องการบันทึกข้อมูล</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">กำลังโหลดรอบบิล...</div>
        )
      ) : isLoadingRooms ? (
        <div className="text-center py-8">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left text-base font-semibold text-gray-700 uppercase border border-gray-300">ห้อง</th>
                  <th colSpan={4} className="px-4 py-3 text-center text-base font-semibold text-gray-700 uppercase border border-gray-300">
                    ไฟฟ้า
                  </th>
                  <th colSpan={4} className="px-4 py-3 text-center text-base font-semibold text-gray-700 uppercase border-l-2 border-r border-t border-b border-gray-300">
                    น้ำ
                  </th>
                  <th className="px-4 py-3 text-center text-base font-semibold text-gray-700 uppercase border border-gray-300">การจัดการ</th>
                </tr>
                <tr>
                  <th className="border border-gray-300"></th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">เลขเก่า</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">เริ่มต้น</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">สิ้นสุด</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">เลขปัจจุบัน</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border-l-2 border-r border-t border-b border-gray-300">เลขเก่า</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">เริ่มต้น</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">สิ้นสุด</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">เลขปัจจุบัน</th>
                  <th className="border border-gray-300"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rooms.map((room) => {
                  const form = roomForms.get(room.room_id);
                  const isSaved = isRoomSaved(room.room_id);
                  
                  if (!form) return null;

                  // คำนวณ usage
                  const electricUsage = form.electric.meter_start !== '' && form.electric.meter_end !== ''
                    ? Number(form.electric.meter_end) - Number(form.electric.meter_start)
                    : null;
                  const waterUsage = form.water.meter_start !== '' && form.water.meter_end !== ''
                    ? Number(form.water.meter_end) - Number(form.water.meter_start)
                    : null;

                  // ดึงเลขมิเตอร์ปัจจุบันของรอบบิลนี้ (meter_start และ meter_end ที่บันทึกแล้ว)
                  const currentElectricReading = savedReadings.find(
                    r => r.room_id === room.room_id && r.utility_code === 'electric'
                  );
                  const currentWaterReading = savedReadings.find(
                    r => r.room_id === room.room_id && r.utility_code === 'water'
                  );
                  
                  // แสดงเป็นรูปแบบ "เริ่มต้น-สิ้นสุด"
                  const currentElectricMeter = currentElectricReading 
                    ? `${currentElectricReading.meter_start}-${currentElectricReading.meter_end}`
                    : null;
                  const currentWaterMeter = currentWaterReading
                    ? `${currentWaterReading.meter_start}-${currentWaterReading.meter_end}`
                    : null;

                  return (
                    <tr
                      key={room.room_id}
                      id={`room-row-${room.room_id}`}
                      className={isSaved ? 'bg-green-50' : ''}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium border border-gray-300">
                        {room.building_name} - ห้อง {room.room_number}
                        {room.floor_no ? ` (ชั้น ${room.floor_no})` : ''}
                        {isSaved && <span className="ml-2 text-green-600">✓</span>}
                      </td>
                      {/* ไฟฟ้า */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center bg-yellow-50 border border-gray-300">
                        <span className="font-medium text-yellow-700">
                        {form.electric.previous_end !== null ? form.electric.previous_end : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap border border-gray-300">
                        <input
                          id={`room-electric-start-${room.room_id}`}
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.electric.meter_start}
                          onChange={(e) => updateForm(room.room_id, 'electric', 'meter_start', e.target.value ? Number(e.target.value) : '')}
                          placeholder={form.electric.previous_end !== null ? String(form.electric.previous_end) : ''}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap border border-gray-300">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.electric.meter_end}
                          onChange={(e) => updateForm(room.room_id, 'electric', 'meter_end', e.target.value ? Number(e.target.value) : '')}
                        />
                        {electricUsage !== null && (
                          <span className="ml-2 text-xs text-gray-500">({electricUsage} หน่วย)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center border border-gray-300">
                        <span className={`font-medium ${currentElectricMeter !== null ? 'text-green-600' : 'text-gray-400'}`}>
                          {currentElectricMeter !== null ? currentElectricMeter : '-'}
                        </span>
                      </td>
                      {/* น้ำ */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center bg-blue-50 border-l-2 border-r border-t border-b border-gray-300">
                        <span className="font-medium text-blue-700">
                        {form.water.previous_end !== null ? form.water.previous_end : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap border-l-2 border-r border-t border-b border-gray-300">
                        <input
                          id={`room-water-start-${room.room_id}`}
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.water.meter_start}
                          onChange={(e) => updateForm(room.room_id, 'water', 'meter_start', e.target.value ? Number(e.target.value) : '')}
                          placeholder={form.water.previous_end !== null ? String(form.water.previous_end) : ''}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap border-l-2 border-r border-t border-b border-gray-300">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.water.meter_end}
                          onChange={(e) => updateForm(room.room_id, 'water', 'meter_end', e.target.value ? Number(e.target.value) : '')}
                        />
                        {waterUsage !== null && (
                          <span className="ml-2 text-xs text-gray-500">({waterUsage} หน่วย)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center border-l-2 border-r border-t border-b border-gray-300">
                        <span className={`font-medium ${currentWaterMeter !== null ? 'text-green-600' : 'text-gray-400'}`}>
                          {currentWaterMeter !== null ? currentWaterMeter : '-'}
                        </span>
                      </td>
                      {/* ปุ่มบันทึก */}
                      <td className="px-4 py-3 whitespace-nowrap text-center border border-gray-300">
                        <button
                          onClick={() => saveRoomReading(room.room_id)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                        >
                          บันทึก
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

