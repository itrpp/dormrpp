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
  const adYear = now.getFullYear();
  const adMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentMonthValue = `${adYear}-${adMonth}`;

  // ค่าเริ่มต้นเป็น '' = แสดงบิลทุกเดือน (ไม่ดีฟอลต์แค่เดือนปัจจุบัน)
  const [monthValue, setMonthValue] = useState('');
  const [bills, setBills] = useState<DetailedBill[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewBillId, setPreviewBillId] = useState<number | null>(null);
  const [previewBillData, setPreviewBillData] = useState<BillPreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBill, setIsExportingBill] = useState(false);

  const fetchBills = async () => {
    setIsLoading(true);
    try {
      const url =
        monthValue.trim() === ''
          ? '/api/my/bills'
          : (() => {
              const [adYearStr, monthStr] = monthValue.split('-');
              const beY = Number(adYearStr) + 543;
              const m = Number(monthStr);
              return `/api/my/bills?year=${beY}&month=${m}`;
            })();
      const res = await fetch(url);
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
  }, [monthValue]);

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

  const handleExportBillDetail = async () => {
    if (previewBillId == null) return;
    setIsExportingBill(true);
    try {
      const res = await fetch(`/api/my/bills/export/${previewBillId}`, {
        method: 'GET',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ส่งออกรายละเอียดบิลไม่สำเร็จ');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      const name = match
        ? decodeURIComponent(match[1].trim().replace(/^["']|["']$/g, ''))
        : `รายละเอียดบิล_${previewBillId}.xlsx`;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(error.message || 'ไม่สามารถส่งออกรายละเอียดบิลได้');
    } finally {
      setIsExportingBill(false);
    }
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

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const handleExportList = async () => {
    setIsExporting(true);
    try {
      const query =
        monthValue.trim() === ''
          ? ''
          : (() => {
              const [adYearStr, monthStr] = monthValue.split('-');
              const beY = Number(adYearStr) + 543;
              const m = Number(monthStr);
              return `?year=${beY}&month=${m}`;
            })();
      const res = await fetch(`/api/my/bills/export-list${query}`, {
        method: 'GET',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ส่งออกรายการไม่สำเร็จ');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      const downloadName = match
        ? decodeURIComponent(match[1].trim().replace(/^["']|["']$/g, ''))
        : monthValue.trim() === ''
          ? 'รายการบิล_ทุกเดือน.xlsx'
          : (() => {
              const [y, m] = monthValue.split('-');
              return `รายการบิล_${getMonthNameThai(Number(m))}_${Number(y) + 543}.xlsx`;
            })();
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      alert(error.message || 'ไม่สามารถส่งออกรายการได้');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">บิลค่าใช้จ่ายของฉัน</h1>
          <p className="text-sm text-gray-500 mt-1">
            ดูบิลหอพักของคุณตามรอบบิล (เดือน/ปี)
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              📅 เลือกรอบบิล (เดือน/ปี)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMonthValue('')}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  monthValue === ''
                    ? 'bg-blue-100 border-blue-500 text-blue-800 font-medium'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                ทุกเดือน
              </button>
              <input
                type="month"
                className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                max={currentMonthValue}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {monthValue === ''
                ? 'แสดงบิลทุกเดือนที่มี'
                : (() => {
                    const [y, m] = monthValue.split('-');
                    return `${getMonthNameThai(Number(m))} ${Number(y) + 543}`;
                  })()}
            </p>
          </div>
  
          {rows.length > 0 && (
            <button
              onClick={handleExportList}
              disabled={isExporting}
              className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isExporting ? 'กำลังส่งออก...' : 'ส่งออกรายการ (Excel)'}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          กำลังโหลดข้อมูล...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-500">
            {monthValue === ''
              ? 'ยังไม่มีบิล'
              : (() => {
                  const [y, m] = monthValue.split('-');
                  return `ยังไม่มีบิลสำหรับ ${getMonthNameThai(Number(m))} ${Number(y) + 543}`;
                })()}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-12">
                  No.
                </th>
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
              {paginatedRows.map((row, index) => {
                const rowNo = (currentPage - 1) * PAGE_SIZE + index + 1;
                return (
                  <tr key={row.bill_id}>
                    <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                      {rowNo}
                    </td>
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
                );
              })}
            </tbody>
          </table>
          {rows.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
              <span>
                แสดง {(currentPage - 1) * PAGE_SIZE + 1} -{' '}
                {Math.min(currentPage * PAGE_SIZE, rows.length)} จาก {rows.length} รายการ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ก่อนหน้า
                </button>
                <span>
                  หน้า {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
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
                  onClick={handleExportBillDetail}
                  disabled={isExportingBill || !previewBillId}
                  className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                >
                  {isExportingBill ? 'กำลังส่งออก...' : 'Export รายละเอียดบิล'}
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

