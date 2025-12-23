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
  const [year, setYear] = useState(now.getFullYear() + 543);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingCycle, setIsLoadingCycle] = useState(false);
  const [roomForms, setRoomForms] = useState<Map<number, RoomReadingForm>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [savedReadings, setSavedReadings] = useState<UtilityReading[]>([]);
  const [filterBuilding, setFilterBuilding] = useState<string>('all');

  // ดึงหรือสร้าง billing cycle
  useEffect(() => {
    const fetchCycle = async () => {
      setIsLoadingCycle(true);
      try {
        const res = await fetch(`/api/billing/cycle?year=${year}&month=${month}`);
        if (res.ok) {
          const data = await res.json();
          setCycleId(data.cycle_id);
        }
      } catch (error) {
        console.error('Error fetching cycle:', error);
      } finally {
        setIsLoadingCycle(false);
      }
    };
    fetchCycle();
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
          for (const room of filteredRooms) {
            // ดึงเลขมิเตอร์ล่าสุด (จากรอบก่อนหน้า)
            const previousReadings = await fetchPreviousReadings(room.room_id);
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

  // ดึงเลขมิเตอร์ล่าสุดจากรอบก่อนหน้า
  const fetchPreviousReadings = async (roomId: number): Promise<{ electric: number | null; water: number | null }> => {
    try {
      const res = await fetch(`/api/utility-readings/latest?room_id=${roomId}`);
      if (!res.ok) {
        return { electric: null, water: null };
      }
      const data = await res.json();
      return {
        electric: data.electric || null,
        water: data.water || null,
      };
    } catch (error) {
      console.error('Error fetching previous readings:', error);
      return { electric: null, water: null };
    }
  };

  // อัปเดต form
  const updateForm = (roomId: number, field: 'electric' | 'water', subField: 'meter_start' | 'meter_end', value: number | '') => {
    const forms = new Map(roomForms);
    const form = forms.get(roomId);
    if (form) {
      form[field][subField] = value;
      
      // ตรวจสอบว่า meter_end ต้องมากกว่าหรือเท่ากับ meter_start
      if (subField === 'meter_end' && value !== '' && form[field].meter_start !== '') {
        const start = Number(form[field].meter_start);
        const end = Number(value);
        if (end < start) {
          alert(`ค่าสิ้นสุด (${end}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${start}) สำหรับ${field === 'electric' ? 'ค่าไฟฟ้า' : 'ค่าน้ำ'}`);
          // Reset ค่าสิ้นสุดเป็นค่าเริ่มต้น
          form[field].meter_end = form[field].meter_start;
        }
      } else if (subField === 'meter_start' && value !== '' && form[field].meter_end !== '') {
        const start = Number(value);
        const end = Number(form[field].meter_end);
        if (end < start) {
          alert(`ค่าสิ้นสุด (${end}) ต้องมากกว่าหรือเท่ากับค่าเริ่มต้น (${start}) สำหรับ${field === 'electric' ? 'ค่าไฟฟ้า' : 'ค่าน้ำ'}`);
          // Reset ค่าสิ้นสุดเป็นค่าเริ่มต้นใหม่
          form[field].meter_end = value;
        }
      }
      
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

  // กรองห้องตามอาคาร
  const filteredRooms = useMemo(() => {
    if (filterBuilding === 'all') return rooms;
    return rooms.filter(room => String(room.building_id) === filterBuilding);
  }, [rooms, filterBuilding]);

  // สร้างรายการอาคาร
  const buildingOptions = useMemo(() => {
    const buildings = new Map<number, string>();
    rooms.forEach(room => {
      buildings.set(room.building_id, room.building_name);
    });
    return Array.from(buildings.entries());
  }, [rooms]);

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ปี (พ.ศ.)</label>
              <input
                type="number"
                className="w-full border rounded-md px-3 py-2"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">เดือน</label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {getMonthNameThai(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              {isLoadingCycle && <span className="text-sm text-gray-500">กำลังโหลด...</span>}
              {cycleId && <span className="text-sm text-green-600">รอบบิล: {getMonthNameThai(month)} {year}</span>}
            </div>
          </div>
        </div>

        {/* กรองอาคาร */}
        <div className="bg-white shadow rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium mb-1">กรองตามอาคาร</label>
          <select
            className="w-full border rounded-md px-3 py-2"
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
          >
            <option value="all">ทุกอาคาร</option>
            {buildingOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
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
      {isLoadingRooms ? (
        <div className="text-center py-8">กำลังโหลดข้อมูล...</div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ห้อง</th>
                  <th colSpan={3} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    ไฟฟ้า
                  </th>
                  <th colSpan={3} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    น้ำ
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">การจัดการ</th>
                </tr>
                <tr>
                  <th></th>
                  <th className="px-4 py-2 text-xs text-gray-500">เลขเก่า</th>
                  <th className="px-4 py-2 text-xs text-gray-500">เริ่มต้น</th>
                  <th className="px-4 py-2 text-xs text-gray-500">สิ้นสุด</th>
                  <th className="px-4 py-2 text-xs text-gray-500">เลขเก่า</th>
                  <th className="px-4 py-2 text-xs text-gray-500">เริ่มต้น</th>
                  <th className="px-4 py-2 text-xs text-gray-500">สิ้นสุด</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRooms.map((room) => {
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

                  return (
                    <tr
                      key={room.room_id}
                      id={`room-row-${room.room_id}`}
                      className={isSaved ? 'bg-green-50' : ''}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        {room.building_name} - ห้อง {room.room_number}
                        {room.floor_no ? ` (ชั้น ${room.floor_no})` : ''}
                        {isSaved && <span className="ml-2 text-green-600">✓</span>}
                      </td>
                      {/* ไฟฟ้า */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                        {form.electric.previous_end !== null ? form.electric.previous_end : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          id={`room-electric-start-${room.room_id}`}
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.electric.meter_start}
                          onChange={(e) => updateForm(room.room_id, 'electric', 'meter_start', e.target.value ? Number(e.target.value) : '')}
                          placeholder={form.electric.previous_end !== null ? String(form.electric.previous_end) : ''}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
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
                      {/* น้ำ */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center">
                        {form.water.previous_end !== null ? form.water.previous_end : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          id={`room-water-start-${room.room_id}`}
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.water.meter_start}
                          onChange={(e) => updateForm(room.room_id, 'water', 'meter_start', e.target.value ? Number(e.target.value) : '')}
                          placeholder={form.water.previous_end !== null ? String(form.water.previous_end) : ''}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
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
                      {/* ปุ่มบันทึก */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
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

