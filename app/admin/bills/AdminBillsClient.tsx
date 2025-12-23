'use client';

import { useState, useEffect, useMemo } from 'react';
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
  contract_id: number | '';
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
  const [year, setYear] = useState(now.getFullYear() + 543);
  const [month, setMonth] = useState(now.getMonth() + 1);
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
  const [form, setForm] = useState<BillForm>({
    contract_id: '',
    billing_year: now.getFullYear() + 543,
    billing_month: now.getMonth() + 1,
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
  const selectedContract = useMemo(
    () => contracts.find((c) => c.contract_id === form.contract_id) || null,
    [contracts, form.contract_id]
  );

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

  // ดึง utility readings เมื่อเลือก contract และ billing cycle
  useEffect(() => {
    const fetchUtilityReadings = async () => {
      if (!form.contract_id || !form.billing_year || !form.billing_month) {
        setUtilityReadings({ electric: null, water: null });
        return;
      }

      const selectedContract = contracts.find(c => c.contract_id === form.contract_id);
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
  }, [form.contract_id, form.billing_year, form.billing_month, contracts]);

  // ปิด modal
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    // Reset form
    setForm({
      contract_id: '',
      billing_year: now.getFullYear() + 543,
      billing_month: now.getMonth() + 1,
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

  // สร้างบิล (ตามโครงสร้างใหม่)
  const handleCreateBill = async () => {
    if (!form.contract_id || !form.billing_year || !form.billing_month) {
      alert('กรุณาเลือกสัญญาเช่าและรอบบิล');
      return;
    }

    // ป้องกันการสร้างบิลซ้ำในรอบบิลเดียวกัน (อ้างอิงเดือน/ปีจาก dropdown ในโมดัล)
    // ใช้ข้อมูลจาก API ตามปี/เดือนที่เลือก ไม่ผูกกับตัวกรองปี/เดือนของหน้าหลัก
    try {
      const dupRes = await fetch(
        `/api/bills/detailed?year=${form.billing_year}&month=${form.billing_month}`
      );
      if (dupRes.ok) {
        const dupData = await dupRes.json();
        const hasDuplicate = Array.isArray(dupData)
          ? dupData.some(
              (bill: DetailedBill) =>
                bill.contract_id === form.contract_id &&
                bill.billing_year === form.billing_year &&
                bill.billing_month === form.billing_month
            )
          : false;
        if (hasDuplicate) {
          alert('สัญญานี้มีการออกบิลรอบนี้แล้ว');
          return;
        }
      }
    } catch (dupErr) {
      console.error('Error checking duplicate bills:', dupErr);
      alert('ไม่สามารถตรวจสอบบิลซ้ำได้ กรุณาลองใหม่');
      return;
    }

    try {
      const selectedContract = contracts.find(c => c.contract_id === form.contract_id);
      if (!selectedContract) {
        alert('ไม่พบสัญญาเช่าที่เลือก');
        return;
      }

      // ดึงหรือสร้าง billing cycle
      const cycleRes = await fetch(`/api/billing/cycle?year=${form.billing_year}&month=${form.billing_month}`);
      if (!cycleRes.ok) {
        const errorData = await cycleRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get/create billing cycle');
      }
      const cycleData = await cycleRes.json();
      const cycleId = cycleData.cycle_id;

      // ตรวจสอบว่ามี utility readings หรือไม่
      if (!utilityReadings.electric && !utilityReadings.water) {
        alert('กรุณาบันทึกเลขมิเตอร์ก่อนสร้างบิล (ไปที่หน้า "บันทึกเลขมิเตอร์")');
        return;
      }

      // สร้างบิลสำหรับ contract นี้
      // ระบบจะคำนวณ electric_amount และ water_amount จาก utility readings อัตโนมัติ
      // ไม่ต้องบันทึก utility readings อีกครั้ง เพราะบันทึกไว้แล้วในหน้า "บันทึกเลขมิเตอร์"
      const billRes = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: Number(form.contract_id),
          cycle_id: cycleId,
          maintenance_fee: MAINTENANCE_FEE,
          electric_amount: 0, // จะคำนวณจาก utility readings และ rates
          water_amount: 0, // จะคำนวณจาก utility readings และ rates
          status: form.status,
        }),
      });

      if (!billRes.ok) {
        const errorData = await billRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create bill');
      }

      alert('สร้างบิลสำเร็จ');
      closeCreateModal();
      fetchBills(); // Refresh bills list
    } catch (error: any) {
      console.error('Error creating bill:', error);
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

  // คำนวณยอดรวม
  // ตามตัวอย่าง: รวมยอดจากทุกบิล (ไม่ซ้ำตามจำนวนผู้เช่า)
  const totals = useMemo(() => {
    let totalMaintenance = 0;
    let totalElectricity = 0;
    let totalWater = 0;
    let totalAmount = 0;

    // ใช้ Set เพื่อไม่ให้นับบิลซ้ำ
    const processedBills = new Set<number>();

    bills.forEach((bill) => {
      // นับบิลแค่ครั้งเดียว (ไม่นับตามจำนวนผู้เช่า)
      if (!processedBills.has(bill.bill_id)) {
        processedBills.add(bill.bill_id);
        
        // ใช้ค่าคงที่ MAINTENANCE_FEE ในการคำนวณ
        // คำนวณจำนวนเงินจาก utility readings และ rates
        const electricReading = bill.utility_readings?.find(
          (ur) => ur.utility_type === 'electric' || ur.utility_type === 'electricity'
        );
        const waterReading = bill.utility_readings?.find(
          (ur) => ur.utility_type === 'water'
        );
        
        const electricAmount = electricReading && electricReading.usage !== undefined && electricReading.rate_per_unit !== undefined
          ? electricReading.usage * electricReading.rate_per_unit
          : bill.electric_amount || 0;
        
        const waterAmount = waterReading && waterReading.usage !== undefined && waterReading.rate_per_unit !== undefined
          ? waterReading.usage * waterReading.rate_per_unit
          : bill.water_amount || 0;
        
        totalMaintenance += MAINTENANCE_FEE;
        totalElectricity += electricAmount;
        totalWater += waterAmount;
        totalAmount += MAINTENANCE_FEE + electricAmount + waterAmount;
      }
    });

    return {
      maintenance: totalMaintenance,
      electricity: totalElectricity,
      water: totalWater,
      total: totalAmount,
    };
  }, [bills]);

  // จัดรูปแบบตัวเลข
  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">จัดการบิลค่าใช้จ่าย</h1>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="ปี"
            className="border rounded px-3 py-2"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <select
            className="border rounded px-3 py-2"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <option key={m} value={m}>
                {getMonthNameThai(m)}
              </option>
            ))}
          </select>
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
                <th className="px-3 py-2 border"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
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
                      {/* จำนวนเงิน: คำนวณจาก usage * rate_per_unit */}
                      {row.isFirstTenant && electricity && electricity.usage !== undefined && electricity.rate_per_unit !== undefined
                        ? formatNumber(electricity.usage * electricity.rate_per_unit)
                        : row.bill.electric_amount
                        ? formatNumber(row.bill.electric_amount)
                        : '-'}
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
                      {/* จำนวนเงิน: คำนวณจาก usage * rate_per_unit */}
                      {row.isFirstTenant && water && water.usage !== undefined && water.rate_per_unit !== undefined
                        ? formatNumber(water.usage * water.rate_per_unit)
                        : row.bill.water_amount
                        ? formatNumber(row.bill.water_amount)
                        : '-'}
                    </td>
                    {/* รวม */}
                    <td className="px-3 py-2 text-right font-medium border">
                      {/* คำนวณรวมใหม่: maintenance_fee + (electric usage * rate) + (water usage * rate) */}
                      {(() => {
                        const electricAmount = row.isFirstTenant && electricity && electricity.usage !== undefined && electricity.rate_per_unit !== undefined
                          ? electricity.usage * electricity.rate_per_unit
                          : row.bill.electric_amount || 0;
                        const waterAmount = row.isFirstTenant && water && water.usage !== undefined && water.rate_per_unit !== undefined
                          ? water.usage * water.rate_per_unit
                          : row.bill.water_amount || 0;
                        const total = MAINTENANCE_FEE + electricAmount + waterAmount;
                        return formatNumber(total);
                      })()}
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
              {/* เลือกสัญญาเช่า */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  เลือกสัญญาเช่า (ผู้เช่า) <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={form.contract_id}
                  onChange={(e) => setForm({ ...form, contract_id: e.target.value ? Number(e.target.value) : '' })}
                  disabled={isLoadingContracts}
                >
                  <option value="">-- เลือกสัญญาเช่า --</option>
                  {contracts.map((contract) => (
                    <option key={contract.contract_id} value={contract.contract_id}>
                      {contract.building_name} - ห้อง {contract.room_number} - {contract.first_name_th} {contract.last_name_th}
                    </option>
                  ))}
                </select>
              </div>

              {/* ปี */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  ปี (พ.ศ.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  className="w-full border rounded-md px-3 py-2"
                  value={form.billing_year}
                  onChange={(e) => setForm({ ...form, billing_year: Number(e.target.value) })}
                />
              </div>

              {/* เดือน */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  เดือน <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={form.billing_month}
                  onChange={(e) => setForm({ ...form, billing_month: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <option key={m} value={m}>
                      {getMonthNameThai(m)}
                    </option>
                  ))}
                </select>
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
                  {selectedContract && (
                    <button
                      type="button"
                      onClick={() =>
                        (window.location.href = `/admin/utility-readings?room_id=${selectedContract.room_id}`)
                      }
                      className="inline-flex items-center px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                      ไปหน้าบันทึกเลขมิเตอร์ (ห้อง {selectedContract.room_number})
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
                  {selectedContract && (
                    <button
                      type="button"
                      onClick={() =>
                        (window.location.href = `/admin/utility-readings?room_id=${selectedContract.room_id}`)
                      }
                      className="inline-flex items-center px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                      ไปหน้าบันทึกเลขมิเตอร์ (ห้อง {selectedContract.room_number})
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

