// app/api/tenants/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAllTenants } from '@/lib/repositories/tenants';
import type { AdminTenantRow } from '@/lib/repositories/tenants';
import { checkRoomAvailability } from '@/lib/repositories/room-occupancy';

// GET /api/tenants?room_id=1
// GET /api/tenants?q=keyword   (ค้นหาผู้เช่า)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');
    const q = searchParams.get('q');

    // โหมดค้นหาผู้เช่าเก่า
    if (q && !roomId) {
      const keyword = `%${q}%`;
      try {
        // พยายามใช้ first_name_th / last_name_th ก่อน
        const rows = await query(
          `
          SELECT
            t.tenant_id,
            t.first_name_th    AS first_name,
            t.last_name_th     AS last_name,
            t.email,
            t.phone,
            t.status,
            -- หาข้อมูลการเข้าพักล่าสุด (อาจไม่มี)
            c_last.room_id     AS last_room_id,
            r_last.room_number AS last_room_number,
            c_last.start_date  AS last_start_date,
            c_last.end_date    AS last_end_date,
            c_last.status      AS last_contract_status
          FROM tenants t
          LEFT JOIN (
            SELECT
              c1.*
            FROM contracts c1
            JOIN (
              SELECT tenant_id, MAX(start_date) AS max_start_date
              FROM contracts
              GROUP BY tenant_id
            ) c2
              ON c1.tenant_id = c2.tenant_id
             AND c1.start_date = c2.max_start_date
          ) c_last
            ON c_last.tenant_id = t.tenant_id
          LEFT JOIN rooms r_last
            ON r_last.room_id = c_last.room_id
          WHERE
            (
              t.first_name_th LIKE ?
              OR t.last_name_th LIKE ?
              OR CONCAT(t.first_name_th, ' ', t.last_name_th) LIKE ?
              OR t.phone LIKE ?
              OR t.email LIKE ?
            )
          ORDER BY t.tenant_id DESC
          LIMIT 20
        `,
          [keyword, keyword, keyword, keyword, keyword]
        );
        return NextResponse.json(rows);
      } catch (err: any) {
        // fallback: กรณีไม่มีคอลัมน์ first_name_th / last_name_th
        if (
          err.message?.includes("Unknown column 'first_name_th'") ||
          err.message?.includes("Unknown column 'last_name_th'")
        ) {
          const rows = await query(
            `
            SELECT
              t.tenant_id,
              t.first_name       AS first_name,
              t.last_name        AS last_name,
              t.email,
              t.phone,
              t.status,
              c_last.room_id     AS last_room_id,
              r_last.room_number AS last_room_number,
              c_last.start_date  AS last_start_date,
              c_last.end_date    AS last_end_date,
              c_last.status      AS last_contract_status
            FROM tenants t
            LEFT JOIN (
              SELECT
                c1.*
              FROM contracts c1
              JOIN (
                SELECT tenant_id, MAX(start_date) AS max_start_date
                FROM contracts
                GROUP BY tenant_id
              ) c2
                ON c1.tenant_id = c2.tenant_id
               AND c1.start_date = c2.max_start_date
            ) c_last
              ON c_last.tenant_id = t.tenant_id
            LEFT JOIN rooms r_last
              ON r_last.room_id = c_last.room_id
            WHERE
              (
                t.first_name LIKE ?
                OR t.last_name LIKE ?
                OR CONCAT(t.first_name, ' ', t.last_name) LIKE ?
                OR t.phone LIKE ?
                OR t.email LIKE ?
              )
            ORDER BY t.tenant_id DESC
            LIMIT 20
          `,
            [keyword, keyword, keyword, keyword, keyword]
          );
          return NextResponse.json(rows);
        }
        throw err;
      }
    }

    // โหมดเดิม: ดึงผู้เช่าตาม room_id หรือทั้งหมด
    const tenants = await getAllTenants(roomId ? Number(roomId) : undefined);
    return NextResponse.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }
}

