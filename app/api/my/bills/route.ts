import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

// GET /api/my/bills?year=2569&month=3 หรือไม่ส่ง year/month = บิลทุกเดือน
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

    // หา auth_user_id จาก auth_users โดยใช้ ad_username = session.username
    const authUserRows = await query<{
      auth_user_id: number;
    }>(
      `SELECT auth_user_id
       FROM auth_users
       WHERE ad_username = ?
       LIMIT 1`,
      [auth.user.username],
    );

    if (!authUserRows.length) {
      // ยังไม่มี mapping ใด ๆ ให้ส่งค่าว่าง
      return NextResponse.json([]);
    }

    const authUserId = authUserRows[0].auth_user_id;

    // หา tenant_id ที่ผูกกับ auth_user_id นี้
    const linkRows = await query<{
      tenant_id: number;
    }>(
      `SELECT tenant_id
       FROM tenant_auth_users
       WHERE auth_user_id = ? AND is_primary = 1
       LIMIT 1`,
      [authUserId],
    );

    if (!linkRows.length) {
      return NextResponse.json([]);
    }

    const tenantId = linkRows[0].tenant_id;

    const sql = filterByMonth
      ? `
      SELECT 
        b.bill_id,
        b.tenant_id,
        b.room_id,
        b.contract_id,
        b.cycle_id,
        b.status,
        cy.billing_year,
        cy.billing_month,
        cy.start_date AS billing_date,
        cy.end_date,
        cy.due_date,
        r.room_number,
        r.floor_no,
        r.room_type_id,
        bu.building_id,
        bu.name_th AS building_name,
        COALESCE(rt.max_occupants, 1) AS max_occupants,
        t.tenant_id AS t_tenant_id,
        t.first_name_th AS first_name,
        t.last_name_th AS last_name,
        t.email,
        t.phone,
        c.contract_id AS c_contract_id,
        c.start_date AS move_in_date,
        c.end_date AS move_out_date,
        c.status AS contract_status
      FROM bills b
      JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
      JOIN contracts c ON b.contract_id = c.contract_id
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings bu ON r.building_id = bu.building_id
      LEFT JOIN room_types rt
        ON rt.id = r.room_type_id
      WHERE cy.billing_year = ?
        AND cy.billing_month = ?
        AND c.tenant_id = ?
      ORDER BY r.room_number, t.tenant_id
    `
      : `
      SELECT 
        b.bill_id,
        b.tenant_id,
        b.room_id,
        b.contract_id,
        b.cycle_id,
        b.status,
        cy.billing_year,
        cy.billing_month,
        cy.start_date AS billing_date,
        cy.end_date,
        cy.due_date,
        r.room_number,
        r.floor_no,
        r.room_type_id,
        bu.building_id,
        bu.name_th AS building_name,
        COALESCE(rt.max_occupants, 1) AS max_occupants,
        t.tenant_id AS t_tenant_id,
        t.first_name_th AS first_name,
        t.last_name_th AS last_name,
        t.email,
        t.phone,
        c.contract_id AS c_contract_id,
        c.start_date AS move_in_date,
        c.end_date AS move_out_date,
        c.status AS contract_status
      FROM bills b
      JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
      JOIN contracts c ON b.contract_id = c.contract_id
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings bu ON r.building_id = bu.building_id
      LEFT JOIN room_types rt
        ON rt.id = r.room_type_id
      WHERE c.tenant_id = ?
      ORDER BY cy.billing_year DESC, cy.billing_month DESC, r.room_number, t.tenant_id
    `;

    let bills: any[] = [];
    try {
      bills = await query<any>(
        sql,
        filterByMonth ? [Number(year), Number(month), tenantId] : [tenantId],
      );
    } catch (error: any) {
      console.error('Error fetching my bills:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to fetch my bills' },
        { status: 500 },
      );
    }

    if (bills.length === 0) {
      return NextResponse.json([]);
    }

    // ดึง utility readings สำหรับห้อง/รอบบิลเดียวกัน (โค้ดเหมือน detailed)
    const cycleIds = [...new Set(bills.map((b: any) => b.cycle_id))];
    const roomIds = [...new Set(bills.map((b: any) => b.room_id))];

    let utilityReadings: any[] = [];

    if (cycleIds.length > 0 && roomIds.length > 0) {
      try {
        utilityReadings = await query(
          `SELECT 
            bur.reading_id,
            bur.room_id,
            bur.cycle_id,
            bur.utility_type_id,
            bur.meter_start,
            bur.meter_end,
            bur.created_at,
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
           WHERE bur.cycle_id IN (${cycleIds.map(() => '?').join(',')})
             AND bur.room_id IN (${roomIds.map(() => '?').join(',')})
           ORDER BY bur.room_id, bur.utility_type_id`,
          [...cycleIds, ...roomIds],
        );
      } catch (error: any) {
        console.warn('Cannot fetch utility readings for my bills:', error.message);
        utilityReadings = [];
      }
    }

    const groupedBills: Record<string, any> = {};

    bills.forEach((bill: any) => {
      if (!bill.bill_id || !bill.t_tenant_id) {
        return;
      }

      const billKey = `${bill.t_tenant_id}_${bill.cycle_id}`;

      if (!groupedBills[billKey]) {
        const roomReadings = utilityReadings.filter(
          (ur: any) => ur.room_id === bill.room_id && ur.cycle_id === bill.cycle_id,
        );

        const roomBills = bills.filter(
          (b: any) => b.room_id === bill.room_id && b.cycle_id === bill.cycle_id,
        );
        const uniqueTenants = new Set(roomBills.map((b: any) => b.t_tenant_id));
        const tenantCount = uniqueTenants.size || 1;

        const calculatedReadings = roomReadings.map((ur: any) => {
          let usage: number;
          if (ur.utility_code === 'electric') {
            const meterStart = Number(ur.meter_start);
            const meterEnd = Number(ur.meter_end);
            const MOD = 10000;
            usage = meterEnd >= meterStart ? meterEnd - meterStart : MOD - meterStart + meterEnd;
          } else {
            usage = ur.meter_end - ur.meter_start;
          }
          const rate = ur.rate_per_unit || 0;
          return {
            reading_id: ur.reading_id,
            utility_type: ur.utility_code,
            utility_name: ur.utility_name,
            meter_start: ur.meter_start,
            meter_end: ur.meter_end,
            usage,
            rate_per_unit: rate,
            created_at: ur.created_at,
          };
        });

        const electricReading = calculatedReadings.find(
          (r: any) => r.utility_type === 'electric',
        );
        const waterReading = calculatedReadings.find(
          (r: any) => r.utility_type === 'water',
        );

        const totalElectricAmountForRoom =
          electricReading && electricReading.usage != null && electricReading.rate_per_unit != null
            ? Number(electricReading.usage) * Number(electricReading.rate_per_unit)
            : 0;

        const totalWaterAmountForRoom =
          waterReading && waterReading.usage != null && waterReading.rate_per_unit != null
            ? Number(waterReading.usage) * Number(waterReading.rate_per_unit)
            : 0;

        const actualTenantCount = Math.max(tenantCount, 1);
        const calculatedElectricAmount = totalElectricAmountForRoom / actualTenantCount;
        const calculatedWaterAmount = totalWaterAmountForRoom / actualTenantCount;
        const baseMaintenanceFee = Number(bill.building_id) === 1 ? 1000 : 6000;
        const maxOccupants = Math.max(Number(bill.max_occupants || 1) || 1, 1);
        const maintenanceFee = baseMaintenanceFee / maxOccupants;
        const calculatedTotalAmount =
          calculatedElectricAmount + calculatedWaterAmount + maintenanceFee;

        groupedBills[billKey] = {
          bill_id: bill.bill_id,
          tenant_id: bill.t_tenant_id,
          room_id: bill.room_id,
          contract_id: bill.c_contract_id,
          cycle_id: bill.cycle_id,
          room_number: bill.room_number || '',
          building_name: bill.building_name || '',
          billing_year: bill.billing_year,
          billing_month: bill.billing_month,
          billing_date: bill.billing_date,
          due_date: bill.due_date,
          maintenance_fee: maintenanceFee,
          electric_amount: calculatedElectricAmount,
          water_amount: calculatedWaterAmount,
          subtotal_amount: 0,
          total_amount: calculatedTotalAmount,
          status: bill.status || 'draft',
          tenant_count: tenantCount,
          tenants: [],
          utility_readings: calculatedReadings,
        };
      }

      if (bill.t_tenant_id) {
        const existingTenant = groupedBills[billKey].tenants.find(
          (t: any) => t.tenant_id === bill.t_tenant_id,
        );
        if (!existingTenant) {
          groupedBills[billKey].tenants.push({
            tenant_id: bill.t_tenant_id,
            first_name: bill.first_name || '',
            last_name: bill.last_name || '',
            email: bill.email || null,
            phone: bill.phone || null,
            move_in_date: bill.move_in_date,
            move_out_date: bill.move_out_date,
            contract_status: bill.contract_status,
          });
        }
      }
    });

    const result = Object.values(groupedBills).sort((a: any, b: any) => {
      if (a.billing_year !== b.billing_year) return b.billing_year - a.billing_year;
      if (a.billing_month !== b.billing_month) return b.billing_month - a.billing_month;
      const roomA = String(a.room_number || '').trim();
      const roomB = String(b.room_number || '').trim();

      const numA = /^\d+$/.test(roomA) ? parseInt(roomA, 10) : 999999;
      const numB = /^\d+$/.test(roomB) ? parseInt(roomB, 10) : 999999;

      if (numA !== 999999 && numB !== 999999) {
        return numA - numB;
      }

      if (!roomA || !roomB) {
        return roomA.localeCompare(roomB);
      }

      return roomA.localeCompare(roomB, 'th', { numeric: true });
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching my detailed bills:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch my detailed bills' },
      { status: 500 },
    );
  }
}

