/**
 * ดึงรายการบิลของผู้เช่าตาม tenant_id
 * - ถ้าระบุ year, month จะกรองเฉพาะรอบบิลนั้น
 * - ถ้าไม่ระบุ (undefined) จะดึงบิลทุกเดือนที่มี
 * ใช้ร่วมกับ GET /api/my/bills และ export-list
 */
import { query } from '@/lib/db';

export interface MyBillListItem {
  bill_id: number;
  tenant_id: number;
  room_id: number;
  room_number: string;
  building_name: string;
  billing_year: number;
  billing_month: number;
  total_amount: number;
  status: string;
  tenant_name: string;
}

export async function getMyBillsList(
  tenantId: number,
  year?: number,
  month?: number
): Promise<MyBillListItem[]> {
  const filterByMonth = year != null && month != null;
  const sql = filterByMonth
    ? `
    SELECT 
      b.bill_id,
      b.tenant_id,
      b.room_id,
      b.cycle_id,
      b.status,
      cy.billing_year,
      cy.billing_month,
      r.room_number,
      bu.name_th AS building_name,
      t.tenant_id AS t_tenant_id,
      t.first_name_th AS first_name,
      t.last_name_th AS last_name
    FROM bills b
    JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
    JOIN contracts c ON b.contract_id = c.contract_id
    JOIN tenants t ON c.tenant_id = t.tenant_id
    JOIN rooms r ON c.room_id = r.room_id
    JOIN buildings bu ON r.building_id = bu.building_id
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
      b.cycle_id,
      b.status,
      cy.billing_year,
      cy.billing_month,
      r.room_number,
      bu.name_th AS building_name,
      t.tenant_id AS t_tenant_id,
      t.first_name_th AS first_name,
      t.last_name_th AS last_name
    FROM bills b
    JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
    JOIN contracts c ON b.contract_id = c.contract_id
    JOIN tenants t ON c.tenant_id = t.tenant_id
    JOIN rooms r ON c.room_id = r.room_id
    JOIN buildings bu ON r.building_id = bu.building_id
    WHERE c.tenant_id = ?
    ORDER BY cy.billing_year DESC, cy.billing_month DESC, r.room_number, t.tenant_id
  `;

  const bills = await query<any>(
    sql,
    filterByMonth ? [year, month, tenantId] : [tenantId]
  );
  if (!bills.length) return [];

  const cycleIds = [...new Set(bills.map((b: any) => b.cycle_id))];
  const roomIds = [...new Set(bills.map((b: any) => b.room_id))];

  let utilityReadings: any[] = [];
  try {
    utilityReadings = await query(
      `SELECT 
        bur.reading_id,
        bur.room_id,
        bur.cycle_id,
        bur.utility_type_id,
        bur.meter_start,
        bur.meter_end,
        ut.code AS utility_code,
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
      [...cycleIds, ...roomIds]
    );
  } catch {
    utilityReadings = [];
  }

  const grouped: Record<string, { bill: any; tenantName: string }> = {};

  bills.forEach((bill: any) => {
    if (!bill.bill_id || !bill.t_tenant_id) return;
    const billKey = `${bill.t_tenant_id}_${bill.cycle_id}`;

    if (!grouped[billKey]) {
      const roomReadings = utilityReadings.filter(
        (ur: any) => ur.room_id === bill.room_id && ur.cycle_id === bill.cycle_id
      );
      const roomBills = bills.filter(
        (b: any) => b.room_id === bill.room_id && b.cycle_id === bill.cycle_id
      );
      const tenantCount = Math.max(new Set(roomBills.map((b: any) => b.t_tenant_id)).size, 1);

      let totalAmount = 1000; // maintenance
      const electric = roomReadings.find((r: any) => r.utility_code === 'electric');
      const water = roomReadings.find((r: any) => r.utility_code === 'water');
      if (electric) {
        const start = Number(electric.meter_start || 0);
        const end = Number(electric.meter_end || 0);
        const MOD = 10000;
        const usage = end >= start ? end - start : MOD - start + end;
        totalAmount += (usage * Number(electric.rate_per_unit || 0)) / tenantCount;
      }
      if (water) {
        const usage = Number(water.meter_end || 0) - Number(water.meter_start || 0);
        totalAmount += (usage * Number(water.rate_per_unit || 0)) / tenantCount;
      }

      const tenantName = [bill.first_name, bill.last_name].filter(Boolean).join(' ') || '-';
      grouped[billKey] = {
        bill: {
          bill_id: bill.bill_id,
          tenant_id: bill.t_tenant_id,
          room_id: bill.room_id,
          room_number: bill.room_number || '',
          building_name: bill.building_name || '',
          billing_year: bill.billing_year,
          billing_month: bill.billing_month,
          total_amount: totalAmount,
          status: bill.status || 'draft',
        },
        tenantName,
      };
    }
  });

  const list = Object.values(grouped).map(({ bill, tenantName }) => ({
    bill_id: bill.bill_id,
    tenant_id: bill.tenant_id,
    room_id: bill.room_id,
    room_number: bill.room_number,
    building_name: bill.building_name,
    billing_year: bill.billing_year,
    billing_month: bill.billing_month,
    total_amount: bill.total_amount,
    status: bill.status,
    tenant_name: tenantName,
  }));

  list.sort((a, b) => {
    if (a.billing_year !== b.billing_year) return b.billing_year - a.billing_year;
    if (a.billing_month !== b.billing_month) return b.billing_month - a.billing_month;
    const roomA = String(a.room_number).trim();
    const roomB = String(b.room_number).trim();
    const numA = /^\d+$/.test(roomA) ? parseInt(roomA, 10) : 999999;
    const numB = /^\d+$/.test(roomB) ? parseInt(roomB, 10) : 999999;
    if (numA !== 999999 && numB !== 999999) return numA - numB;
    return roomA.localeCompare(roomB, 'th', { numeric: true });
  });

  return list;
}
