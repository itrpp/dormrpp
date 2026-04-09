// app/api/bills/[billId]/route.ts
import { NextResponse } from 'next/server';
import { getBillById, updateBill, deleteBill } from '@/lib/repositories/bills';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import { query } from '@/lib/db';
import { getAdminBuildingScopeFromAppRoles, isBuildingIdInScope } from '@/lib/auth/building-scope';

const BILL_ACCESS_ROLES: AppRoleCode[] = [
  'ADMIN',
  'FINANCE',
  'FINANCE-R',
  'FINANCE-M',
  'SUPERUSER_RP',
  'SUPERUSER_MED',
];
const BILL_MANAGE_ROLES: AppRoleCode[] = ['ADMIN', 'FINANCE', 'FINANCE-R', 'FINANCE-M'];

async function getBillBuildingId(billId: number): Promise<number | null> {
  const rows = await query<{ building_id: number }>(
    `
      SELECT r.building_id
      FROM bills b
      JOIN rooms r ON r.room_id = b.room_id
      WHERE b.bill_id = ?
      LIMIT 1
    `,
    [billId],
  );
  return rows[0]?.building_id ?? null;
}

// GET /api/bills/[billId]
export async function GET(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const authResult = await requireAppRoles(BILL_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const billId = Number(params.billId);
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);
    const buildingId = await getBillBuildingId(billId);
    if (buildingId == null) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }
    if (!isBuildingIdInScope(buildingId, scope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const bill = await getBillById(billId);

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(bill);
  } catch (error) {
    console.error('Error fetching bill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill' },
      { status: 500 }
    );
  }
}

// PATCH /api/bills/[billId]
export async function PATCH(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const authResult = await requireAppRoles(BILL_MANAGE_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const billId = Number(params.billId);
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);
    const buildingId = await getBillBuildingId(billId);
    if (buildingId == null) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }
    if (!isBuildingIdInScope(buildingId, scope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();

    await updateBill(billId, {
      electric_amount: body.electric_amount !== undefined ? Number(body.electric_amount) : undefined,
      water_amount: body.water_amount !== undefined ? Number(body.water_amount) : undefined,
      subtotal_amount: body.subtotal_amount !== undefined ? Number(body.subtotal_amount) : undefined,
      total_amount: body.total_amount !== undefined ? Number(body.total_amount) : undefined,
      status: body.status,
    });

    return NextResponse.json({ message: 'Bill updated' });
  } catch (error) {
    console.error('Error updating bill:', error);
    return NextResponse.json(
      { error: 'Failed to update bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/bills/[billId]
export async function DELETE(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const authResult = await requireAppRoles(BILL_MANAGE_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const billId = Number(params.billId);
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);
    const buildingId = await getBillBuildingId(billId);
    if (buildingId == null) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }
    if (!isBuildingIdInScope(buildingId, scope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await deleteBill(billId);

    return NextResponse.json({ message: 'Bill deleted' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    return NextResponse.json(
      { error: 'Failed to delete bill' },
      { status: 500 }
    );
  }
}

