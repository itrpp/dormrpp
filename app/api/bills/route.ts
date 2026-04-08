// app/api/bills/route.ts
import { NextResponse } from 'next/server';
import { getBillsByMonth, createBill } from '@/lib/repositories/bills';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import {
  getAdminBuildingScopeFromAppRoles,
  isBuildingIdInScope,
  resolveAllowedBuildingIdsForListQuery,
} from '@/lib/auth/building-scope';

// สิทธิ์ที่อนุญาตให้เข้าถึงข้อมูลบิล (ระดับระบบ)
const BILL_ACCESS_ROLES: AppRoleCode[] = [
  'ADMIN',        // ผู้ดูแลระบบ
  'FINANCE',      // การเงิน
  'SUPERUSER_RP', // Superuser หอพักรวงผึ้ง
  'SUPERUSER_MED' // Superuser หอพักแพทยศาสตร์
];
const BILL_MANAGE_ROLES: AppRoleCode[] = ['ADMIN', 'FINANCE'];

// GET /api/bills?year=2568&month=10&room_id=1
export async function GET(req: Request) {
  try {
    // ตรวจสอบสิทธิ์ก่อน (ต้องมีอย่างน้อยหนึ่ง role ใน BILL_ACCESS_ROLES)
    const authResult = await requireAppRoles(BILL_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const roomId = searchParams.get('room_id');

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);
    const allowedIds = resolveAllowedBuildingIdsForListQuery(scope, null);
    const allowedBuildingIds =
      allowedIds === null ? undefined : allowedIds;
    if (allowedBuildingIds && allowedBuildingIds.length === 0) {
      return NextResponse.json([]);
    }

    const bills = await getBillsByMonth(
      Number(year),
      Number(month),
      roomId ? Number(roomId) : undefined,
      allowedBuildingIds,
    );

    return NextResponse.json(bills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

// POST /api/bills
// ⚠️ หมายเหตุ: ควรใช้ /api/billing/run สำหรับออกบิลทั้งเดือนแทน
// endpoint นี้ยังคงไว้สำหรับกรณีพิเศษที่ต้องสร้างบิลแบบ manual
// body: { contract_id, cycle_id, maintenance_fee, electric_amount, water_amount, status }
export async function POST(req: Request) {
  const authResult = await requireAppRoles(BILL_MANAGE_ROLES);
  if (!authResult.authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

  const { pool } = await import('@/lib/db');
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const body = await req.json();
    const {
      contract_id,
      cycle_id,
      exempt_maintenance_fee,
      status,
    } = body;

    if (!contract_id || !cycle_id) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'contract_id and cycle_id are required' },
        { status: 400 }
      );
    }

    // ดึงข้อมูล contract เพื่อหา tenant_id และ room_id
    const { query } = await import('@/lib/db');
    const contract = await query<{
      tenant_id: number;
      room_id: number;
      building_id: number;
    }>(
      `SELECT c.tenant_id, c.room_id, r.building_id
       FROM contracts c
       JOIN rooms r ON c.room_id = r.room_id
       WHERE c.contract_id = ?`,
      [contract_id]
    );

    if (!contract || contract.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const { tenant_id, room_id, building_id } = contract[0];
    if (!isBuildingIdInScope(building_id, scope)) {
      await connection.rollback();
      connection.release();
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์จัดการบิลของอาคารนี้' },
        { status: 403 },
      );
    }

    // สร้างตารางสำหรับเก็บการ “ยกเว้นค่าบำรุงรักษา” รายห้อง-รายรอบบิล (ถ้ายังไม่มี)
    await connection.query(
      `
      CREATE TABLE IF NOT EXISTS bill_fee_exemptions (
        exemption_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        cycle_id INT NOT NULL,
        room_id INT NOT NULL,
        fee_code VARCHAR(32) NOT NULL,
        is_exempt TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (exemption_id),
        UNIQUE KEY uniq_cycle_room_fee (cycle_id, room_id, fee_code),
        KEY idx_cycle_fee (cycle_id, fee_code),
        KEY idx_room_fee (room_id, fee_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `,
    );

    // บันทึก/ยกเลิก “ยกเว้นค่าบำรุงรักษา” ตามห้อง (มีผลกับทุกบิลในห้องนั้นของรอบบิลเดียวกัน)
    if (exempt_maintenance_fee === true) {
      await connection.query(
        `
        INSERT INTO bill_fee_exemptions (cycle_id, room_id, fee_code, is_exempt)
        VALUES (?, ?, 'maintenance', 1)
        ON DUPLICATE KEY UPDATE is_exempt = 1, updated_at = CURRENT_TIMESTAMP
        `,
        [Number(cycle_id), Number(room_id)],
      );
    } else if (exempt_maintenance_fee === false) {
      await connection.query(
        `
        DELETE FROM bill_fee_exemptions
        WHERE cycle_id = ? AND room_id = ? AND fee_code = 'maintenance'
        `,
        [Number(cycle_id), Number(room_id)],
      );
    }

    // สร้างบิลแบบ minimal ตาม schema ตาราง `bills` ในฐานข้อมูล
    const billId = await createBill({
      tenant_id: Number(tenant_id),
      room_id: Number(room_id),
      contract_id: Number(contract_id),
      cycle_id: Number(cycle_id),
      status: status || 'draft',
    }, connection);

    await connection.commit();
    connection.release();

    return NextResponse.json({ message: 'Bill created', bill_id: billId }, { status: 201 });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error creating bill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create bill' },
      { status: 500 }
    );
  }
}