// POST /api/tenants
// body: { first_name, last_name, email, phone, room_number, status, move_in_date }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      first_name,
      last_name,
      email,
      phone,
      room_number,
      status,
      move_in_date,
    } = body;

    if (!first_name || !last_name || !room_number) {
      return NextResponse.json(
        { error: 'first_name, last_name, room_number จำเป็นต้องกรอก' },
        { status: 400 }
      );
    }

    // หา room_id จาก room_number
    const room = await query<{ room_id: number; building_id: number }>(
      'SELECT room_id, building_id FROM rooms WHERE room_number = ? LIMIT 1',
      [room_number]
    );
    if (room.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบหมายเลขห้องในระบบ' },
        { status: 400 }
      );
    }
    const room_id = room[0].room_id;

    // insert tenant
    let tenant_id: number;
    try {
    const result = await query<{ insertId: number }>(
      `
      INSERT INTO tenants (first_name_th, last_name_th, email, phone, status, is_deleted)
      VALUES (?, ?, ?, ?, ?, 0)
    `,
      [first_name, last_name, email || null, phone || null, status || 'active']
    );
      tenant_id = (result as any).insertId;
    } catch (insertErr: any) {
      // ถ้าไม่มี is_deleted column ให้ลอง insert แบบไม่ใช้คอลัมน์นี้
      if (insertErr.message?.includes("Unknown column 'is_deleted'")) {
        const fallbackResult = await query<{ insertId: number }>(
          `
          INSERT INTO tenants (first_name_th, last_name_th, email, phone, status)
          VALUES (?, ?, ?, ?, ?)
        `,
          [first_name, last_name, email || null, phone || null, status || 'active']
        );
        tenant_id = (fallbackResult as any).insertId;
      } else {
        throw insertErr;
      }
    }

    // สร้าง contract active ใหม่
    if (status === 'active') {
      try {
        // ตรวจสอบว่าห้องสามารถเพิ่มผู้เข้าพักได้หรือไม่
        const availability = await checkRoomAvailability(room_id);
        if (!availability.canAdd) {
          // ลบ tenant ที่สร้างไปแล้ว (rollback)
          await query('DELETE FROM tenants WHERE tenant_id = ?', [tenant_id]);
          return NextResponse.json(
            { error: availability.message },
            { status: 400 }
          );
        }

        await query(
          `
          INSERT INTO contracts (tenant_id, room_id, start_date, status)
          VALUES (?, ?, ?, 'active')
        `,
          [tenant_id, room_id, move_in_date || new Date().toISOString().slice(0, 10)]
        );
      } catch (error: any) {
        // ถ้าไม่มี contracts table ให้ข้าม
        if (error.message?.includes("doesn't exist") || error.message?.includes("Unknown table")) {
          console.warn('Contracts table does not exist, skipping contract creation');
        } 
        // จับ error จาก trigger
        else if (error.message?.includes('มีผู้เข้าพักครบจำนวนแล้ว')) {
          // ลบ tenant ที่สร้างไปแล้ว (rollback)
          await query('DELETE FROM tenants WHERE tenant_id = ?', [tenant_id]);
          return NextResponse.json(
            { error: error.message },
            { status: 400 }
          );
        } else {
          throw error;
        }
      }
    }

    // ดึงข้อมูล row เต็ม เพื่อส่งกลับไปอัปเดต state ฝั่ง client
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
          COALESCE(c.status, 'inactive') AS status,
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
        [tenant_id]
      );
    } catch (error: any) {
      // Fallback ถ้าไม่มี first_name_th/last_name_th
      if (error.message?.includes("Unknown column 'first_name_th'") || 
          error.message?.includes("Unknown column 'last_name_th'")) {
        rows = await query<AdminTenantRow>(
          `
          SELECT 
            t.tenant_id,
            t.first_name AS first_name,
            t.last_name AS last_name,
            t.email,
            t.phone,
            COALESCE(c.status, 'inactive') AS status,
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
          [tenant_id]
        );
      } else {
        throw error;
      }
    }

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: any) {
    console.error('Error creating tenant:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create tenant' },
      { status: 500 }
    );
  }
}

