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

