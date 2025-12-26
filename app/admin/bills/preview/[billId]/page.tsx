// app/admin/bills/preview/[billId]/page.tsx
// หน้า preview บิลรายคนก่อนพิมพ์
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface BillData {
  bill: {
    bill_id: number;
    bill_number: string;
    billing_date: string;
    due_date: string;
    status: string;
    status_text: string;
  };
  tenant: {
    first_name: string;
    last_name: string;
    room_number: string;
    floor_no: string;
    building_name: string;
    billing_month: string;
    billing_year: number;
    contract_status: string;
    tenant_count: number;
  };
  charges: {
    maintenance_fee: number;
    other_fixed: number;
    discount: number;
  };
  utilities: {
    electric: {
      meter_start: number;
      meter_end: number;
      usage: number;
      rate_per_unit: number;
      amount: number;
    } | null;
    water: {
      meter_start: number;
      meter_end: number;
      usage: number;
      rate_per_unit: number;
      amount: number;
    } | null;
  };
  summary: {
    utility_total: number;
    maintenance_fee: number;
    total_amount: number;
  };
}

export default function BillPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.billId as string;
  const [billData, setBillData] = useState<BillData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBillData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/bills/${billId}/individual`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch bill');
        }
        const data = await res.json();
        setBillData(data);
      } catch (err: any) {
        setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setIsLoading(false);
      }
    };

    if (billId) {
      fetchBillData();
    }
  }, [billId]);

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/bills/export/individual/${billId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to export');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `บิล_${billData?.bill.bill_number || billId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`ไม่สามารถส่งออกได้: ${err.message || 'Unknown error'}`);
    }
  };

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(Number(num))) return '0.00';
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(num));
  };

  const formatInteger = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('th-TH').format(num);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error || !billData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'ไม่พบข้อมูลบิล'}</p>
          <Link
            href="/admin/bills"
            className="text-blue-600 hover:text-blue-800"
          >
            กลับไปหน้ารายการบิล
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header Actions */}
        <div className="mb-6 flex justify-between items-center">
          <Link
            href="/admin/bills"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            กลับไปหน้ารายการบิล
          </Link>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              พิมพ์
            </button>
            <button
              onClick={handleExport}
              className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
          </div>
        </div>

        {/* Bill Preview */}
        <div className="bg-white shadow-lg rounded-lg p-8 print:shadow-none print:p-4">
          {/* ส่วนที่ 1: Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">ใบแจ้งค่าใช้จ่ายหอพัก</h1>
            <h2 className="text-xl font-bold mb-4">โรงพยาบาลราชพิพัฒน์</h2>
            <div className="border-t-2 border-gray-300 my-4"></div>
          </div>

          {/* ข้อมูลด้านขวาบน */}
          <div className="text-right mb-6">
            <p className="text-sm"><strong>เลขที่บิล</strong> : {billData.bill.bill_number}</p>
            <p className="text-sm"><strong>วันที่ออกบิล</strong> : {billData.bill.billing_date}</p>
            <p className="text-sm"><strong>กำหนดชำระ</strong> : {billData.bill.due_date}</p>
          </div>

          {/* ส่วนที่ 2: ข้อมูลผู้เช่า */}
          <div className="mb-6">
            <h3 className="text-lg font-bold bg-gray-100 p-2 mb-2">ข้อมูลผู้เข้าพัก</h3>
            <div className="border-t border-gray-300 mb-3"></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <strong>ชื่อ–สกุล</strong> : {billData.tenant.first_name} {billData.tenant.last_name}
              </div>
              <div></div>
              <div>
                <strong>เลขที่ห้อง</strong> : {billData.tenant.room_number} <span className="ml-4"><strong>ชั้น</strong> : {billData.tenant.floor_no}</span>
              </div>
              <div></div>
              <div>
                <strong>อาคาร</strong> : {billData.tenant.building_name}
              </div>
              <div></div>
              <div>
                <strong>รอบบิล</strong> : เดือน{billData.tenant.billing_month} {billData.tenant.billing_year}
              </div>
              <div></div>
              <div>
                <strong>สถานะสัญญา</strong> : {billData.tenant.contract_status}
              </div>
            </div>
          </div>

          {/* ส่วนที่ 3: ตารางค่าใช้จ่าย */}
          <div className="mb-6">
            {/* ตารางที่ 1: ค่าดูแล/ค่าคงที่ */}
            <h3 className="text-base font-bold bg-gray-100 p-2 mb-2">ตารางที่ 1 : ค่าดูแล / ค่าคงที่</h3>
            <table className="w-full border-collapse border border-gray-300 mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left">รายการ</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">ค่าดูแลและบำรุงรักษาหอพัก</td>
                  <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.charges.maintenance_fee)}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">ค่าใช้จ่ายคงที่อื่น</td>
                  <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.charges.other_fixed)}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">ส่วนลด</td>
                  <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.charges.discount)}</td>
                </tr>
              </tbody>
            </table>

            {/* ตารางที่ 2: ค่าสาธารณูปโภค */}
            <h3 className="text-base font-bold bg-gray-100 p-2 mb-2">ตารางที่ 2 : ค่าสาธารณูปโภค (อ้างอิงมิเตอร์)</h3>
            
            {/* ค่าไฟฟ้า */}
            <h4 className="text-sm font-bold mb-2">🔌 ค่าไฟฟ้า</h4>
            <table className="w-full border-collapse border border-gray-300 mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-center">เริ่มต้น</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">สิ้นสุด</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">หน่วยใช้</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">อัตรา</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">เป็นเงิน</th>
                </tr>
              </thead>
              <tbody>
                {billData.utilities.electric ? (
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatInteger(billData.utilities.electric.meter_start)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatInteger(billData.utilities.electric.meter_end)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatInteger(billData.utilities.electric.usage)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.utilities.electric.rate_per_unit)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.utilities.electric.amount)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 px-4 py-2 text-center text-gray-500">ไม่มีข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ค่าน้ำ */}
            <h4 className="text-sm font-bold mb-2">🚿 ค่าน้ำประปา</h4>
            <table className="w-full border-collapse border border-gray-300 mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-center">เริ่มต้น</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">สิ้นสุด</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">หน่วยใช้</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">อัตรา</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">เป็นเงิน</th>
                </tr>
              </thead>
              <tbody>
                {billData.utilities.water ? (
                  <tr>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatInteger(billData.utilities.water.meter_start)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatInteger(billData.utilities.water.meter_end)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatInteger(billData.utilities.water.usage)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.utilities.water.rate_per_unit)}</td>
                    <td className="border border-gray-300 px-4 py-2 text-right">{formatNumber(billData.utilities.water.amount)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="border border-gray-300 px-4 py-2 text-center text-gray-500">ไม่มีข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* หมายเหตุ */}
            <p className="text-xs italic text-gray-600 mb-4">
              📝 หมายเหตุ: ค่าไฟ/น้ำเป็นการใช้งานร่วมของห้อง ระบบออกบิล "ซ้ำต่อผู้เช่า" ตามระเบียบหอพัก
            </p>
          </div>

          {/* ส่วนที่ 4: สรุปยอด */}
          <div className="mb-6">
            <div className="border-t-2 border-gray-300 my-4"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold">รวมค่าสาธารณูปโภค</span>
              <span className="font-bold">{formatNumber(billData.summary.utility_total)} บาท</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold">ค่าดูแล/บำรุงรักษา</span>
              <span className="font-bold">{formatNumber(billData.summary.maintenance_fee)} บาท</span>
            </div>
            <div className="border-t-2 border-gray-300 my-4"></div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xl font-bold">ยอดชำระทั้งสิ้น</span>
              <span className="text-xl font-bold">{formatNumber(billData.summary.total_amount)} บาท</span>
            </div>
            <div className="border-t-2 border-gray-300 my-4"></div>
          </div>

          {/* ส่วนที่ 5: สถานะ & ช่องลงนาม */}
          <div className="mb-6">
            <p className="mb-4">
              <strong>สถานะบิล</strong> : {billData.bill.status_text}
            </p>
            <div className="mt-6">
              <p className="mb-2">ผู้จัดทำ ..................................................</p>
              <p>หัวหน้าฝ่าย ................................................</p>
            </div>
          </div>

          {/* ส่วนที่ 6: Footer */}
          <div className="mt-8 border-t border-gray-300 pt-4">
            <h4 className="font-bold mb-2">หมายเหตุ</h4>
            <ul className="text-sm space-y-1">
              <li>- กรุณาชำระภายในกำหนด หากเกินกำหนดอาจมีค่าปรับ</li>
              <li>- เอกสารนี้ออกโดยระบบหอพักโรงพยาบาลราชพิพัฒน์</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .no-print {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

