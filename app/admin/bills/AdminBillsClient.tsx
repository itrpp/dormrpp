'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getMonthNameThai } from '@/lib/date-utils';

// ค่าบำรุงรักษาคงที่
const MAINTENANCE_FEE = 1000;

interface Tenant {
  tenant_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  contract_status: string | null;
}

interface UtilityReading {
  reading_id: number;
  utility_type: string;
  utility_name?: string;
  meter_start: number;
  meter_end: number;
  usage: number;
  rate_per_unit?: number;
  created_at?: string | null;
}

interface DetailedBill {
  bill_id: number;
  tenant_id: number;
  room_id: number;
  contract_id: number;
  cycle_id: number;
  room_number: string;
  building_name: string;
  billing_year: number;
  billing_month: number;
  billing_date: string;
  due_date: string;
  maintenance_fee: number;
  electric_amount: number;
  water_amount: number;
  subtotal_amount: number;
  total_amount: number;
  status: string;
  tenants: Tenant[];
  utility_readings: UtilityReading[];
}

interface Room {
  room_id: number;
  room_number: string;
  floor_no: number | null;
  building_name: string;
}

interface Contract {
  contract_id: number;
  tenant_id: number;
  room_id: number;
  start_date: string;
  end_date: string | null;
  status: string;
  first_name_th: string;
  last_name_th: string;
  room_number: string;
  building_id: number;
  building_name: string;
}

interface BillForm {
  contract_ids: number[]; // เปลี่ยนเป็น array เพื่อรองรับหลายสัญญาเช่า
  billing_year: number;
  billing_month: number;
  electricity: {
    meter_start: number | '';
    meter_end: number | '';
  };
  water: {
    meter_start: number | '';
    meter_end: number | '';
  };
  status: string;
}

