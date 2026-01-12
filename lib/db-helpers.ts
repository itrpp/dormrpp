// lib/db-helpers.ts
// Helper functions สำหรับจัดการกับ database schema ที่อาจแตกต่างกัน

import { query } from './db';

/**
 * ตรวจสอบว่าตารางมี column นี้หรือไม่
 */
export async function hasColumn(
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const result = await query<{ COLUMN_NAME: string }>(
      `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ? 
        AND COLUMN_NAME = ?
    `,
      [tableName, columnName]
    );
    return result.length > 0;
  } catch (error) {
    console.error(`Error checking column ${columnName} in ${tableName}:`, error);
    return false;
  }
}

/**
 * สร้าง SQL SELECT statement ที่รองรับกรณีที่ไม่มี column status
 */
export async function buildSelectWithOptionalStatus(
  baseSelect: string,
  tableAlias: string,
  defaultStatus: string = 'active'
): Promise<string> {
  const tableName = tableAlias.replace(/^[a-z]+\./, '').replace(/^[a-z]+$/, '');
  const hasStatusColumn = await hasColumn(tableName, 'status');
  
  if (hasStatusColumn) {
    return baseSelect;
  }
  
  // ถ้าไม่มี status column ให้เพิ่ม NULL AS status
  if (!baseSelect.includes('status')) {
    return baseSelect.replace(
      /SELECT\s+/i,
      `SELECT NULL AS status, `
    );
  }
  
  return baseSelect;
}

/**
 * อัปเดต tenant status ตาม start_date ของ contract
 * - ถ้า start_date > วันนี้ → set status = 'pending'
 * - ถ้า start_date <= วันนี้ → set status = 'active'
 */
export async function updateTenantStatusByStartDate(
  tenantId: number,
  startDate: string | Date | null
): Promise<void> {
  try {
    if (!startDate) {
      // ถ้าไม่มี start_date ให้ set เป็น 'active' (กรณีเข้าพักทันที)
      await query(
        `UPDATE tenants SET status = 'active' WHERE tenant_id = ?`,
        [tenantId]
      );
      return;
    }

    // แปลง startDate เป็น Date object
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // ตั้งเวลาเป็น 00:00:00 เพื่อเปรียบเทียบเฉพาะวันที่
    
    const startDateOnly = new Date(start);
    startDateOnly.setHours(0, 0, 0, 0);

    // เปรียบเทียบวันที่
    if (startDateOnly > today) {
      // ยังไม่ถึงวันเข้าพัก → pending
      await query(
        `UPDATE tenants SET status = 'pending' WHERE tenant_id = ?`,
        [tenantId]
      );
    } else {
      // ถึงวันเข้าพักแล้ว → active
      await query(
        `UPDATE tenants SET status = 'active' WHERE tenant_id = ?`,
        [tenantId]
      );
    }
  } catch (error: any) {
    // ถ้าไม่มี status column หรือ error อื่นๆ ให้ข้าม
    console.warn('Cannot update tenant status by start_date:', error.message);
  }
}

