import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { getMyBillsList } from '@/lib/my-bills-list';
import { getMonthNameThai } from '@/lib/date-utils';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

// GET /api/my/bills/export-list?year=2569&month=3 หรือไม่ส่ง = ส่งออกรายการบิลทุกเดือน
// ส่งออกรายการบิลของผู้เช่าเป็น Excel (ตรวจสิทธิ์ระดับแถว)
export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.authorized || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const filterByMonth = Boolean(year && month);

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
    const list = filterByMonth
      ? await getMyBillsList(tenantId, Number(year), Number(month))
      : await getMyBillsList(tenantId);

    if (list.length === 0) {
      return NextResponse.json(
        {
          error: filterByMonth
            ? 'ไม่มีรายการบิลสำหรับรอบบิลที่เลือก'
            : 'ยังไม่มีรายการบิล',
        },
        { status: 404 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('รายการบิล', {
      properties: { tabColor: { argb: 'FF4472C4' } },
    });

    sheet.columns = [
      { width: 8 },
      { width: 14 },
      { width: 18 },
      { width: 22 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
    ];

    const headerRow = sheet.addRow([
      'No.',
      'เลขที่ห้อง',
      'อาคาร',
      'ผู้เข้าพัก',
      'รอบบิล',
      'ยอดชำระทั้งสิ้น (บาท)',
      'สถานะ',
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    list.forEach((row, index) => {
      const statusText =
        row.status === 'paid'
          ? 'ชำระแล้ว'
          : row.status === 'sent'
            ? 'ส่งแล้ว'
            : 'รอชำระ';
      sheet.addRow([
        index + 1,
        row.room_number,
        row.building_name,
        row.tenant_name,
        `${getMonthNameThai(row.billing_month)} ${row.billing_year}`,
        row.total_amount,
        statusText,
      ]);
    });

    const numFmt = '#,##0.00';
    list.forEach((_, i) => {
      const row = sheet.getRow(i + 2);
      row.getCell(6).numFmt = numFmt;
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const buffer =
      Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer as ArrayBuffer);

    const filename = filterByMonth
      ? `รายการบิล_${getMonthNameThai(Number(month))}_${Number(year)}.xlsx`
      : 'รายการบิล_ทุกเดือน.xlsx';

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting my bills list:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export list' },
      { status: 500 }
    );
  }
}