export default function AdminBillsClient() {
  const now = new Date();
  
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
  const [bills, setBills] = useState<DetailedBill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRunningBilling, setIsRunningBilling] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [utilityReadings, setUtilityReadings] = useState<{
    electric: { meter_start: number | null; meter_end: number | null } | null;
    water: { meter_start: number | null; meter_end: number | null } | null;
  }>({ electric: null, water: null });
  const [isLoadingReadings, setIsLoadingReadings] = useState(false);
  // สำหรับ modal form
  const formBeYear = now.getFullYear() + 543;
  const formBeMonth = now.getMonth() + 1;
  const formAdYear = now.getFullYear();
  const formAdMonth = String(now.getMonth() + 1).padStart(2, '0');
  const formInitialMonthValue = `${formAdYear}-${formAdMonth}`;
  const formMaxMonthValue = `${formAdYear}-${formAdMonth}`;
  
  const [formMonthValue, setFormMonthValue] = useState(formInitialMonthValue);
  const [form, setForm] = useState<BillForm>({
    contract_ids: [], // เปลี่ยนเป็น array
    billing_year: formBeYear,
    billing_month: formBeMonth,
    electricity: {
      meter_start: '',
      meter_end: '',
    },
    water: {
      meter_start: '',
      meter_end: '',
    },
    status: 'draft',
  });
  const selectedContracts = useMemo(
    () => contracts.filter((c) => form.contract_ids.includes(c.contract_id)),
    [contracts, form.contract_ids]
  );

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

  // ดึงข้อมูลบิล
  const fetchBills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bills/detailed?year=${year}&month=${month}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch bills');
      }
      const data = await res.json();
      console.log('Fetched bills data:', data);
      console.log('Number of bills:', data.length);
      setBills(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Error fetching bills:', error);
      alert(`ไม่สามารถโหลดข้อมูลบิลได้: ${error.message || 'Unknown error'}`);
      setBills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // ดึงข้อมูล contracts (active)
  useEffect(() => {
    const fetchContracts = async () => {
      setIsLoadingContracts(true);
      try {
        const res = await fetch('/api/contracts?status=active');
        if (res.ok) {
          const data = await res.json();
          // เรียงลำดับตาม building_id และ room_number (น้อยไปมาก)
          const sorted = [...data].sort((a, b) => {
            // เรียงตาม building_id ก่อน
            if (a.building_id !== b.building_id) {
              return a.building_id - b.building_id;
            }
            // ถ้า building_id เท่ากัน ให้เรียงตาม room_number (แปลงเป็นตัวเลขเพื่อเรียงถูกต้อง)
            const roomA = parseInt(a.room_number) || 0;
            const roomB = parseInt(b.room_number) || 0;
            return roomA - roomB;
          });
          setContracts(sorted);
        }
      } catch (error) {
        console.error('Error fetching contracts:', error);
      } finally {
        setIsLoadingContracts(false);
      }
    };
    fetchContracts();
  }, []);

  // เปิด modal สร้างบิล
  const openCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  // แปลง form month value (ค.ศ.) เป็น year และ month (พ.ศ.) สำหรับ modal
  useEffect(() => {
    if (formMonthValue) {
      const [adYearStr, monthStr] = formMonthValue.split('-');
      const adYear = Number(adYearStr);
      const monthNum = Number(monthStr);
      const beYear = adYear + 543;
      setForm({ ...form, billing_year: beYear, billing_month: monthNum });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formMonthValue]);

  // ดึง utility readings เมื่อเลือก contract และ billing cycle (สำหรับ contract แรกที่เลือก)
  useEffect(() => {
    const fetchUtilityReadings = async () => {
      if (form.contract_ids.length === 0 || !form.billing_year || !form.billing_month) {
        setUtilityReadings({ electric: null, water: null });
        return;
      }

      // ใช้ contract แรกที่เลือกเพื่อแสดง utility readings
      const firstContractId = form.contract_ids[0];
      const selectedContract = contracts.find(c => c.contract_id === firstContractId);
      if (!selectedContract) {
        setUtilityReadings({ electric: null, water: null });
        return;
      }

      setIsLoadingReadings(true);
      try {
        // ดึงหรือสร้าง billing cycle
        const cycleRes = await fetch(`/api/billing/cycle?year=${form.billing_year}&month=${form.billing_month}`);
        if (!cycleRes.ok) {
          setUtilityReadings({ electric: null, water: null });
          return;
        }
        const cycleData = await cycleRes.json();
        const cycleId = cycleData.cycle_id;

        // ดึง utility readings สำหรับห้องนี้และรอบบิลนี้
        const readingsRes = await fetch(`/api/utility-readings?cycle_id=${cycleId}&room_id=${selectedContract.room_id}`);
        if (readingsRes.ok) {
          const readings = await readingsRes.json();
          const electricReading = readings.find((r: any) => r.utility_code === 'electric');
          const waterReading = readings.find((r: any) => r.utility_code === 'water');

          setUtilityReadings({
            electric: electricReading
              ? { meter_start: electricReading.meter_start, meter_end: electricReading.meter_end }
              : null,
            water: waterReading
              ? { meter_start: waterReading.meter_start, meter_end: waterReading.meter_end }
              : null,
          });
        } else {
          setUtilityReadings({ electric: null, water: null });
        }
      } catch (error) {
        console.error('Error fetching utility readings:', error);
        setUtilityReadings({ electric: null, water: null });
      } finally {
        setIsLoadingReadings(false);
      }
    };

    fetchUtilityReadings();
  }, [form.contract_ids, form.billing_year, form.billing_month, contracts]);

  // ปิด modal
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    // Reset form
    setFormMonthValue(formInitialMonthValue);
    setForm({
      contract_ids: [], // เปลี่ยนเป็น array
      billing_year: formBeYear,
      billing_month: formBeMonth,
      electricity: {
        meter_start: '',
        meter_end: '',
      },
      water: {
        meter_start: '',
        meter_end: '',
      },
      status: 'draft',
    });
    setUtilityReadings({ electric: null, water: null });
  };

  // สร้างบิล (ตามโครงสร้างใหม่) - รองรับหลายสัญญาเช่า
  const handleCreateBill = async () => {
    if (form.contract_ids.length === 0 || !form.billing_year || !form.billing_month) {
      alert('กรุณาเลือกสัญญาเช่าและรอบบิล');
        return;
      }

      // ดึงหรือสร้าง billing cycle
    let cycleId: number;
    try {
      const cycleRes = await fetch(`/api/billing/cycle?year=${form.billing_year}&month=${form.billing_month}`);
      if (!cycleRes.ok) {
        const errorData = await cycleRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get/create billing cycle');
      }
      const cycleData = await cycleRes.json();
      cycleId = cycleData.cycle_id;
    } catch (error: any) {
      alert(`ไม่สามารถดึงรอบบิลได้: ${error.message || 'Unknown error'}`);
        return;
    }

    // ตรวจสอบบิลซ้ำและสร้างบิลสำหรับทุก contract ที่เลือก
    try {
      const dupRes = await fetch(
        `/api/bills/detailed?year=${form.billing_year}&month=${form.billing_month}`
      );
      const existingBills: DetailedBill[] = dupRes.ok ? await dupRes.json() : [];

      const contractsToProcess = contracts.filter(c => form.contract_ids.includes(c.contract_id));
      const successCount: number[] = [];
      const errorMessages: string[] = [];

      for (const contract of contractsToProcess) {
        // ตรวจสอบบิลซ้ำ
        const hasDuplicate = existingBills.some(
          (bill: DetailedBill) =>
            bill.contract_id === contract.contract_id &&
            bill.billing_year === form.billing_year &&
            bill.billing_month === form.billing_month
        );

        if (hasDuplicate) {
          errorMessages.push(`${contract.building_name} - ห้อง ${contract.room_number}: มีบิลแล้ว`);
          continue;
      }

      // สร้างบิลสำหรับ contract นี้
      const billRes = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contract_id: contract.contract_id,
          cycle_id: cycleId,
          maintenance_fee: MAINTENANCE_FEE,
          electric_amount: 0, // จะคำนวณจาก utility readings และ rates
          water_amount: 0, // จะคำนวณจาก utility readings และ rates
          status: form.status,
        }),
      });

        if (billRes.ok) {
          successCount.push(contract.contract_id);
        } else {
        const errorData = await billRes.json().catch(() => ({}));
          errorMessages.push(`${contract.building_name} - ห้อง ${contract.room_number}: ${errorData.error || 'Failed to create bill'}`);
      }
      }

      // แสดงผลลัพธ์
      if (successCount.length > 0) {
        alert(`สร้างบิลสำเร็จ ${successCount.length} ใบ`);
      }
      if (errorMessages.length > 0) {
        alert('เกิดข้อผิดพลาด:\n' + errorMessages.join('\n'));
      }

      if (successCount.length > 0) {
      closeCreateModal();
      fetchBills(); // Refresh bills list
      }
    } catch (error: any) {
      console.error('Error creating bills:', error);
      alert(`ไม่สามารถสร้างบิลได้: ${error.message || 'Unknown error'}`);
    }
  };

  // ออกบิลทั้งเดือน
  const handleRunBilling = async () => {
    if (!confirm(`ยืนยันการออกบิลทั้งเดือนสำหรับ ${getMonthNameThai(month)} ${year}?`)) {
      return;
    }

    setIsRunningBilling(true);
    try {
      const res = await fetch('/api/billing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          maintenance_fee: MAINTENANCE_FEE,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to run billing');
      }

      const data = await res.json();
      alert(`ออกบิลสำเร็จ: สร้างบิล ${data.bills_created} รายการ`);
      fetchBills(); // Refresh bills list
    } catch (error: any) {
      console.error('Error running billing:', error);
      alert(`ไม่สามารถออกบิลได้: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRunningBilling(false);
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const res = await fetch(`/api/bills/export/excel?year=${year}&month=${month}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to export Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `บิล_${year}_${month}_ทั้งหมด.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error exporting Excel:', error);
      alert(`ไม่สามารถส่งออก Excel ได้: ${error.message || 'Unknown error'}`);
    }
  };

  // จัดรูปแบบตัวเลข
  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(Number(num))) return '-';
    const numValue = Number(num);
    if (isNaN(numValue)) return '-';
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue);
  };

// จัดรูปแบบตัวเลขจำนวนเต็ม (ไม่แสดงทศนิยม) สำหรับเลขมิเตอร์เริ่มต้น/สิ้นสุด
const formatInteger = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

  // ดึงข้อมูล utility reading
  const getUtilityReading = (
    bill: DetailedBill,
    utilityType: 'electric' | 'water'
  ): UtilityReading | null => {
    return (
      bill.utility_readings.find(
        (ur) => ur.utility_type === utilityType || 
                ur.utility_type === 'electricity' || 
                (utilityType === 'electric' && ur.utility_type === 'ไฟฟ้า') ||
                (utilityType === 'water' && ur.utility_type === 'น้ำ')
      ) || null
    );
  };

  // สร้างแถวสำหรับแสดงผล (แต่ละผู้เช่า = 1 แถว)
  // ตามตัวอย่าง: ห้องเดียวกันมีหลายผู้เช่า แต่รายละเอียดมิเตอร์แสดงแค่คนแรก
  const tableRows = useMemo(() => {
    const rows: Array<{
      bill: DetailedBill;
      tenant: Tenant | null;
      isFirstTenant: boolean;
      rowNumber: number;
    }> = [];

    let rowNumber = 1;

    bills.forEach((bill) => {
      // ตรวจสอบว่า bill มีข้อมูลครบถ้วน
      if (!bill || !bill.bill_id) {
        console.warn('Invalid bill data:', bill);
        return;
      }

      // ตรวจสอบว่า tenants เป็น array
      const tenants = Array.isArray(bill.tenants) ? bill.tenants : [];

      if (tenants.length === 0) {
        // ถ้าไม่มีผู้เช่า ให้แสดงแถวเดียว
        rows.push({
          bill,
          tenant: null,
          isFirstTenant: true,
          rowNumber: rowNumber++,
        });
      } else {
        // แสดงแถวสำหรับแต่ละผู้เช่า
        // ผู้เช่าคนแรก (isFirstTenant = true) จะแสดงรายละเอียดมิเตอร์
        // ผู้เช่าคนอื่นๆ จะแสดงแค่จำนวนเงิน
        tenants.forEach((tenant, index) => {
          rows.push({
            bill,
            tenant,
            isFirstTenant: index === 0,
            rowNumber: rowNumber++,
          });
        });
      }
    });

    console.log('Table rows generated:', rows.length);
    return rows;
  }, [bills]);

  // คำนวณยอดรวมจากยอดที่แสดงจริงในแต่ละแถว
  // คำนวณจาก tableRows โดยตรงเพื่อให้ตรงกับที่แสดงในตาราง
  const totals = useMemo(() => {
    let totalMaintenance = 0;
    let totalElectricity = 0;
    let totalWater = 0;
    let totalAmount = 0;

    // คำนวณจาก tableRows โดยตรง
    tableRows.forEach((row) => {
      // ค่าบำรุงรักษา: แสดงเฉพาะผู้เช่าคนแรก (isFirstTenant)
      if (row.isFirstTenant) {
        totalMaintenance += MAINTENANCE_FEE;
      }

      // ค่าไฟฟ้า: ใช้ค่าจากฐานข้อมูล (electric_amount) - แสดงทุกแถว
      // แปลงเป็นตัวเลขและตรวจสอบว่าไม่ใช่ NaN
      const electricAmount = Number(row.bill.electric_amount) || 0;
      if (!isNaN(electricAmount)) {
        totalElectricity += electricAmount;
      }

      // ค่าน้ำ: ใช้ค่าจากฐานข้อมูล (water_amount) - แสดงทุกแถว
      // แปลงเป็นตัวเลขและตรวจสอบว่าไม่ใช่ NaN
      const waterAmount = Number(row.bill.water_amount) || 0;
      if (!isNaN(waterAmount)) {
        totalWater += waterAmount;
      }

      // รวม: ใช้ค่าจากฐานข้อมูล (total_amount) - แสดงทุกแถว
      // แปลงเป็นตัวเลขและตรวจสอบว่าไม่ใช่ NaN
      const total = Number(row.bill.total_amount) || 0;
      if (!isNaN(total)) {
        totalAmount += total;
      }
    });

    return {
      maintenance: totalMaintenance,
      electricity: totalElectricity,
      water: totalWater,
      total: totalAmount,
    };
  }, [tableRows]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">จัดการบิลค่าใช้จ่าย</h1>
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              📅 เลือกรอบบิล (เดือน/ปี)
            </label>
          <input
              type="month"
              className="border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              max={maxMonthValue}
            />
          </div>
          <button
            onClick={fetchBills}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ค้นหา
          </button>
          <button
            onClick={openCreateModal}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            สร้างบิลใหม่
          </button>
          <button
            onClick={handleRunBilling}
            disabled={isRunningBilling}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isRunningBilling ? 'กำลังออกบิล...' : 'ออกบิลทั้งเดือน'}
          </button>
          {bills.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 flex items-center gap-2"
              title="ส่งออกเป็น Excel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">กำลังโหลดข้อมูล...</div>
      ) : bills.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-500">ไม่พบข้อมูลบิลสำหรับ {getMonthNameThai(month)} {year}</p>
          <p className="text-sm text-gray-400 mt-2">
            กรุณาตรวจสอบปีและเดือนที่เลือก หรือสร้างบิลใหม่
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border">
                  ลำดับที่
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border">
                  เลขที่ห้อง
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border">
                  ชื่อ-สกุล ผู้เข้าพัก
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border">
                  ค่าดูแลบำรุงรักษาหอพักและบริเวณ
                </th>
                <th
                  colSpan={5}
                  className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border"
                >
                  ค่ากระแสไฟฟ้า
                </th>
                <th
                  colSpan={5}
                  className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border"
                >
                  ค่าน้ำประปา
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border">
                  รวมทั้งสิ้น
                </th>
              </tr>
              <tr>
                <th className="px-3 py-2 border"></th>
                <th className="px-3 py-2 border"></th>
                <th className="px-3 py-2 border"></th>
                <th className="px-3 py-2 border"></th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  เริ่มต้น
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  สิ้นสุด
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  หน่วยใช้ไป
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  อัตรา
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  จำนวนเงิน
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  เริ่มต้น
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  สิ้นสุด
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  หน่วยใช้ไป
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  อัตรา
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  จำนวนเงิน
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 border">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={16}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => {
                  const electricity = getUtilityReading(row.bill, 'electric');
                  const water = getUtilityReading(row.bill, 'water');

                  return (
                    <tr key={`${row.bill.bill_id}_${row.tenant?.tenant_id || 'no-tenant'}`}>
                      <td className="px-3 py-2 text-center border">{row.rowNumber}</td>
                      <td className="px-3 py-2 border">{row.bill.room_number || '-'}</td>
                      <td className="px-3 py-2 border">
                        {row.tenant && row.tenant.first_name && row.tenant.last_name
                          ? `${row.tenant.first_name} ${row.tenant.last_name}`
                          : '-'}
                      </td>
                    <td className="px-3 py-2 text-right border">
                      {row.isFirstTenant
                        ? formatNumber(MAINTENANCE_FEE)
                        : ''}
                    </td>
                    {/* ไฟฟ้า */}
                    <td className="px-3 py-2 text-center border">
                      {row.isFirstTenant && electricity
                        ? formatInteger(electricity.meter_start)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {row.isFirstTenant && electricity
                        ? formatInteger(electricity.meter_end)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {row.isFirstTenant && electricity
                        ? formatNumber(electricity.usage)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {/* อัตรา: ดึงจาก utility_rates */}
                      {row.isFirstTenant && electricity && electricity.rate_per_unit
                        ? formatNumber(electricity.rate_per_unit)
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-right border">
                      {/* จำนวนเงิน: ใช้ค่าจากฐานข้อมูลโดยตรง (electric_amount) */}
                      {(() => {
                        const electricAmount = row.bill.electric_amount || 0;
                        return electricAmount > 0 ? formatNumber(electricAmount) : '-';
                      })()}
                    </td>
                    {/* น้ำ */}
                    <td className="px-3 py-2 text-center border">
                      {row.isFirstTenant && water
                        ? formatInteger(water.meter_start)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {row.isFirstTenant && water
                        ? formatInteger(water.meter_end)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {row.isFirstTenant && water ? formatNumber(water.usage) : ''}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {/* อัตรา: ดึงจาก utility_rates */}
                      {row.isFirstTenant && water && water.rate_per_unit
                        ? formatNumber(water.rate_per_unit)
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-right border">
                      {/* จำนวนเงิน: ใช้ค่าจากฐานข้อมูลโดยตรง (water_amount) */}
                      {(() => {
                        const waterAmount = row.bill.water_amount || 0;
                        return waterAmount > 0 ? formatNumber(waterAmount) : '-';
                      })()}
                    </td>
                    {/* รวม */}
                    <td className="px-3 py-2 text-right font-medium border">
                      {/* ใช้ค่าจากฐานข้อมูลโดยตรง (total_amount) */}
                      {(() => {
                        const total = row.bill.total_amount || 0;
                        return total > 0 ? formatNumber(total) : '-';
                      })()}
                    </td>
                    {/* จัดการ */}
                    <td className="px-3 py-2 text-center border">
                      <div className="flex gap-2 justify-center">
                        <Link
                          href={`/admin/bills/preview/${row.bill.bill_id}`}
                          className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 flex items-center gap-1"
                          title="ดูพรีวิว"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Preview
                        </Link>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/bills/export/individual/${row.bill.bill_id}`);
                              if (!res.ok) {
                                const errorData = await res.json().catch(() => ({}));
                                throw new Error(errorData.error || 'Failed to export');
                              }
                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `บิล_${row.bill.bill_id}.xlsx`;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                            } catch (error: any) {
                              alert(`ไม่สามารถส่งออกได้: ${error.message || 'Unknown error'}`);
                            }
                          }}
                          className="bg-green-700 text-white px-2 py-1 rounded text-xs hover:bg-green-800 flex items-center gap-1"
                          title="Export Excel"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Export
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
              {/* แถวรวมยอด - แสดงเฉพาะเมื่อมีข้อมูล */}
              {tableRows.length > 0 && (
                <tr className="bg-gray-100 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-center border">
                    รวม
                  </td>
                  <td className="px-3 py-2 text-right border">
                    {formatNumber(totals.maintenance)}
                  </td>
                  <td colSpan={4} className="px-3 py-2 border"></td>
                  <td className="px-3 py-2 text-right border">
                    {formatNumber(totals.electricity)}
                  </td>
                  <td colSpan={4} className="px-3 py-2 border"></td>
                  <td className="px-3 py-2 text-right border">
                    {formatNumber(totals.water)}
                  </td>
                  <td className="px-3 py-2 text-right border">
                    {formatNumber(totals.total)}
                  </td>
                  <td className="px-3 py-2 border"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal สร้างบิลใหม่ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold mb-4">สร้างบิลใหม่</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* เลือกสัญญาเช่า (แบบ checkbox) */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  เลือกสัญญาเช่า (ผู้เช่า) <span className="text-red-500">*</span>
                </label>
                <div className="w-full border rounded-md px-3 py-2 max-h-60 overflow-y-auto bg-white">
                  {isLoadingContracts ? (
                    <p className="text-sm text-gray-500">กำลังโหลด...</p>
                  ) : contracts.length === 0 ? (
                    <p className="text-sm text-gray-500">ไม่มีสัญญาเช่า</p>
                  ) : (
                    <div className="space-y-2">
                  {contracts.map((contract) => (
                        <label
                          key={contract.contract_id}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={form.contract_ids.includes(contract.contract_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm({
                                  ...form,
                                  contract_ids: [...form.contract_ids, contract.contract_id],
                                });
                              } else {
                                setForm({
                                  ...form,
                                  contract_ids: form.contract_ids.filter(id => id !== contract.contract_id),
                                });
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">
                      {contract.building_name} - ห้อง {contract.room_number} - {contract.first_name_th} {contract.last_name_th}
                          </span>
                        </label>
                  ))}
                    </div>
                  )}
                </div>
                {form.contract_ids.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    เลือกแล้ว {form.contract_ids.length} สัญญา
                  </p>
                )}
              </div>

              {/* รอบบิล (เดือน/ปี) */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  📅 รอบบิล (เดือน/ปี) <span className="text-red-500">*</span>
                </label>
                <input
                  type="month"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  value={formMonthValue}
                  onChange={(e) => setFormMonthValue(e.target.value)}
                  max={formMaxMonthValue}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {getMonthNameThai(form.billing_month)} {form.billing_year} 
                </p>
              </div>


              {/* ค่าบำรุงรักษา (คงที่) */}
              <div>
                <label className="block text-sm font-medium mb-1">ค่าบำรุงรักษา</label>
                <div className="w-full border rounded-md px-3 py-2 bg-gray-50 text-gray-700">
                  {formatNumber(MAINTENANCE_FEE)} บาท
                </div>
              </div>

              {/* สถานะ */}
              <div>
                <label className="block text-sm font-medium mb-1">สถานะ</label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">ร่าง</option>
                  <option value="sent">ส่งแล้ว</option>
                  <option value="paid">ชำระแล้ว</option>
                </select>
              </div>
            </div>

            {/* ค่าไฟฟ้า */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">ค่าไฟฟ้า (บันทึกเลขมิเตอร์)</h3>
              {isLoadingReadings ? (
                <div className="text-sm text-gray-500">กำลังโหลดข้อมูล...</div>
              ) : utilityReadings.electric ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">เลขมิเตอร์เริ่มต้น (meter_start)</label>
                    <div className="w-full border rounded-md px-3 py-2 bg-gray-50 text-gray-700">
                      {formatInteger(utilityReadings.electric.meter_start ?? undefined)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">เลขมิเตอร์สิ้นสุด (meter_end)</label>
                    <div className="w-full border rounded-md px-3 py-2 bg-gray-50 text-gray-700">
                      {formatInteger(utilityReadings.electric.meter_end ?? undefined)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 space-y-2">
                  <div>ยังไม่มีการบันทึกเลขมิเตอร์สำหรับรอบบิลนี้</div>
                  {selectedContracts.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        (window.location.href = `/admin/utility-readings?room_id=${selectedContracts[0].room_id}`)
                      }
                      className="inline-flex items-center px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                      ไปหน้าบันทึกเลขมิเตอร์ (ห้อง {selectedContracts[0].room_number})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ค่าน้ำ */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">ค่าน้ำ (บันทึกเลขมิเตอร์)</h3>
              {isLoadingReadings ? (
                <div className="text-sm text-gray-500">กำลังโหลดข้อมูล...</div>
              ) : utilityReadings.water ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">เลขมิเตอร์เริ่มต้น (meter_start)</label>
                    <div className="w-full border rounded-md px-3 py-2 bg-gray-50 text-gray-700">
                      {formatInteger(utilityReadings.water.meter_start ?? undefined)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">เลขมิเตอร์สิ้นสุด (meter_end)</label>
                    <div className="w-full border rounded-md px-3 py-2 bg-gray-50 text-gray-700">
                      {formatInteger(utilityReadings.water.meter_end ?? undefined)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 space-y-2">
                  <div>ยังไม่มีการบันทึกเลขมิเตอร์สำหรับรอบบิลนี้</div>
                  {selectedContracts.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        (window.location.href = `/admin/utility-readings?room_id=${selectedContracts[0].room_id}`)
                      }
                      className="inline-flex items-center px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                      ไปหน้าบันทึกเลขมิเตอร์ (ห้อง {selectedContracts[0].room_number})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ปุ่ม */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeCreateModal}
                className="px-4 py-2 rounded-md border hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreateBill}
                className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
              >
                สร้างบิล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

