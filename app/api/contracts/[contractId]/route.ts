// app/api/contracts/[contractId]/route.ts
// API สำหรับจัดการ contract เดียว (end contract, update)
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { updateTenantStatusByStartDate } from '@/lib/db-helpers';
import { requireAppRoles } from '@/lib/auth/middleware';
import {
  ADMIN_BUILDING_DATA_ACCESS_ROLES,
  getAdminBuildingScopeFromAppRoles,
  isBuildingIdInScope,
} from '@/lib/auth/building-scope';

type Params = {
  params: {
    contractId: string;
  };
};

// PUT /api/contracts/[contractId] - อัปเดต contract (เช่น end contract, start_date)
// body: { end_date, status, start_date }
export async function PUT(req: Request, { params }: Params) {
  try {
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const contractId = Number(params.contractId);
    const body = await req.json();
    const { end_date, status, start_date } = body;

    if (isNaN(contractId)) {
      return NextResponse.json(
        { error: 'Invalid contract ID' },
        { status: 400 }
      );
    }

    // ตรวจสอบว่า contract มีอยู่จริงและดึง tenant_id, start_date
    const existingContract = await query<{
      contract_id: number;
      status: string;
      tenant_id: number;
      start_date: string | Date | null;
      building_id: number;
    }>(
      `SELECT c.contract_id, c.status, c.tenant_id, c.start_date, r.building_id
       FROM contracts c
       JOIN rooms r ON c.room_id = r.room_id
       WHERE c.contract_id = ?`,
      [contractId]
    );

    if (!existingContract || existingContract.length === 0) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (!isBuildingIdInScope(existingContract[0].building_id, scope)) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์จัดการสัญญาของอาคารนี้' },
        { status: 403 },
      );
    }

    const tenantId = existingContract[0].tenant_id;
    const currentStartDate = existingContract[0].start_date;

    // อัปเดต contract
    const updates: string[] = [];
    const values: any[] = [];

    if (start_date !== undefined) {
      updates.push('start_date = ?');
      values.push(start_date || null);
    }

    if (end_date !== undefined) {
      updates.push('end_date = ?');
      values.push(end_date || null);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    values.push(contractId);

    await query(
      `UPDATE contracts SET ${updates.join(', ')} WHERE contract_id = ?`,
      values
    );

    // อัปเดต tenant status ตาม start_date (ถ้ามีการอัปเดต start_date)
    if (start_date !== undefined && tenantId) {
      await updateTenantStatusByStartDate(tenantId, start_date);
    } else if (start_date === undefined && currentStartDate && tenantId) {
      // ถ้าไม่ได้อัปเดต start_date แต่มี start_date อยู่แล้ว ให้ตรวจสอบอีกครั้ง
      await updateTenantStatusByStartDate(tenantId, currentStartDate);
    }

    // ถ้า contract ถูก end (status = 'ended') ให้อัปเดต tenant status เป็น 'inactive'
    if (status === 'ended' && tenantId) {
      try {
        // ตรวจสอบว่าผู้เช่ายังมี contract active อื่นๆ อยู่หรือไม่
        const activeContracts = await query<{ count: number }>(
          `SELECT COUNT(*) AS count 
           FROM contracts 
           WHERE tenant_id = ? AND status = 'active' AND contract_id != ?`,
          [tenantId, contractId]
        );

        // ถ้าไม่มี contract active อื่นๆ แล้ว ให้อัปเดต tenant status เป็น 'inactive'
        if (activeContracts[0]?.count === 0) {
          await query(
            `UPDATE tenants SET status = 'inactive' WHERE tenant_id = ?`,
            [tenantId]
          );
        }
      } catch (error: any) {
        // ถ้าไม่มีคอลัมน์ status ใน tenants หรือ error อื่นๆ ให้ข้าม
        console.warn('Cannot update tenant status:', error.message);
      }
    }

    // ดึงข้อมูล contract ที่อัปเดตแล้ว
    const updatedContract = await query(
      `
      SELECT 
        c.contract_id,
        c.tenant_id,
        c.room_id,
        c.start_date,
        c.end_date,
        c.status,
        t.first_name_th,
        t.last_name_th,
        r.room_number,
        b.name_th AS building_name
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings b ON r.building_id = b.building_id
      WHERE c.contract_id = ?
      `,
      [contractId]
    );

    return NextResponse.json(updatedContract[0]);
  } catch (error: any) {
    console.error('Error updating contract:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts/[contractId] - Soft delete (ไม่แนะนำ แต่รองรับ)
export async function DELETE(req: Request, { params }: Params) {
  try {
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const contractId = Number(params.contractId);

    if (isNaN(contractId)) {
      return NextResponse.json(
        { error: 'Invalid contract ID' },
        { status: 400 }
      );
    }

    const row = await query<{ building_id: number }>(
      `SELECT r.building_id FROM contracts c
       JOIN rooms r ON c.room_id = r.room_id
       WHERE c.contract_id = ?`,
      [contractId],
    );
    if (!row || row.length === 0) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    if (!isBuildingIdInScope(row[0].building_id, scope)) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์จัดการสัญญาของอาคารนี้' },
        { status: 403 },
      );
    }

    // End contract แทนการลบ
    await query(
      `UPDATE contracts SET status = 'ended', end_date = CURDATE() WHERE contract_id = ?`,
      [contractId]
    );

    return NextResponse.json({ message: 'Contract ended successfully' });
  } catch (error: any) {
    console.error('Error ending contract:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to end contract' },
      { status: 500 }
    );
  }
}
