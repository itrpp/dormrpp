'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillPreviewData } from '@/components/BillPreviewContent';
import BillPreviewContent from '@/components/BillPreviewContent';
import { getMonthNameThai } from '@/lib/date-utils';

interface UtilityReading {
  reading_id: number;
  utility_type: string;
  utility_name: string;
  meter_start: number;
  meter_end: number;
  usage: number;
  rate_per_unit: number;
  created_at: string | null;
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
  due_date: string | null;
  maintenance_fee: number;
  electric_amount: number;
  water_amount: number;
  subtotal_amount: number;
  total_amount: number;
  status: string;
  tenant_count: number;
  tenants: {
    tenant_id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    move_in_date: string | null;
    move_out_date: string | null;
    contract_status: string;
  }[];
  utility_readings: UtilityReading[];
}

const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(Number(num))) return '-';
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(num));
};

export default function TenantBillsClient() {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  const beMonth = now.getMonth() + 1;
  const adYear = now.getFullYear();
  const adMonth = String(now.getMonth() + 1).padStart(2, '0');
  const initialMonthValue = `${adYear}-${adMonth}`;

  const [monthValue, setMonthValue] = useState(initialMonthValue);
  const [year, setYear] = useState(beYear);
  const [month, setMonth] = useState(beMonth);
  const [bills, setBills] = useState<DetailedBill[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewBillId, setPreviewBillId] = useState<number | null>(null);
  const [previewBillData, setPreviewBillData] = useState<BillPreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    if (monthValue) {
      const [adYearStr, monthStr] = monthValue.split('-');
      const adY = Number(adYearStr);
      const m = Number(monthStr);
      const beY = adY + 543;
      setYear(beY);
      setMonth(m);
    }
  }, [monthValue]);

  const fetchBills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/my/bills?year=${year}&month=${month}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch bills');
      }
      const data: DetailedBill[] = await res.json();
      setBills(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Error fetching my bills:', error);
      alert(error.message || 'ไม่สามารถโหลดบิลของคุณได้');
      setBills([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const openPreview = async (billId: number) => {
    setIsPreviewOpen(true);
    setPreviewBillId(billId);
    setIsLoadingPreview(true);
    setPreviewBillData(null);
    try {
      const res = await fetch(`/api/my/bills/${billId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch bill');
      }
      const data: BillPreviewData = await res.json();
      setPreviewBillData(data);
    } catch (error: any) {
      console.error('Error fetching my bill preview:', error);
      alert(error.message || 'ไม่สามารถโหลดข้อมูลบิลได้');
      setIsPreviewOpen(false);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewBillId(null);
    setPreviewBillData(null);
  };

  const rows = useMemo(
    () =>
      bills.map((b) => {
        const firstTenant = b.tenants[0];
        return {
          bill_id: b.bill_id,
          room_number: b.room_number,
          building_name: b.building_name,
          billing_year: b.billing_year,
          billing_month: b.billing_month,
          total_amount: b.total_amount,
          status: b.status,
          tenant_name: firstTenant
            ? `${firstTenant.first_name} ${firstTenant.last_name}`
            : '-',
        };
      }),
    [bills],
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">บิลค่าใช้จ่ายของฉัน</h1>
          <p className="text-sm text-gray-500 mt-1">
            ดูบิลหอพักของคุณตามรอบบิล (เดือน/ปี)
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              📅 เลือกรอบบิล (เดือน/ปี)
            </label>
            <input
              type="month"
              className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              {getMonthNameThai(month)} {year}
            </p>
          </div>
          <button
            onClick={fetchBills}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            โหลดบิล
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          กำลังโหลดข้อมูล...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-500">
            ยังไม่มีบิลสำหรับ {getMonthNameThai(month)} {year}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  เลขที่ห้อง
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  อาคาร
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  ผู้เข้าพัก
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  รอบบิล
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  ยอดชำระทั้งสิ้น
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  สถานะ
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.bill_id}>
                  <td className="px-4 py-2 whitespace-nowrap">{row.room_number}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.building_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.tenant_name}</td>
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    {getMonthNameThai(row.billing_month)} {row.billing_year}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatNumber(row.total_amount)} บาท
                  </td>
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    {row.status === 'paid'
                      ? 'ชำระแล้ว'
                      : row.status === 'sent'
                        ? 'ส่งแล้ว'
                        : 'รอชำระ'}
                  </td>
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    <button
                      onClick={() => openPreview(row.bill_id)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                    >
                      ดูรายละเอียด
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview Modal สำหรับผู้เช่า */}
      {isPreviewOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto bill-print-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">พรีวิวบิลของฉัน</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => window.print()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                >
                  พิมพ์
                </button>
                <button
                  onClick={closePreview}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-8">
              {isLoadingPreview ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
                </div>
              ) : previewBillData ? (
                <BillPreviewContent data={previewBillData} />
              ) : (
                <div className="text-center py-8">
                  <p className="text-red-600">ไม่พบข้อมูลบิล</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

