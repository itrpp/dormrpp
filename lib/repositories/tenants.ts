// lib/repositories/tenants.ts
import { query, queryOne, pool, isTooManyConnectionsError } from '@/lib/db';
import type { Tenant, Contract } from '@/types/db';

export interface TenantWithRoom {
  tenant_id: number;
  room_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  move_in_date: Date | null;
  move_out_date: Date | null;
  status: string;
  room_number: string;
  building_name: string;
}

export type AdminTenantRow = {
  tenant_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  phone_dep: string | null;
  status: string | null;
  move_in_date: string | null;
  room_number: string | null;
  floor_no: number | null;
  building_id: number | null;
  building_name: string | null;
};

export async function getAllTenantsForAdmin(): Promise<AdminTenantRow[]> {
  let retryCount = 0;
  const maxRetries = 3;
  const baseRetryDelay = 500;

  while (retryCount <= maxRetries) {
    try {
      const sql = `
        SELECT 
          t.tenant_id,
          t.first_name_th AS first_name,
          t.last_name_th AS last_name,
          t.email,
          t.phone,
          t.department,
          t.phone_dep,
          COALESCE(t.status, 'inactive') AS status,
          c.start_date AS move_in_date,
          r.room_number,
          r.floor_no,
          b.building_id,
          b.name_th AS building_name
        FROM tenants t
        LEFT JOIN contracts c
          ON c.tenant_id = t.tenant_id
          AND c.status = 'active'
        LEFT JOIN rooms r
          ON r.room_id = c.room_id
        LEFT JOIN buildings b
          ON b.building_id = r.building_id
        WHERE COALESCE(t.is_deleted, 0) = 0
        ORDER BY 
          COALESCE(b.building_id, 999999) ASC,
          CASE 
            WHEN r.room_number IS NULL THEN 999999
            WHEN r.room_number REGEXP '^[0-9]+$' THEN CAST(r.room_number AS UNSIGNED)
            ELSE 999999
          END ASC,
          r.room_number ASC,
          t.tenant_id DESC
      `;
      
      const results = await query<AdminTenantRow>(sql);
      // กรองข้อมูลที่ซ้ำซ้อน
      const uniqueResults = new Map<number, AdminTenantRow>();
      results.forEach((row) => {
        if (!uniqueResults.has(row.tenant_id)) {
          uniqueResults.set(row.tenant_id, row);
        }
      });
      return Array.from(uniqueResults.values());
    } catch (error: any) {
      // ถ้าเป็น "Too many connections" error และยัง retry ไม่หมด ให้ retry
      if (isTooManyConnectionsError(error) && retryCount < maxRetries) {
        retryCount++;
        const delay = baseRetryDelay * retryCount;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // retry
      }
      
      // ถ้า retry หมดแล้วหรือไม่ใช่ connection error
      if (isTooManyConnectionsError(error)) {
        // Silent fallback - return array ว่างแทน
        return [];
      }
      
      // ถ้าไม่ใช่ connection error ให้ throw ต่อ
      throw error;
    }
  }
  
  // ไม่ควรมาถึงจุดนี้ แต่ถ้ามาให้ return array ว่าง
  return [];
}

export async function getAllTenants(roomId?: number): Promise<TenantWithRoom[]> {
  let sql = `
    SELECT t.tenant_id, r.room_id, 
           t.first_name_th AS first_name, 
           t.last_name_th AS last_name,
           t.email, t.phone,
           c.start_date AS move_in_date,
           c.end_date AS move_out_date,
           c.status,
           r.room_number,
           b.name_th AS building_name
    FROM contracts c
    JOIN tenants t ON c.tenant_id = t.tenant_id
    JOIN rooms r ON c.room_id = r.room_id
    JOIN buildings b ON r.building_id = b.building_id
    WHERE c.status = 'active'
  `;
  const params: any[] = [];

  if (roomId) {
    sql += ' AND c.room_id = ?';
    params.push(roomId);
  }

  sql += ' ORDER BY c.start_date DESC';

  return query<TenantWithRoom>(sql, params);
}

export async function getTenantById(tenantId: number): Promise<TenantWithRoom | null> {
  const sql = `
    SELECT t.tenant_id, r.room_id, 
           t.first_name_th AS first_name, 
           t.last_name_th AS last_name,
           t.email, t.phone,
           c.start_date AS move_in_date,
           c.end_date AS move_out_date,
           c.status,
           r.room_number,
           b.name_th AS building_name
    FROM contracts c
    JOIN tenants t ON c.tenant_id = t.tenant_id
    JOIN rooms r ON c.room_id = r.room_id
    JOIN buildings b ON r.building_id = b.building_id
    WHERE c.tenant_id = ? AND c.status = 'active'
    LIMIT 1
  `;
  return queryOne<TenantWithRoom>(sql, [tenantId]);
}

export async function createTenant(data: {
  room_id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  move_in_date?: Date | null;
}): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // สร้าง tenant ก่อน
    const [result] = await connection.query(
      `INSERT INTO tenants (first_name_th, last_name_th, email, phone, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [
        data.first_name,
        data.last_name,
        data.email ?? null,
        data.phone ?? null,
      ]
    );
    
    const tenantId = (result as any).insertId;

    // สร้าง contract เพื่อเชื่อม tenant กับ room
    await connection.query(
      `INSERT INTO contracts (tenant_id, room_id, start_date, status)
       VALUES (?, ?, ?, 'active')`,
      [
        tenantId,
        data.room_id,
        data.move_in_date ?? new Date(),
      ]
    );

    await connection.commit();
    return tenantId;
  } catch (error: any) {
    await connection.rollback();
    throw new Error(`Failed to create tenant: ${error.message}`);
  } finally {
    connection.release();
  }
}

export async function updateTenant(
  tenantId: number,
  updates: Partial<Pick<Tenant, 'first_name_th' | 'last_name_th' | 'email' | 'phone' | 'status'>>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.first_name_th !== undefined) {
    fields.push('first_name_th = ?');
    values.push(updates.first_name_th);
  }
  if (updates.last_name_th !== undefined) {
    fields.push('last_name_th = ?');
    values.push(updates.last_name_th);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push('phone = ?');
    values.push(updates.phone);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(tenantId);

  await query(
    `UPDATE tenants SET ${fields.join(', ')} WHERE tenant_id = ?`,
    values
  );
}

export async function deleteTenant(tenantId: number): Promise<void> {
  // Soft delete: เปลี่ยน status เป็น inactive
  await query(
    `UPDATE tenants SET status = 'inactive' WHERE tenant_id = ?`,
    [tenantId]
  );
  
  // ปิด contracts ทั้งหมดของ tenant นี้
  await query(
    `UPDATE contracts SET status = 'ended', end_date = CURDATE() WHERE tenant_id = ? AND status = 'active'`,
    [tenantId]
  );
}
