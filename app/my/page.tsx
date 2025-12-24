// app/my/page.tsx - Tenant home (current room)
import Link from 'next/link';
import { query } from '@/lib/db';

// Note: In a real app, you would get tenant_id from session/auth
// For now, this is a placeholder that shows the structure
async function getTenantRoom(tenantId: number = 1) {
  try {
    // ใช้ contracts table เป็นตัวเชื่อมระหว่าง tenants และ rooms
    // ใช้ NULL AS id_card เพราะ column นี้อาจไม่มีในตาราง
    const tenant = await query(
      `
      SELECT t.tenant_id, t.first_name_th AS first_name, t.last_name_th AS last_name, 
             t.email, t.phone, NULL AS id_card,
             c.start_date AS move_in_date,
             NULL AS move_out_date,
             r.room_id, r.room_number, r.floor_no,
             b.name_th AS building_name,
             c.status
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings b ON r.building_id = b.building_id
      WHERE c.tenant_id = ? AND c.status = 'active'
      LIMIT 1
    `,
      [tenantId]
    );
    return tenant[0] || null;
  } catch (error: any) {
    const errorMsg = error.message || '';
    
    // ถ้าไม่มี contracts table หรือ columns อื่นๆ ให้ query แค่ tenants
    if (errorMsg.includes("Unknown column") || errorMsg.includes("doesn't exist")) {
      try {
        const tenant = await query(
          `
          SELECT t.tenant_id, 
                 COALESCE(t.first_name_th, t.first_name) AS first_name, 
                 COALESCE(t.last_name_th, t.last_name) AS last_name,
                 t.email, t.phone, NULL AS id_card,
                 NULL AS move_in_date, NULL AS move_out_date,
                 NULL AS room_id, NULL AS room_number, NULL AS floor_no,
                 NULL AS building_name, NULL AS status
          FROM tenants t
          WHERE t.tenant_id = ?
        `,
          [tenantId]
        );
        return tenant[0] || null;
      } catch (innerError: any) {
        throw error;
      }
    }
    
    throw error;
  }
}

export default async function TenantHomePage() {
  // TODO: Get tenant_id from session/auth
  let tenant;
  try {
    tenant = await getTenantRoom(1);
  } catch (error: any) {
    // ถ้าเกิด error (เช่น Too many connections) ให้แสดงหน้า error
    console.error('Error loading tenant data:', error);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            เกิดข้อผิดพลาดในการโหลดข้อมูล
          </h1>
          <p className="text-gray-600 mb-4">
            {error.message?.includes('Too many connections') 
              ? 'ระบบกำลังใช้งานหนัก กรุณาลองใหม่อีกครั้งในภายหลัง'
              : 'ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้'}
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/my/announcements"
              className="text-blue-600 hover:text-blue-800 px-4 py-2 border border-blue-600 rounded-lg"
            >
              ดูประกาศ
            </Link>
            <Link
              href="/my"
              className="text-blue-600 hover:text-blue-800 px-4 py-2 border border-blue-600 rounded-lg"
            >
              ลองใหม่
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            ไม่พบข้อมูลผู้เช่า
          </h1>
          <Link
            href="/my/announcements"
            className="text-blue-600 hover:text-blue-800"
          >
            ดูประกาศ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          สวัสดี, {tenant.first_name} {tenant.last_name}
        </h1>
        <p className="text-gray-600">
          ข้อมูลห้องพักของคุณ - หอพักรวงผึ้ง
        </p>
        <p className="text-sm text-gray-500 mt-1">
          โรงพยาบาลราชพิพัฒน์
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">ข้อมูลห้องพัก</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">อาคาร</p>
            <p className="text-lg font-medium">{tenant.building_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">ห้อง</p>
            <p className="text-lg font-medium">{tenant.room_number}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">ชั้น</p>
            <p className="text-lg font-medium">{tenant.floor_no ?? '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">วันที่เข้าพัก</p>
            <p className="text-lg font-medium">
              {tenant.move_in_date
                ? new Date(tenant.move_in_date).toLocaleDateString('th-TH')
                : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/my/bills"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2 text-gray-800">บิลค่าใช้จ่าย</h3>
          <p className="text-gray-600">ดูและชำระบิลค่าใช้จ่ายของคุณ</p>
        </Link>
        <Link
          href="/my/announcements"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2 text-gray-800">📢 ประกาศ</h3>
          <p className="text-gray-600">ดูประกาศล่าสุดจากหอพัก</p>
        </Link>
        <a
          href="https://services.rpphosp.go.th/auth"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2 text-gray-800">การซ่อมบำรุง</h3>
          <p className="text-gray-600">สร้างและติดตามคำขอซ่อมบำรุง</p>
        </a>
      </div>
    </div>
  );
}

