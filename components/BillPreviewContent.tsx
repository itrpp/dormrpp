'use client';

import React from 'react';

export interface BillPreviewData {
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
  meter_photos: {
    electric: {
      photo_id: number;
      photo_url: string;
    } | null;
    water: {
      photo_id: number;
      photo_url: string;
    } | null;
  };
}

interface Props {
  data: BillPreviewData;
}

const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(Number(num))) return '0.00';
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(num));
};

const formatInteger = (num: number | null | undefined): string => {
  if (num === null || num === undefined || isNaN(Number(num))) return '0';
  return new Intl.NumberFormat('th-TH').format(Number(num));
};

export default function BillPreviewContent({ data }: Props) {
  const { bill, tenant, charges, utilities, summary, meter_photos } = data;

  return (
    <div className="bg-white shadow-lg rounded-lg p-8 print:shadow-none print:p-4">
      {/* ส่วนที่ 1: Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-2">ใบแจ้งค่าใช้จ่ายหอพัก</h1>
        <h2 className="text-xl font-bold mb-4">โรงพยาบาลราชพิพัฒน์</h2>
        <div className="border-t-2 border-gray-300 my-4"></div>
      </div>

      {/* ข้อมูลด้านขวาบน */}
      <div className="text-right mb-6">
        <p className="text-sm">
          <strong>เลขที่บิล</strong> : {bill.bill_number}
        </p>
        <p className="text-sm">
          <strong>วันที่ออกบิล</strong> : {bill.billing_date}
        </p>
        <p className="text-sm">
          <strong>กำหนดชำระ</strong> : {bill.due_date}
        </p>
      </div>

      {/* ส่วนที่ 2: ข้อมูลผู้เช่า */}
      <div className="mb-6">
        <h3 className="text-lg font-bold bg-gray-100 p-2 mb-2">ข้อมูลผู้เข้าพัก</h3>
        <div className="border-t border-gray-300 mb-3"></div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <strong>ชื่อ–สกุล</strong> : {tenant.first_name} {tenant.last_name}
          </div>
          <div></div>
          <div>
            <strong>เลขที่ห้อง</strong> : {tenant.room_number}{' '}
            <span className="ml-4">
              <strong>ชั้น</strong> : {tenant.floor_no}
            </span>
          </div>
          <div></div>
          <div>
            <strong>อาคาร</strong> : {tenant.building_name}
          </div>
          <div></div>
          <div>
            <strong>รอบบิล</strong> : เดือน{tenant.billing_month} {tenant.billing_year}
          </div>
          <div></div>
          <div>
            <strong>สถานะสัญญา</strong> : {tenant.contract_status}
          </div>
        </div>
      </div>

      {/* ส่วนที่ 3: ตารางค่าใช้จ่าย */}
      <div className="mb-6">
        {/* ตารางที่ 1: ค่าดูแล/ค่าคงที่ */}
        <h3 className="text-base font-bold bg-gray-100 p-2 mb-2">
          ตารางที่ 1 : ค่าดูแล / ค่าคงที่
        </h3>
        <table className="w-full border-collapse border border-gray-300 mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">รายการ</th>
              <th className="border border-gray-300 px-4 py-2 text-right">
                จำนวนเงิน (บาท)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-2">
                ค่าดูแลและบำรุงรักษาหอพัก
              </td>
              <td className="border border-gray-300 px-4 py-2 text-right">
                {formatNumber(charges.maintenance_fee)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">ค่าใช้จ่ายคงที่อื่น</td>
              <td className="border border-gray-300 px-4 py-2 text-right">
                {formatNumber(charges.other_fixed)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">ส่วนลด</td>
              <td className="border border-gray-300 px-4 py-2 text-right">
                {formatNumber(charges.discount)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ตารางที่ 2: ค่าสาธารณูปโภค */}
        <h3 className="text-base font-bold bg-gray-100 p-2 mb-2">
          ตารางที่ 2 : ค่าสาธารณูปโภค (อ้างอิงมิเตอร์)
        </h3>

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
            {utilities.electric ? (
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatInteger(utilities.electric.meter_start)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatInteger(utilities.electric.meter_end)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatInteger(utilities.electric.usage)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatNumber(utilities.electric.rate_per_unit)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatNumber(utilities.electric.amount)}
                </td>
              </tr>
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="border border-gray-300 px-4 py-2 text-center text-gray-500"
                >
                  ไม่มีข้อมูล
                </td>
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
            {utilities.water ? (
              <tr>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatInteger(utilities.water.meter_start)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatInteger(utilities.water.meter_end)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatInteger(utilities.water.usage)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatNumber(utilities.water.rate_per_unit)}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-right">
                  {formatNumber(utilities.water.amount)}
                </td>
              </tr>
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="border border-gray-300 px-4 py-2 text-center text-gray-500"
                >
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* หมายเหตุ */}
        <p className="text-xs italic text-gray-600 mb-4">
          📝 หมายเหตุ: ค่าไฟ/น้ำเป็นการใช้งานร่วมของห้อง ระบบออกบิล &quot;ซ้ำต่อผู้เช่า&quot; ตามระเบียบหอพัก
        </p>
      </div>

      {/* ส่วนที่ 4: สรุปยอด */}
      <div className="mb-6">
        <div className="border-t-2 border-gray-300 my-4"></div>
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold">รวมค่าสาธารณูปโภค</span>
          <span className="font-bold">{formatNumber(summary.utility_total)} บาท</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold">ค่าดูแล/บำรุงรักษา</span>
          <span className="font-bold">{formatNumber(summary.maintenance_fee)} บาท</span>
        </div>
        <div className="border-t-2 border-gray-300 my-4"></div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xl font-bold">ยอดชำระทั้งสิ้น</span>
          <span className="text-xl font-bold">
            {formatNumber(summary.total_amount)} บาท
          </span>
        </div>
        <div className="border-t-2 border-gray-300 my-4"></div>
      </div>

      {/* ส่วนที่ 5: สถานะ & ช่องลงนาม */}
      <div className="mb-6">
        <p className="mb-4">
          <strong>สถานะบิล</strong> : {bill.status_text}
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

      {/* ส่วนที่ 7: รูปภาพมิเตอร์ */}
      <div className="mt-8 border-t border-gray-300 pt-6">
        <div className="grid grid-cols-2 gap-8">
          {/* รูปภาพมิเตอร์ไฟฟ้า */}
          <div className="border-2 border-red-500 rounded-lg p-3 text-center">
            <p className="font-bold text-sm mb-3 text-red-600">picture มิเตอร์ไฟ</p>
            {meter_photos.electric ? (
              <div className="flex justify-center items-center min-h-[200px]">
                <img
                  src={meter_photos.electric.photo_url}
                  alt="รูปภาพมิเตอร์ไฟฟ้า"
                  className="max-w-full h-auto max-h-[300px] object-contain rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) {
                      const errorMsg = document.createElement('p');
                      errorMsg.className = 'text-red-500 text-sm';
                      errorMsg.textContent = 'ไม่พบรูปภาพ';
                      parent.appendChild(errorMsg);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="py-12 text-gray-400">
                <p className="text-sm">ไม่มีรูปภาพ</p>
              </div>
            )}
          </div>

          {/* รูปภาพมิเตอร์น้ำ */}
          <div className="border-2 border-red-500 rounded-lg p-3 text-center">
            <p className="font-bold text-sm mb-3 text-red-600">picture มิเตอร์น้ำ</p>
            {meter_photos.water ? (
              <div className="flex justify-center items-center min-h-[200px]">
                <img
                  src={meter_photos.water.photo_url}
                  alt="รูปภาพมิเตอร์น้ำ"
                  className="max-w-full h-auto max-h-[300px] object-contain rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) {
                      const errorMsg = document.createElement('p');
                      errorMsg.className = 'text-red-500 text-sm';
                      errorMsg.textContent = 'ไม่พบรูปภาพ';
                      parent.appendChild(errorMsg);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="py-12 text-gray-400">
                <p className="text-sm">ไม่มีรูปภาพ</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

