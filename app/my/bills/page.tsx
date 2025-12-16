// app/my/bills/page.tsx - Tenant can see own bills
import Link from 'next/link';
import { getBillsByMonth } from '@/lib/repositories/bills';

// Note: In a real app, you would get tenant_id and room_id from session/auth
async function getTenantBills(roomId: number = 1) {
  const now = new Date();
  const buddhistYear = now.getFullYear() + 543;
  const month = now.getMonth() + 1;

  return await getBillsByMonth(buddhistYear, month, roomId);
}

export default async function TenantBillsPage() {
  // TODO: Get room_id from session/auth based on tenant
  const bills = await getTenantBills(1);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">บิลค่าใช้จ่ายของฉัน</h1>

      {bills.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-600">ยังไม่มีบิลค่าใช้จ่าย</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bills.map((bill) => (
            <div
              key={bill.bill_id}
              className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-800">
                    บิลประจำเดือน {bill.billing_month}/{bill.billing_year}
                  </h3>
                  <p className="text-sm text-gray-500">
                    วันที่ออกบิล: {new Date(bill.billing_date).toLocaleDateString('th-TH')}
                  </p>
                  <p className="text-sm text-gray-500">
                    ครบกำหนดชำระ: {new Date(bill.due_date).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {bill.total_amount.toLocaleString('th-TH')} บาท
                  </p>
                  <span
                    className={`mt-2 px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      bill.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : bill.status === 'sent'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {bill.status === 'paid'
                      ? 'ชำระแล้ว'
                      : bill.status === 'sent'
                      ? 'รอชำระ'
                      : 'ร่าง'}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ค่าบำรุงรักษา:</span>
                  <span className="font-medium">
                    {bill.maintenance_fee.toLocaleString('th-TH')} บาท
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <Link
                  href={`/my/bills/${bill.bill_id}`}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  ดูรายละเอียด →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

