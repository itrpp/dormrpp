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

  // State สำหรับ checkbox เติมค่าเริ่มต้นจากเลขเดิม
  const [autoFillFromPrevious, setAutoFillFromPrevious] = useState(false);
  
  // State สำหรับอัปโหลดรูปมิเตอร์
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadingRoomId, setUploadingRoomId] = useState<number | null>(null);
  const [uploadingUtilityType, setUploadingUtilityType] = useState<'electric' | 'water' | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoMeterValue, setPhotoMeterValue] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<number | null>(null); // สำหรับแก้ไขรูป
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null); // สำหรับแสดงรูป preview
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null); // สำหรับแสดงรูปเก่าเมื่อแก้ไข
  
  // State สำหรับเก็บสถานะรูปภาพ (key: `${room_id}-${utility_type}`)
  const [photoStatus, setPhotoStatus] = useState<Map<string, {
    photo_id: number;
    bill_id: number | null;
    meter_value: number;
  }>>(new Map());
  
  // State สำหรับตรวจสอบว่าออกบิลแล้วหรือยัง
  const [hasBills, setHasBills] = useState(false);

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

  // ดึงหรือสร้าง billing cycle และรีเฟรชข้อมูลอัตโนมัติ
  useEffect(() => {
    const fetchCycleAndRefresh = async () => {
      setIsLoadingCycle(true);
      setIsLoadingRooms(true);
      // Clear ข้อมูลเก่าก่อนดึงข้อมูลใหม่
      setCycleId(null);
      setRooms([]);
      setRoomForms(new Map());
      setSavedReadings([]);
      setPhotoStatus(new Map());
      setHasBills(false);
      
      try {
        const res = await fetch(`/api/billing/cycle?year=${year}&month=${month}`);
        if (res.ok) {
          const data = await res.json();
          if (data.cycle_id) {
            const newCycleId = data.cycle_id;
            setCycleId(newCycleId);
            
            // รีเฟรชข้อมูลอัตโนมัติเมื่อพบ cycle_id
            // เรียก refreshData โดยตรง (refreshData จะใช้ year และ month ที่มีอยู่แล้ว)
            await refreshData();
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
        setIsLoadingRooms(false);
      }
    };
    if (year && month) {
      fetchCycleAndRefresh();
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

  // ดึงสถานะรูปภาพและตรวจสอบว่าออกบิลแล้วหรือยัง
  useEffect(() => {
    const fetchPhotoStatusAndBills = async () => {
      if (!cycleId || !year || !month) {
        setPhotoStatus(new Map());
        setHasBills(false);
        return;
      }

      try {
        // ตรวจสอบว่ามีบิลในรอบบิลนี้หรือไม่
        const billsRes = await fetch(`/api/bills/detailed?year=${year}&month=${month}`);
        if (billsRes.ok) {
          const bills = await billsRes.json();
          setHasBills(bills && bills.length > 0);
        }

        // ดึงรูปภาพทั้งหมดในรอบบิลนี้
        const statusMap = new Map<string, {
          photo_id: number;
          bill_id: number | null;
          meter_value: number;
        }>();

        // ดึงรูปภาพไฟฟ้า
        try {
          const electricRes = await fetch(
            `/api/meter-photos?year=${year}&month=${month}&utility_type=electric`
          );
          if (electricRes.ok) {
            const electricPhotos = await electricRes.json();
            electricPhotos.forEach((photo: any) => {
              const key = `${photo.room_id}-electric`;
              statusMap.set(key, {
                photo_id: photo.photo_id,
                bill_id: photo.bill_id,
                meter_value: photo.meter_value,
              });
            });
          }
        } catch (error) {
          console.error('Error fetching electric photos:', error);
        }

        // ดึงรูปภาพน้ำ
        try {
          const waterRes = await fetch(
            `/api/meter-photos?year=${year}&month=${month}&utility_type=water`
          );
          if (waterRes.ok) {
            const waterPhotos = await waterRes.json();
            waterPhotos.forEach((photo: any) => {
              const key = `${photo.room_id}-water`;
              statusMap.set(key, {
                photo_id: photo.photo_id,
                bill_id: photo.bill_id,
                meter_value: photo.meter_value,
              });
            });
          }
        } catch (error) {
          console.error('Error fetching water photos:', error);
        }

        setPhotoStatus(statusMap);
      } catch (error) {
        console.error('Error fetching photo status:', error);
        setPhotoStatus(new Map());
        setHasBills(false);
      }
    };

    fetchPhotoStatusAndBills();
  }, [cycleId, year, month]);

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

  // เติมค่าเริ่มต้นจากเลขเดิมทั้งหมด
  const fillAllFromPrevious = () => {
    const forms = new Map(roomForms);
    forms.forEach((form, roomId) => {
      // เติมค่าไฟฟ้า (เฉพาะที่ยังว่างอยู่)
      if (form.electric.previous_end !== null && form.electric.meter_start === '') {
        form.electric.meter_start = form.electric.previous_end;
      }
      // เติมค่าน้ำ (เฉพาะที่ยังว่างอยู่)
      if (form.water.previous_end !== null && form.water.meter_start === '') {
        form.water.meter_start = form.water.previous_end;
      }
      forms.set(roomId, form);
    });
    setRoomForms(forms);
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
        const confirmRollover = window.confirm(
          `ตรวจพบว่าค่าสิ้นสุด (${electricEnd}) น้อยกว่าค่าเริ่มต้น (${electricStart}) สำหรับมิเตอร์ไฟฟ้า\n` +
          'ระบบจะถือว่าเป็นการวนเลขมิเตอร์ 4 หลัก (เช่น 9999 → 0000) และคำนวณหน่วยแบบ rollover\n\n' +
          'ยืนยันว่าค่านี้ถูกต้องหรือไม่?'
        );
        if (!confirmRollover) {
          return;
        }
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

      // ค่าไฟฟ้า: อนุญาตให้ end < start ได้ (กรณี rollover) จึงไม่ตรวจ error ที่นี่

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

  // ฟังก์ชันรีเฟรชข้อมูลทั้งหมด
  const refreshData = async () => {
    if (!year || !month) {
      return; // ไม่แสดง alert เมื่อเรียกอัตโนมัติ
    }

    try {
      // Clear ข้อมูลเก่า
      setCycleId(null);
      setRooms([]);
      setRoomForms(new Map());
      setSavedReadings([]);
      setPhotoStatus(new Map());
      setHasBills(false);
      setIsLoadingCycle(true);
      setIsLoadingRooms(true);

      // ดึง cycle ใหม่
      const cycleRes = await fetch(`/api/billing/cycle?year=${year}&month=${month}`);
      if (cycleRes.ok) {
        const cycleData = await cycleRes.json();
        if (cycleData.cycle_id) {
          setCycleId(cycleData.cycle_id);
          
          // ดึง rooms ใหม่
          const roomsRes = await fetch('/api/rooms');
          if (roomsRes.ok) {
            const roomsData = await roomsRes.json();
            
            // จำกัดจำนวน concurrent requests เพื่อป้องกัน "Too many connections"
            // ใช้ sequential requests แทน Promise.all สำหรับ contracts
            const roomsWithContracts: (Room | null)[] = [];
            for (const room of roomsData) {
              try {
                const contractsRes = await fetch(`/api/contracts?room_id=${room.room_id}&status=active`);
                if (contractsRes.ok) {
                  const contracts = await contractsRes.json();
                  roomsWithContracts.push(contracts.length > 0 ? room : null);
                } else {
                  roomsWithContracts.push(null);
                }
              } catch (error) {
                // Silent fallback
                roomsWithContracts.push(null);
              }
            }
            
            const filteredRooms = roomsWithContracts.filter((r: Room | null) => r !== null);
            setRooms(filteredRooms);

            // สร้าง form สำหรับแต่ละห้อง
            const forms = new Map<number, RoomReadingForm>();
            const roomIds = filteredRooms.map(r => r.room_id);
            const allPreviousReadings = await fetchPreviousReadingsBatch(roomIds, cycleData.cycle_id);
            
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

            // ดึง readings ที่บันทึกแล้ว
            const readingsRes = await fetch(`/api/utility-readings?cycle_id=${cycleData.cycle_id}`);
            if (readingsRes.ok) {
              const readingsData = await readingsRes.json();
              setSavedReadings(readingsData);

              // อัปเดต form ด้วยข้อมูลที่บันทึกแล้ว
              readingsData.forEach((reading: UtilityReading) => {
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

            // ดึงสถานะรูปภาพและตรวจสอบบิล
            const billsRes = await fetch(`/api/bills/detailed?year=${year}&month=${month}`);
            if (billsRes.ok) {
              const bills = await billsRes.json();
              setHasBills(bills && bills.length > 0);
            }

            // ดึงรูปภาพทั้งหมด
            const statusMap = new Map<string, {
              photo_id: number;
              bill_id: number | null;
              meter_value: number;
            }>();

            try {
              const electricRes = await fetch(
                `/api/meter-photos?year=${year}&month=${month}&utility_type=electric`
              );
              if (electricRes.ok) {
                const electricPhotos = await electricRes.json();
                electricPhotos.forEach((photo: any) => {
                  const key = `${photo.room_id}-electric`;
                  statusMap.set(key, {
                    photo_id: photo.photo_id,
                    bill_id: photo.bill_id,
                    meter_value: photo.meter_value,
                  });
                });
              }
            } catch (error) {
              console.error('Error fetching electric photos:', error);
            }

            try {
              const waterRes = await fetch(
                `/api/meter-photos?year=${year}&month=${month}&utility_type=water`
              );
              if (waterRes.ok) {
                const waterPhotos = await waterRes.json();
                waterPhotos.forEach((photo: any) => {
                  const key = `${photo.room_id}-water`;
                  statusMap.set(key, {
                    photo_id: photo.photo_id,
                    bill_id: photo.bill_id,
                    meter_value: photo.meter_value,
                  });
                });
              }
            } catch (error) {
              console.error('Error fetching water photos:', error);
            }

            setPhotoStatus(statusMap);
          }
        }
      }

      // ไม่แสดง alert เมื่อรีเฟรชสำเร็จ
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      // ไม่แสดง alert error เพื่อไม่รบกวนผู้ใช้
    } finally {
      setIsLoadingCycle(false);
      setIsLoadingRooms(false);
    }
  };

  // เปิด modal สำหรับอัปโหลดรูปมิเตอร์
  const openUploadModal = (roomId: number, utilityType: 'electric' | 'water', photoId?: number) => {
    setUploadingRoomId(roomId);
    setUploadingUtilityType(utilityType);
    setSelectedPhoto(null);
    setPhotoPreviewUrl(null);
    setEditingPhotoId(photoId || null);
    
    // ถ้ากำลังแก้ไข ให้ดึงข้อมูลรูปเก่า
    if (photoId) {
      const photoKey = `${roomId}-${utilityType}`;
      const photoInfo = photoStatus.get(photoKey);
      if (photoInfo) {
        setPhotoMeterValue(String(photoInfo.meter_value));
        // สร้าง URL สำหรับแสดงรูปเก่า
        setExistingPhotoUrl(`/api/meter-photos/${photoInfo.photo_id}/download`);
      } else {
        setPhotoMeterValue('');
        setExistingPhotoUrl(null);
      }
    } else {
      setPhotoMeterValue('');
      setExistingPhotoUrl(null);
    }
    
    setUploadModalOpen(true);
  };

  // ปิด modal
  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadingRoomId(null);
    setUploadingUtilityType(null);
    setSelectedPhoto(null);
    setPhotoMeterValue('');
    setEditingPhotoId(null);
    // ลบ URL preview เพื่อป้องกัน memory leak
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    setExistingPhotoUrl(null);
  };

  // อัปโหลดหรือแก้ไขรูปมิเตอร์
  const uploadMeterPhoto = async () => {
    if (!uploadingRoomId || !uploadingUtilityType || !photoMeterValue || !cycleId) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    const meterValue = Number(photoMeterValue);
    if (isNaN(meterValue)) {
      alert('กรุณากรอกค่ามิเตอร์เป็นตัวเลข');
      return;
    }

    setIsUploading(true);
    try {
      // ถ้ากำลังแก้ไขและไม่เลือกรูปใหม่ ให้อัปเดตแค่ค่า meter_value
      if (editingPhotoId && !selectedPhoto) {
        const res = await fetch(`/api/meter-photos/${editingPhotoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meter_value: meterValue }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'ไม่สามารถอัปเดตค่ามิเตอร์ได้');
        }

        alert('อัปเดตค่ามิเตอร์สำเร็จ');
        closeUploadModal();
        
        // Refresh photo status
        const statusMap = new Map(photoStatus);
        const key = `${uploadingRoomId}-${uploadingUtilityType}`;
        const photoInfo = photoStatus.get(key);
        if (photoInfo) {
          statusMap.set(key, {
            ...photoInfo,
            meter_value: meterValue,
          });
          setPhotoStatus(statusMap);
        }
        
        // Refresh saved readings
        const readingsRes = await fetch(`/api/utility-readings?cycle_id=${cycleId}`);
        if (readingsRes.ok) {
          const data = await readingsRes.json();
          setSavedReadings(data);
        }
        
        return;
      }

      // ถ้าเลือกรูปใหม่ ให้อัปโหลดรูป
      if (!selectedPhoto) {
        alert('กรุณาเลือกรูปภาพ');
        return;
      }

      // ถ้ากำลังแก้ไขและเลือกรูปใหม่ ให้ลบรูปเก่าก่อน
      if (editingPhotoId) {
        const deleteRes = await fetch(`/api/meter-photos/${editingPhotoId}`, {
          method: 'DELETE',
        });
        if (!deleteRes.ok) {
          const errorData = await deleteRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'ไม่สามารถลบรูปเก่าได้');
        }
      }

      // อัปโหลดรูปใหม่
      const formData = new FormData();
      formData.append('photo', selectedPhoto);
      formData.append('room_id', String(uploadingRoomId));
      formData.append('utility_type', uploadingUtilityType);
      formData.append('meter_value', String(meterValue));
      formData.append('billing_year', String(year));
      formData.append('billing_month', String(month));
      
      // ใช้วันที่ปัจจุบันเป็น reading_date
      const today = new Date();
      const readingDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      formData.append('reading_date', readingDate);

      const res = await fetch('/api/meter-photos', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'ไม่สามารถอัปโหลดรูปได้');
      }

      alert(editingPhotoId ? 'แก้ไขรูปมิเตอร์สำเร็จ' : 'อัปโหลดรูปมิเตอร์สำเร็จ');
      closeUploadModal();
      
      // Refresh photo status
      const statusMap = new Map(photoStatus);
      const key = `${uploadingRoomId}-${uploadingUtilityType}`;
      const result = await res.json();
      statusMap.set(key, {
        photo_id: result.photo_id,
        bill_id: null,
        meter_value: meterValue,
      });
      setPhotoStatus(statusMap);
      
      // Refresh saved readings
      const readingsRes = await fetch(`/api/utility-readings?cycle_id=${cycleId}`);
      if (readingsRes.ok) {
        const data = await readingsRes.json();
        setSavedReadings(data);
      }
    } catch (error: any) {
      console.error('Error uploading meter photo:', error);
      alert(`ไม่สามารถอัปโหลดรูปได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
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

        {/* Checkbox และปุ่มบันทึกทั้งหมด */}
        <div className="mb-4 flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoFillFromPrevious}
              onChange={(e) => {
                setAutoFillFromPrevious(e.target.checked);
                if (e.target.checked) {
                  fillAllFromPrevious();
                }
              }}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              เติมค่าเริ่มต้นจากเลขเดิมทั้งหมด
            </span>
          </label>
          <button
            onClick={saveAll}
            disabled={isSaving || !cycleId}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลังบันทึก...
              </>
            ) : (
              'บันทึกทั้งหมด'
            )}
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
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">หน่วยที่ใช้</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border-l-2 border-r border-t border-b border-gray-300">เลขเก่า</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">เริ่มต้น</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">สิ้นสุด</th>
                  <th className="px-4 py-2 text-base font-medium text-gray-600 border border-gray-300">หน่วยที่ใช้</th>
                  <th className="border border-gray-300"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rooms.map((room) => {
                  const form = roomForms.get(room.room_id);
                  const isSaved = isRoomSaved(room.room_id);
                  
                  if (!form) return null;

                  // คำนวณหน่วยไฟฟ้า (รองรับกรณีมิเตอร์ 4 หลัก rollover)
                  const electricUsage = (() => {
                    if (form.electric.meter_start === '' || form.electric.meter_end === '') return null;
                    const es = Number(form.electric.meter_start);
                    const ee = Number(form.electric.meter_end);
                    const MOD = 10000;
                    if (isNaN(es) || isNaN(ee)) return null;
                    return ee >= es ? ee - es : (MOD - es + ee);
                  })();
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
                  
                  // คำนวณหน่วยที่ใช้จากข้อมูลที่บันทึกแล้ว หรือจาก form ที่กรอก (รองรับ rollover)
                  const currentElectricUsage = (() => {
                    if (currentElectricReading) {
                      const es = Number(currentElectricReading.meter_start);
                      const ee = Number(currentElectricReading.meter_end);
                      const MOD = 10000;
                      if (isNaN(es) || isNaN(ee)) return null;
                      return ee >= es ? ee - es : (MOD - es + ee);
                    }
                    return electricUsage !== null ? electricUsage : null;
                  })();
                  const currentWaterUsage = currentWaterReading
                    ? currentWaterReading.meter_end - currentWaterReading.meter_start
                    : (waterUsage !== null ? waterUsage : null);

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
                        <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.electric.meter_end}
                          onChange={(e) => updateForm(room.room_id, 'electric', 'meter_end', e.target.value ? Number(e.target.value) : '')}
                        />
                          {(() => {
                            const photoKey = `${room.room_id}-electric`;
                            const photoInfo = photoStatus.get(photoKey);
                            const hasPhoto = !!photoInfo;
                            // แก้ไขได้เฉพาะเมื่อรูปยังไม่ผูกกับบิล (ห้องนั้นยังไม่ออกบิล)
                            const canEdit = hasPhoto && !photoInfo?.bill_id;
                            
                            return (
                              <div className="flex items-center gap-1">
                                {hasPhoto ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openUploadModal(room.room_id, 'electric', photoInfo.photo_id)}
                                      className={`text-xs px-2 py-1 border rounded transition-colors ${
                                        canEdit
                                          ? 'text-green-600 border-green-300 hover:bg-green-50'
                                          : 'text-gray-400 border-gray-300 cursor-not-allowed'
                                      }`}
                                      title={canEdit ? 'แก้ไขรูปมิเตอร์ไฟฟ้า' : 'มีรูปแล้ว (ออกบิลแล้ว ไม่สามารถแก้ไขได้)'}
                                      disabled={!canEdit}
                                    >
                                      {canEdit ? '✏️' : '📷'}
                                    </button>
                                    <span className="text-green-600 text-xs" title="มีรูปแนบแล้ว">✅</span>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openUploadModal(room.room_id, 'electric')}
                                    className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                                    title="ถ่ายรูปมิเตอร์ไฟฟ้า"
                                  >
                                    📷
                                  </button>
                        )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center border border-gray-300">
                        <span className={`font-medium ${currentElectricUsage !== null ? 'text-green-600' : 'text-gray-400'}`}>
                          {currentElectricUsage !== null ? `${currentElectricUsage} หน่วย` : '-'}
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
                        <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={form.water.meter_end}
                          onChange={(e) => updateForm(room.room_id, 'water', 'meter_end', e.target.value ? Number(e.target.value) : '')}
                        />
                          {(() => {
                            const photoKey = `${room.room_id}-water`;
                            const photoInfo = photoStatus.get(photoKey);
                            const hasPhoto = !!photoInfo;
                            // แก้ไขได้เฉพาะเมื่อรูปยังไม่ผูกกับบิล (ห้องนั้นยังไม่ออกบิล)
                            const canEdit = hasPhoto && !photoInfo?.bill_id;
                            
                            return (
                              <div className="flex items-center gap-1">
                                {hasPhoto ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openUploadModal(room.room_id, 'water', photoInfo.photo_id)}
                                      className={`text-xs px-2 py-1 border rounded transition-colors ${
                                        canEdit
                                          ? 'text-green-600 border-green-300 hover:bg-green-50'
                                          : 'text-gray-400 border-gray-300 cursor-not-allowed'
                                      }`}
                                      title={canEdit ? 'แก้ไขรูปมิเตอร์น้ำ' : 'มีรูปแล้ว (ออกบิลแล้ว ไม่สามารถแก้ไขได้)'}
                                      disabled={!canEdit}
                                    >
                                      {canEdit ? '✏️' : '📷'}
                                    </button>
                                    <span className="text-green-600 text-xs" title="มีรูปแนบแล้ว">✅</span>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openUploadModal(room.room_id, 'water')}
                                    className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
                                    title="ถ่ายรูปมิเตอร์น้ำ"
                                  >
                                    📷
                                  </button>
                        )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center border-l-2 border-r border-t border-b border-gray-300">
                        <span className={`font-medium ${currentWaterUsage !== null ? 'text-green-600' : 'text-gray-400'}`}>
                          {currentWaterUsage !== null ? `${currentWaterUsage} หน่วย` : '-'}
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
          
          {/* ปุ่มบันทึกทั้งหมดด้านล่าง */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={saveAll}
              disabled={isSaving || !cycleId}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {isSaving ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
            </button>
          </div>
        </div>
      )}

      {/* Modal สำหรับอัปโหลดรูปมิเตอร์ */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">
              {editingPhotoId ? 'แก้ไข' : 'อัปโหลด'}รูปมิเตอร์{uploadingUtilityType === 'electric' ? 'ไฟฟ้า' : 'น้ำ'}
            </h2>
            {editingPhotoId && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ คุณกำลังแก้ไขรูปภาพ รูปเก่าจะถูกลบและแทนที่ด้วยรูปใหม่
                </p>
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                เลือกรูปภาพ {editingPhotoId && <span className="text-gray-500 font-normal">(ไม่บังคับ - ถ้าไม่เลือกรูปจะแก้ไขแค่ค่ามิเตอร์)</span>}
              </label>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedPhoto(file);
                    // สร้าง URL สำหรับแสดง preview
                    const previewUrl = URL.createObjectURL(file);
                    // ลบ URL เก่าก่อน (ถ้ามี)
                    if (photoPreviewUrl) {
                      URL.revokeObjectURL(photoPreviewUrl);
                    }
                    setPhotoPreviewUrl(previewUrl);
                  } else {
                    setSelectedPhoto(null);
                    if (photoPreviewUrl) {
                      URL.revokeObjectURL(photoPreviewUrl);
                      setPhotoPreviewUrl(null);
                    }
                  }
                }}
                className="w-full border rounded px-3 py-2"
              />
              {selectedPhoto && (
                <p className="mt-2 text-sm text-gray-600">
                  ไฟล์: {selectedPhoto.name} ({(selectedPhoto.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            {/* แสดงรูปภาพ preview */}
            {(photoPreviewUrl || existingPhotoUrl) && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  {editingPhotoId && !photoPreviewUrl ? 'รูปเก่า' : editingPhotoId && photoPreviewUrl ? 'รูปเก่า' : 'รูปที่เลือก'}
                </label>
                {editingPhotoId && existingPhotoUrl && !photoPreviewUrl && (
                  <div className="border rounded-lg p-2 bg-gray-50">
                    <img
                      src={existingPhotoUrl}
                      alt="รูปเก่า"
                      className="w-full h-auto max-h-64 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                {photoPreviewUrl && (
                  <div className={`border rounded-lg p-2 ${editingPhotoId ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <img
                      src={photoPreviewUrl}
                      alt={editingPhotoId ? 'รูปใหม่ที่จะแทนที่' : 'รูปที่เลือก'}
                      className="w-full h-auto max-h-64 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {editingPhotoId && (
                      <p className="mt-2 text-xs text-green-600 text-center">รูปใหม่ที่จะแทนที่รูปเก่า</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                ค่าที่อ่านได้จากรูป
              </label>
              <input
                type="number"
                value={photoMeterValue}
                onChange={(e) => setPhotoMeterValue(e.target.value)}
                placeholder="กรอกค่ามิเตอร์"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={closeUploadModal}
                disabled={isUploading}
                className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={uploadMeterPhoto}
                disabled={isUploading || !photoMeterValue || (!selectedPhoto && !editingPhotoId)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading 
                  ? 'กำลังอัปโหลด...' 
                  : editingPhotoId && !selectedPhoto
                    ? 'อัปเดตค่ามิเตอร์'
                    : editingPhotoId
                      ? 'อัปเดตรูปและค่า'
                      : 'อัปโหลด'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

