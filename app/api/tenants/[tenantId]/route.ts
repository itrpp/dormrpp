// app/api/tenants/[tenantId]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { AdminTenantRow } from '@/lib/repositories/tenants';

type Params = { params: { tenantId: string } };

export async function PUT(req: Request, { params }: Params) {
  try {
    const tenantId = Number(params.tenantId);
    const body = await req.json();
    const {
      first_name,
      last_name,
      email,
      phone,
      department,
      phone_dep,
      status,
    } = body;

    // ตรวจสอบรูปแบบอีเมล (ถ้ามีการกรอก)
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return NextResponse.json(
          { error: 'รูปแบบอีเมลไม่ถูกต้อง กรุณากรอกอีเมลให้ถูกต้อง (เช่น example@email.com)' },
          { status: 400 }
        );
      }
    }

    // อัปเดตข้อมูลผู้เช่า (เฉพาะข้อมูลส่วนตัว + สถานะ)
    // ไม่ยุ่งกับตาราง contracts เพื่อให้ status ใน contracts คงค่าเดิม
    try {
      await query(
        `
        UPDATE tenants
        SET first_name_th = ?, last_name_th = ?, email = ?, phone = ?, department = ?, phone_dep = ?, status = ?
        WHERE tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      `,
        [first_name, last_name, email || null, phone || null, department || null, phone_dep || null, status, tenantId]
      );
    } catch (error: any) {
      // ถ้าไม่มี is_deleted column
      if (error.message?.includes("Unknown column 'is_deleted'")) {
        await query(
          `
          UPDATE tenants
          SET first_name_th = ?, last_name_th = ?, email = ?, phone = ?, department = ?, phone_dep = ?, status = ?
          WHERE tenant_id = ?
        `,
          [first_name, last_name, email || null, phone || null, department || null, phone_dep || null, status, tenantId]
        );
      } else if (error.message?.includes("Unknown column 'department'") || error.message?.includes("Unknown column 'phone_dep'")) {
        // ถ้าไม่มี department หรือ phone_dep column ให้อัปเดตเฉพาะฟิลด์ที่มี
        try {
          await query(
            `
            UPDATE tenants
            SET first_name_th = ?, last_name_th = ?, email = ?, phone = ?, status = ?
            WHERE tenant_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
          `,
            [first_name, last_name, email || null, phone || null, status, tenantId]
          );
        } catch (fallbackError: any) {
          if (fallbackError.message?.includes("Unknown column 'is_deleted'")) {
            await query(
              `
              UPDATE tenants
              SET first_name_th = ?, last_name_th = ?, email = ?, phone = ?, status = ?
              WHERE tenant_id = ?
            `,
              [first_name, last_name, email || null, phone || null, status, tenantId]
            );
          } else {
            throw fallbackError;
          }
        }
      } else {
        throw error;
      }
    }

    // ดึง row เต็ม (ใช้ status จาก tenants table; contracts.status ไม่ถูกเปลี่ยน)
    let rows: AdminTenantRow[];
    try {
      rows = await query<AdminTenantRow>(
        `
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
        LEFT JOIN contracts c ON c.tenant_id = t.tenant_id AND c.status = 'active'
        LEFT JOIN rooms r      ON r.room_id = c.room_id
        LEFT JOIN buildings b  ON b.building_id = r.building_id
        WHERE t.tenant_id = ?
        LIMIT 1
      `,
        [tenantId]
      );
    } catch (error: any) {
      // Fallback ถ้าไม่มี first_name_th/last_name_th หรือ department/phone_dep
      if (error.message?.includes("Unknown column 'first_name_th'") || 
          error.message?.includes("Unknown column 'last_name_th'") ||
          error.message?.includes("Unknown column 'department'") ||
          error.message?.includes("Unknown column 'phone_dep'")) {
        rows = await query<AdminTenantRow>(
          `
          SELECT 
            t.tenant_id,
            t.first_name AS first_name,
            t.last_name AS last_name,
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
          LEFT JOIN contracts c ON c.tenant_id = t.tenant_id AND c.status = 'active'
          LEFT JOIN rooms r      ON r.room_id = c.room_id
          LEFT JOIN buildings b  ON b.building_id = r.building_id
          WHERE t.tenant_id = ?
          LIMIT 1
        `,
          [tenantId]
        );
      } else {
        throw error;
      }
    }

    return NextResponse.json(rows[0]);
  } catch (error: any) {
    console.error('Error updating tenant:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update tenant' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const tenantId = Number(params.tenantId);

    // soft delete
    try {
      await query(
        `UPDATE tenants SET is_deleted = 1, status = 'inactive' WHERE tenant_id = ?`,
        [tenantId]
      );
    } catch (error: any) {
      // ถ้าไม่มี is_deleted column ให้ update แค่ status
      if (error.message?.includes("Unknown column 'is_deleted'")) {
        await query(
          `UPDATE tenants SET status = 'inactive' WHERE tenant_id = ?`,
          [tenantId]
        );
      } else {
        throw error;
      }
    }

    // ปิดสัญญาที่ active
    try {
      await query(
        `UPDATE contracts SET status = 'inactive' WHERE tenant_id = ? AND status = 'active'`,
        [tenantId]
      );
    } catch (error: any) {
      // ถ้าไม่มี contracts table ให้ข้าม
      if (error.message?.includes("doesn't exist") || error.message?.includes("Unknown table")) {
        console.warn('Contracts table does not exist, skipping contract update');
      } else {
        throw error;
      }
    }

    return NextResponse.json({ message: 'Tenant soft-deleted' });
  } catch (error: any) {
    console.error('Error deleting tenant:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete tenant' },
      { status: 500 }
    );
  }
}

