// lib/repositories/bills.ts
import { query, queryOne, pool } from '@/lib/db';
import type { Bill, BillUtilityReading, BillingCycle, UtilityRate } from '@/types/db';

export interface BillWithDetails extends Bill {
  room_id?: number;
  tenant_id?: number;
  room_number: string;
  building_name: string;
  tenant_name: string;
  billing_year: number;
  billing_month: number;
  billing_date: Date | string;
  due_date: Date | string;
}

export interface BillFullDetails extends BillWithDetails {
  utility_readings: BillUtilityReading[];
}

// ดึง billing cycle หรือสร้างใหม่
export async function getOrCreateBillingCycle(
  year: number,
  month: number,
  connection?: any,
  startDate?: Date,
  endDate?: Date,
  dueDate?: Date
): Promise<number> {
  // ถ้ามี connection ที่ส่งมา ให้ใช้ connection นั้น
  if (connection) {
    const [existing] = await connection.query(
      `SELECT cycle_id FROM billing_cycles 
       WHERE billing_year = ? AND billing_month = ?`,
      [year, month]
    );
    
    const existingCycles = existing as any[];
    if (existingCycles.length > 0) {
      return existingCycles[0].cycle_id;
    }
    
    // คำนวณวันที่ถ้าไม่ได้ระบุ
    const start = startDate || new Date(year - 543, month - 1, 1); // แปลงปี พ.ศ. เป็น ค.ศ.
    const end = endDate || new Date(year - 543, month, 0); // วันสุดท้ายของเดือน
    const due = dueDate || new Date(end);
    due.setDate(due.getDate() + 15); // ครบกำหนด 15 วันหลังสิ้นเดือน
    
    // สร้าง cycle ใหม่
    const [result] = await connection.query(
      `INSERT INTO billing_cycles 
       (billing_year, billing_month, start_date, end_date, due_date, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [year, month, start, end, due]
    );
    
    return (result as any).insertId;
  }
  
  // ถ้าไม่มี connection ให้ใช้ query() แทน (ใช้ connection pool)
  const existing = await queryOne<{ cycle_id: number }>(
    `SELECT cycle_id FROM billing_cycles 
     WHERE billing_year = ? AND billing_month = ?`,
    [year, month]
  );
  
  if (existing) {
    return existing.cycle_id;
  }
  
  // คำนวณวันที่ถ้าไม่ได้ระบุ
  const start = startDate || new Date(year - 543, month - 1, 1); // แปลงปี พ.ศ. เป็น ค.ศ.
  const end = endDate || new Date(year - 543, month, 0); // วันสุดท้ายของเดือน
  const due = dueDate || new Date(end);
  due.setDate(due.getDate() + 15); // ครบกำหนด 15 วันหลังสิ้นเดือน
  
  // สร้าง cycle ใหม่ - ใช้ connection pool โดยตรง
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      `INSERT INTO billing_cycles 
       (billing_year, billing_month, start_date, end_date, due_date, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [year, month, start, end, due]
    );
    return (result as any).insertId || 0;
  } finally {
      conn.release();
  }
}

// ดึงอัตราค่าใช้ปัจจุบัน
export async function getCurrentUtilityRate(
  utilityTypeId: number,
  date: Date = new Date()
): Promise<number> {
  const rate = await queryOne<UtilityRate>(
    `SELECT rate_per_unit FROM utility_rates
     WHERE utility_type_id = ? AND effective_date <= ?
     ORDER BY effective_date DESC
     LIMIT 1`,
    [utilityTypeId, date]
  );
  
  return rate?.rate_per_unit || 0;
}

// ดึง utility type ID จาก code
export async function getUtilityTypeId(code: string): Promise<number | null> {
  const type = await queryOne<{ utility_type_id: number }>(
    `SELECT utility_type_id FROM utility_types WHERE code = ?`,
    [code]
  );
  
  return type?.utility_type_id || null;
}

export async function getBillsByMonth(
  year: number,
  month: number,
  roomId?: number
): Promise<BillWithDetails[]> {
  let sql = `
    SELECT
      b.bill_id,
      b.tenant_id,
      b.room_id,
      b.contract_id,
      b.cycle_id,
      b.maintenance_fee,
      b.electric_amount,
      b.water_amount,
      b.subtotal_amount,
      b.total_amount,
      b.status,
      cy.billing_year,
      cy.billing_month,
      cy.start_date AS billing_date,
      cy.due_date,
      r.room_number,
      bu.name_th AS building_name,
      CONCAT(t.first_name_th, ' ', t.last_name_th) AS tenant_name
    FROM bills b
    JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
    JOIN contracts c ON b.contract_id = c.contract_id
    JOIN tenants t ON c.tenant_id = t.tenant_id
    JOIN rooms r ON c.room_id = r.room_id
    JOIN buildings bu ON r.building_id = bu.building_id
    WHERE cy.billing_year = ? AND cy.billing_month = ?
  `;
  const params: any[] = [year, month];

  if (roomId) {
    sql += ' AND r.room_id = ?';
    params.push(roomId);
  }

  sql += ' ORDER BY r.room_number';

  return query<BillWithDetails>(sql, params);
}

export async function getBillById(billId: number): Promise<BillFullDetails | null> {
  const bill = await queryOne<BillWithDetails>(
    `
    SELECT
      b.bill_id,
      b.tenant_id,
      b.room_id,
      b.contract_id,
      b.cycle_id,
      b.maintenance_fee,
      b.electric_amount,
      b.water_amount,
      b.subtotal_amount,
      b.total_amount,
      b.status,
      cy.billing_year,
      cy.billing_month,
      cy.start_date AS billing_date,
      cy.due_date,
      r.room_number,
      bu.name_th AS building_name,
      CONCAT(t.first_name_th, ' ', t.last_name_th) AS tenant_name
    FROM bills b
    JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
    JOIN contracts c ON b.contract_id = c.contract_id
    JOIN tenants t ON c.tenant_id = t.tenant_id
    JOIN rooms r ON c.room_id = r.room_id
    JOIN buildings bu ON r.building_id = bu.building_id
    WHERE b.bill_id = ?
  `,
    [billId]
  );

  if (!bill) {
    return null;
  }

  // ดึง utility readings จาก bill_utility_readings พร้อมอัตราค่าใช้
  const utilityReadings = await query<any>(
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
     WHERE bur.room_id = ?
       AND bur.cycle_id = ?
     ORDER BY bur.utility_type_id`,
    [bill.room_id, bill.cycle_id]
  );

  return {
    ...bill,
    utility_readings: utilityReadings,
  };
}

export async function createBill(
  data: {
    tenant_id: number;
    room_id: number;
    contract_id: number | null;
    cycle_id: number;
    maintenance_fee: number;
    electric_amount: number;
    water_amount: number;
    subtotal_amount: number;
    total_amount: number;
    status?: string;
  },
  connection?: any
): Promise<number> {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  
  try {
    const [result] = await conn.query(
      `INSERT INTO bills 
       (tenant_id, room_id, contract_id, cycle_id, maintenance_fee, electric_amount, water_amount, subtotal_amount, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tenant_id,
        data.room_id,
        data.contract_id,
        data.cycle_id,
        data.maintenance_fee,
        data.electric_amount,
        data.water_amount,
        data.subtotal_amount,
        data.total_amount,
        data.status || 'draft',
      ]
    );

    const insertId = (result as any).insertId;
    
    // อัปเดต meter_photos.bill_id สำหรับรูปมิเตอร์ที่เกี่ยวข้อง
    if (insertId) {
      await linkMeterPhotosToBill(insertId, data.room_id, data.cycle_id, conn);
    }
    
    return insertId || 0;
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

/**
 * ผูกรูปมิเตอร์กับบิลที่สร้าง
 * หารูปมิเตอร์ที่ตรงกับ room_id, utility_type, billing_year, billing_month
 * และ meter_value ที่ใกล้เคียงกับ meter_end ใน bill_utility_readings
 */
export async function linkMeterPhotosToBill(
  billId: number,
  roomId: number,
  cycleId: number,
  connection?: any
): Promise<void> {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  
  try {
    // ดึงข้อมูล billing cycle เพื่อหา billing_year และ billing_month
    const [cycle] = await conn.query(
      `SELECT billing_year, billing_month FROM billing_cycles WHERE cycle_id = ?`,
      [cycleId]
    );
    
    if (!cycle || (cycle as any[]).length === 0) {
      return; // ไม่พบ billing cycle
    }
    
    const { billing_year, billing_month } = (cycle as any[])[0];
    
    // ดึงข้อมูล utility readings สำหรับบิลนี้
    const utilityReadings = await conn.query(
      `SELECT bur.utility_type_id, bur.meter_end, ut.code AS utility_code
       FROM bill_utility_readings bur
       JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
       WHERE bur.room_id = ? AND bur.cycle_id = ?`,
      [roomId, cycleId]
    );
    
    // อัปเดต meter_photos.bill_id สำหรับแต่ละ utility type
    for (const reading of utilityReadings[0] as any[]) {
      const utilityType = reading.utility_code; // 'electric' or 'water'
      const meterEnd = reading.meter_end;
      
      // หารูปมิเตอร์ที่ตรงกับ room_id, utility_type, billing_year, billing_month
      // และ meter_value ที่ใกล้เคียงกับ meter_end (ยอมรับความแตกต่างไม่เกิน 10 หน่วย)
      await conn.query(
        `UPDATE meter_photos 
         SET bill_id = ?
         WHERE room_id = ?
           AND utility_type = ?
           AND billing_year = ?
           AND billing_month = ?
           AND bill_id IS NULL
           AND ABS(meter_value - ?) <= 10
         ORDER BY ABS(meter_value - ?) ASC
         LIMIT 1`,
        [billId, roomId, utilityType, billing_year, billing_month, meterEnd, meterEnd]
      );
    }
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

export async function createUtilityReading(
  data: {
    room_id: number;
    cycle_id: number;
    utility_type_id: number;
    meter_start: number;
    meter_end: number;
  },
  connection?: any
): Promise<number> {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  
  try {
    const [result] = await conn.query(
      `INSERT INTO bill_utility_readings (room_id, cycle_id, utility_type_id, meter_start, meter_end)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         meter_start = VALUES(meter_start),
         meter_end = VALUES(meter_end)`,
      [
        data.room_id,
        data.cycle_id,
        data.utility_type_id,
        data.meter_start,
        data.meter_end,
      ]
    );

    const insertId = (result as any).insertId;
    return insertId || 0;
  } finally {
    if (shouldRelease) {
      conn.release();
    }
  }
}

export async function updateBill(
  billId: number,
  updates: Partial<Pick<Bill, 'maintenance_fee' | 'electric_amount' | 'water_amount' | 'subtotal_amount' | 'total_amount' | 'status'>>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.maintenance_fee !== undefined) {
    fields.push('maintenance_fee = ?');
    values.push(updates.maintenance_fee);
  }
  if (updates.electric_amount !== undefined) {
    fields.push('electric_amount = ?');
    values.push(updates.electric_amount);
  }
  if (updates.water_amount !== undefined) {
    fields.push('water_amount = ?');
    values.push(updates.water_amount);
  }
  if (updates.subtotal_amount !== undefined) {
    fields.push('subtotal_amount = ?');
    values.push(updates.subtotal_amount);
  }
  if (updates.total_amount !== undefined) {
    fields.push('total_amount = ?');
    values.push(updates.total_amount);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(billId);

  await query(`UPDATE bills SET ${fields.join(', ')} WHERE bill_id = ?`, values);
}

export async function deleteBill(billId: number): Promise<void> {
  // Delete related records first
  await query('DELETE FROM payments WHERE bill_id = ?', [billId]);
  await query('DELETE FROM bills WHERE bill_id = ?', [billId]);
}
