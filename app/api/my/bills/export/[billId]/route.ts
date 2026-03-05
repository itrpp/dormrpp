import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

// GET /api/my/bills/export/[billId] - Export รายละเอียดบิลเป็น Excel (เฉพาะบิลของตัวเอง)
export async function GET(
  _req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const auth = await requireAuth();
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const billId = parseInt(params.billId, 10);
    if (Number.isNaN(billId)) {
      return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
    }

    const authUserRows = await query<{ auth_user_id: number }>(
      `SELECT auth_user_id FROM auth_users WHERE ad_username = ? LIMIT 1`,
      [auth.user.username]
    );
    if (!authUserRows.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const linkRows = await query<{ tenant_id: number }>(
      `SELECT tenant_id FROM tenant_auth_users WHERE auth_user_id = ? AND is_primary = 1 LIMIT 1`,
      [authUserRows[0].auth_user_id]
    );
    if (!linkRows.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = linkRows[0].tenant_id;

    const allowed = await query<{ bill_id: number }>(
      `SELECT b.bill_id
       FROM bills b
       JOIN contracts c ON b.contract_id = c.contract_id
       WHERE b.bill_id = ? AND c.tenant_id = ?
       LIMIT 1`,
      [billId, tenantId]
    );
    if (!allowed.length) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลบิล' }, { status: 404 });
    }

    const { GET: getIndividualExport } = await import(
      '@/app/api/bills/export/individual/[billId]/route'
    );
    return getIndividualExport(_req, { params: { billId: params.billId } });
  } catch (error: any) {
    console.error('Error exporting my bill:', error);
    return NextResponse.json(
      { error: error.message || 'ส่งออกรายละเอียดบิลไม่สำเร็จ' },
      { status: 500 }
    );
  }
}
