import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { getMonthNameThai } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

// GET /api/my/bills/[billId] - รายละเอียดบิลของผู้ใช้ปัจจุบัน (ตรวจสิทธิ์ระดับแถว)
export async function GET(
  _req: Request,
  { params }: { params: { billId: string } },
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

    // หา auth_user_id
    const authUserRows = await query<{ auth_user_id: number }>(
      `SELECT auth_user_id
       FROM auth_users
       WHERE ad_username = ?
       LIMIT 1`,
      [auth.user.username],
    );
    if (!authUserRows.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const authUserId = authUserRows[0].auth_user_id;

    // หา tenant_id ของ user
    const linkRows = await query<{ tenant_id: number }>(
      `SELECT tenant_id
       FROM tenant_auth_users
       WHERE auth_user_id = ? AND is_primary = 1
       LIMIT 1`,
      [authUserId],
    );
    if (!linkRows.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const tenantId = linkRows[0].tenant_id;

    // ดึงข้อมูลบิล โดยบังคับว่า contract ต้องเป็นของ tenant นี้
    const sql = `
      SELECT 
        b.bill_id,
        b.tenant_id,
        b.room_id,
        b.contract_id,
        b.cycle_id,
        1000 AS maintenance_fee,
        b.status,
        cy.billing_year,
        cy.billing_month,
        cy.start_date AS billing_date,
        cy.end_date,
        cy.due_date,
        r.room_number,
        r.floor_no,
        bu.building_id,
        bu.name_th AS building_name,
        t.tenant_id AS t_tenant_id,
        t.first_name_th AS first_name,
        t.last_name_th AS last_name,
        t.email,
        t.phone,
        c.contract_id AS c_contract_id,
        c.start_date AS move_in_date,
        c.end_date AS move_out_date,
        c.status AS contract_status,
        (SELECT COUNT(*)
         FROM contracts c2
         WHERE c2.room_id = r.room_id AND c2.status = 'active') AS tenant_count
      FROM bills b
      JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
      JOIN contracts c ON b.contract_id = c.contract_id
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings bu ON r.building_id = bu.building_id
      WHERE b.bill_id = ?
        AND c.tenant_id = ?
      LIMIT 1
    `;

    const bills = await query<any>(sql, [billId, tenantId]);
    if (!bills || bills.length === 0) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลบิล' }, { status: 404 });
    }

    const bill = bills[0];

    // ดึง utility readings
    const utilityReadings = await query(
      `SELECT 
        bur.reading_id,
        bur.room_id,
        bur.cycle_id,
        bur.utility_type_id,
        bur.meter_start,
        bur.meter_end,
        ut.code AS utility_code,
        ut.name_th AS utility_name,
        COALESCE(
          (SELECT rate_per_unit 
           FROM utility_rates 
           WHERE utility_type_id = bur.utility_type_id
             AND effective_date <= COALESCE(bc.end_date, CURDATE())
           ORDER BY effective_date DESC 
           LIMIT 1),
          0
        ) AS rate_per_unit
       FROM bill_utility_readings bur
       JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
       LEFT JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
       WHERE bur.cycle_id = ? AND bur.room_id = ?
       ORDER BY bur.utility_type_id`,
      [bill.cycle_id, bill.room_id],
    );

    const electricReading = (utilityReadings as any[]).find(
      (ur: any) => ur.utility_code === 'electric',
    );
    const waterReading = (utilityReadings as any[]).find(
      (ur: any) => ur.utility_code === 'water',
    );

    // รูปภาพมิเตอร์
    let meterPhotos: any[] = [];
    try {
      meterPhotos = await query(
        `SELECT 
          photo_id,
          utility_type,
          photo_path,
          meter_value,
          reading_date
        FROM meter_photos
        WHERE room_id = ? 
          AND billing_year = ? 
          AND billing_month = ?
        ORDER BY utility_type, reading_date DESC`,
        [bill.room_id, bill.billing_year, bill.billing_month],
      );
    } catch (error: any) {
      console.warn('Error fetching meter photos for my bill:', error.message);
    }

    const electricPhoto = meterPhotos.find((p: any) => p.utility_type === 'electric');
    const waterPhoto = meterPhotos.find((p: any) => p.utility_type === 'water');

    const adYear = bill.billing_year - 543;
    const billNumber = `B-${adYear}-${String(bill.billing_month).padStart(
      2,
      '0',
    )}-${String(bill.bill_id).padStart(5, '0')}`;

    const formatDateThai = (dateStr: string | null): string => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear() + 543;
      const monthNames = [
        'ม.ค.',
        'ก.พ.',
        'มี.ค.',
        'เม.ย.',
        'พ.ค.',
        'มิ.ย.',
        'ก.ค.',
        'ส.ค.',
        'ก.ย.',
        'ต.ค.',
        'พ.ย.',
        'ธ.ค.',
      ];
      return `${day} ${monthNames[month - 1]} ${year}`;
    };

    const statusText =
      bill.status === 'paid'
        ? 'ชำระแล้ว'
        : bill.status === 'sent'
          ? 'ส่งแล้ว'
          : 'รอชำระ';

    const tenantCount = Math.max(bill.tenant_count || 1, 1);

    const buildElectric = () => {
      if (!electricReading) return null;
      const start = Number(electricReading.meter_start || 0);
      const end = Number(electricReading.meter_end || 0);
      const MOD = 10000;
      const usage = end >= start ? end - start : MOD - start + end;
      const rate = Number(electricReading.rate_per_unit || 0);
      const totalAmountForRoom = usage * rate;
      const amount = totalAmountForRoom / tenantCount;
      return {
        meter_start: electricReading.meter_start || 0,
        meter_end: electricReading.meter_end || 0,
        usage,
        rate_per_unit: rate,
        amount,
      };
    };

    const buildWater = () => {
      if (!waterReading) return null;
      const usage =
        (waterReading.meter_end || 0) - (waterReading.meter_start || 0);
      const rate = Number(waterReading.rate_per_unit || 0);
      const totalAmountForRoom = usage * rate;
      const amount = totalAmountForRoom / tenantCount;
      return {
        meter_start: waterReading.meter_start || 0,
        meter_end: waterReading.meter_end || 0,
        usage,
        rate_per_unit: rate,
        amount,
      };
    };

    const electric = buildElectric();
    const water = buildWater();

    const calcUtilityTotalPerPerson = () => {
      let electricAmount = 0;
      let waterAmount = 0;
      if (electricReading) {
        const start = Number(electricReading.meter_start || 0);
        const end = Number(electricReading.meter_end || 0);
        const MOD = 10000;
        const usage = end >= start ? end - start : MOD - start + end;
        const totalAmountForRoom =
          usage * Number(electricReading.rate_per_unit || 0);
        electricAmount = totalAmountForRoom / tenantCount;
      }
      if (waterReading) {
        const usage =
          (waterReading.meter_end || 0) - (waterReading.meter_start || 0);
        const totalAmountForRoom =
          usage * Number(waterReading.rate_per_unit || 0);
        waterAmount = totalAmountForRoom / tenantCount;
      }
      return electricAmount + waterAmount;
    };

    const utilityTotalPerPerson = calcUtilityTotalPerPerson();
    const maintenanceFee = Number(bill.maintenance_fee || 0);
    const totalAmountPerPerson = utilityTotalPerPerson + maintenanceFee;

    return NextResponse.json({
      bill: {
        bill_id: bill.bill_id,
        bill_number: billNumber,
        billing_date: formatDateThai(bill.billing_date),
        due_date: formatDateThai(bill.due_date),
        status: bill.status,
        status_text: statusText,
      },
      tenant: {
        first_name: bill.first_name || '',
        last_name: bill.last_name || '',
        room_number: bill.room_number || '-',
        floor_no: bill.floor_no || '-',
        building_name: bill.building_name || '-',
        billing_month: getMonthNameThai(bill.billing_month),
        billing_year: bill.billing_year,
        contract_status:
          bill.contract_status === 'active'
            ? 'Active'
            : bill.contract_status || '-',
        tenant_count: tenantCount,
      },
      charges: {
        maintenance_fee: maintenanceFee,
        other_fixed: 0,
        discount: 0,
      },
      utilities: {
        electric,
        water,
      },
      summary: {
        utility_total: utilityTotalPerPerson,
        maintenance_fee: maintenanceFee,
        total_amount: totalAmountPerPerson,
      },
      meter_photos: {
        electric: electricPhoto
          ? {
              photo_id: electricPhoto.photo_id,
              photo_url: `/api/meter-photos/${electricPhoto.photo_id}/download`,
            }
          : null,
        water: waterPhoto
          ? {
              photo_id: waterPhoto.photo_id,
              photo_url: `/api/meter-photos/${waterPhoto.photo_id}/download`,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching my individual bill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch bill' },
      { status: 500 },
    );
  }
}

