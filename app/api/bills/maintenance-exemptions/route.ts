import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import {
  getAdminBuildingScopeFromAppRoles,
  isBuildingIdInScope,
} from '@/lib/auth/building-scope';

export const dynamic = 'force-dynamic';
const BILL_MANAGE_ROLES: AppRoleCode[] = ['ADMIN', 'FINANCE', 'FINANCE-R', 'FINANCE-M'];

async function ensureBillFeeExemptionsTable() {
  await query(
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
}

// POST /api/bills/maintenance-exemptions
// body: { cycle_id: number, room_id: number, is_exempt: boolean }
export async function POST(req: Request) {
  try {
    const authResult = await requireAppRoles(BILL_MANAGE_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const body = await req.json();
    const cycleId = Number(body?.cycle_id);
    const roomId = Number(body?.room_id);
    const isExempt = Boolean(body?.is_exempt);

    if (!Number.isFinite(cycleId) || !Number.isFinite(roomId)) {
      return NextResponse.json(
        { error: 'cycle_id และ room_id ต้องเป็นตัวเลข' },
        { status: 400 },
      );
    }

    const room = await query<{ building_id: number }>(
      `SELECT building_id FROM rooms WHERE room_id = ? LIMIT 1`,
      [roomId],
    );
    if (!room || room.length === 0) {
      return NextResponse.json({ error: 'ไม่พบห้องที่ระบุ' }, { status: 404 });
    }
    if (!isBuildingIdInScope(room[0]!.building_id, scope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureBillFeeExemptionsTable();

    if (isExempt) {
      await query(
        `
        INSERT INTO bill_fee_exemptions (cycle_id, room_id, fee_code, is_exempt)
        VALUES (?, ?, 'maintenance', 1)
        ON DUPLICATE KEY UPDATE is_exempt = 1, updated_at = CURRENT_TIMESTAMP
        `,
        [cycleId, roomId],
      );
    } else {
      await query(
        `
        DELETE FROM bill_fee_exemptions
        WHERE cycle_id = ? AND room_id = ? AND fee_code = 'maintenance'
        `,
        [cycleId, roomId],
      );
    }

    return NextResponse.json({
      message: isExempt
        ? 'ตั้งค่ายกเว้นค่าบำรุงรักษาสำเร็จ'
        : 'ยกเลิกการยกเว้นค่าบำรุงรักษาสำเร็จ',
      cycle_id: cycleId,
      room_id: roomId,
      is_exempt: isExempt,
    });
  } catch (error: any) {
    console.error('Error updating maintenance exemption:', error);
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถอัปเดตการยกเว้นค่าบำรุงรักษาได้' },
      { status: 500 },
    );
  }
}
