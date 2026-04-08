// app/api/tenants/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAllTenants, type AdminTenantRow } from '@/lib/repositories/tenants';
import { checkRoomAvailability } from '@/lib/repositories/room-occupancy';
import { getRoomById } from '@/lib/repositories/rooms';
import { requireAppRoles } from '@/lib/auth/middleware';
import {
  ADMIN_BUILDING_DATA_ACCESS_ROLES,
  getAdminBuildingScopeFromAppRoles,
  isBuildingIdInScope,
  resolveAllowedBuildingIdsForListQuery,
  tenantSearchBuildingClause,
} from '@/lib/auth/building-scope';

// GET /api/tenants?room_id=1
// GET /api/tenants?q=keyword   (ค้นหาผู้เช่า)
export async function GET(req: Request) {
  try {
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room_id');
    const q = searchParams.get('q');

    const resolvedListIds = resolveAllowedBuildingIdsForListQuery(scope, null);
    const allowedForTenants =
      resolvedListIds === null ? undefined : resolvedListIds;

    // โหมดค้นหาผู้เช่าเก่า
    if (q && !roomId) {
      const keyword = `%${q}%`;
      const tbc = tenantSearchBuildingClause(scope);
      const scopeTail = tbc ? tbc.clause : '';
      const scopeParams = tbc ? tbc.params : [];
      const searchBind = [
        keyword,
        keyword,
        keyword,
        keyword,
        keyword,
        keyword,
        ...scopeParams,
      ];
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
              OR r_last.room_number LIKE ?
            )
            ${scopeTail}
          ORDER BY t.tenant_id DESC
          LIMIT 20
        `,
          searchBind
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
                OR r_last.room_number LIKE ?
              )
              ${scopeTail}
            ORDER BY t.tenant_id DESC
            LIMIT 20
          `,
            searchBind
          );
          return NextResponse.json(rows);
        }
        throw err;
      }
    }

    // โหมดเดิม: ดึงผู้เช่าตาม room_id หรือทั้งหมด
    const tenants = await getAllTenants(
      roomId ? Number(roomId) : undefined,
      allowedForTenants,
    );
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
    const authResult = await requireAppRoles(ADMIN_BUILDING_DATA_ACCESS_ROLES);
    if (!authResult.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scope = getAdminBuildingScopeFromAppRoles(authResult.appRoles ?? []);

    const body = await req.json();
    const {
      first_name,
      last_name,
      email,
      phone,
      department,
      room_number,
      room_id: bodyRoomId,
      building_id: bodyBuildingId,
      status,
      move_in_date,
    } = body;

    const fn = typeof first_name === 'string' ? first_name.trim() : '';
    const ln = typeof last_name === 'string' ? last_name.trim() : '';
    if (!fn || !ln) {
      return NextResponse.json(
        { error: 'first_name และ last_name จำเป็นต้องกรอก' },
        { status: 400 }
      );
    }

    // หา room_id: ใช้ room_id จาก client เป็นหลัก (กันห้องเลขซ้ำคนละอาคาร)
    let room_id: number | null = null;

    const rid =
      bodyRoomId !== undefined && bodyRoomId !== null && bodyRoomId !== ''
        ? Number(bodyRoomId)
        : NaN;
    if (Number.isFinite(rid) && rid > 0) {
      const byId = await query<{ room_id: number; room_number: string }>(
        'SELECT room_id, room_number FROM rooms WHERE room_id = ? LIMIT 1',
        [rid],
      );
      if (byId.length === 0) {
        return NextResponse.json(
          { error: 'ไม่พบห้องที่เลือก (room_id ไม่ถูกต้อง)' },
          { status: 400 },
        );
      }
      room_id = byId[0].room_id;
    } else if (room_number !== undefined && room_number !== null && room_number !== '') {
      const rn = String(room_number).trim();
      const bid =
        bodyBuildingId !== undefined &&
        bodyBuildingId !== null &&
        bodyBuildingId !== ''
          ? Number(bodyBuildingId)
          : NaN;
      let room: { room_id: number; room_number: string }[];
      if (Number.isFinite(bid) && bid > 0) {
        room = await query<{ room_id: number; room_number: string }>(
          'SELECT room_id, room_number FROM rooms WHERE room_number = ? AND building_id = ? LIMIT 1',
          [rn, bid],
        );
      } else {
        room = await query<{ room_id: number; room_number: string }>(
          'SELECT room_id, room_number FROM rooms WHERE room_number = ? LIMIT 1',
          [rn],
        );
      }
      if (room.length === 0) {
        return NextResponse.json(
          { error: 'ไม่พบหมายเลขห้องในระบบ' },
          { status: 400 },
        );
      }
      room_id = room[0].room_id;
    }

    if (room_id != null) {
      const roomRow = await getRoomById(room_id);
      if (!roomRow || !isBuildingIdInScope(roomRow.building_id, scope)) {
        return NextResponse.json(
          { error: 'ไม่มีสิทธิ์จัดการห้องหรืออาคารนี้' },
          { status: 403 },
        );
      }
    }

    const hasRoom = room_id != null;
    // กำหนด status: ถ้าไม่มีห้อง ให้เป็น 'pending' (รอเข้าพัก)
    const tenantStatus = hasRoom ? status || 'active' : 'pending';

    // ฐานข้อมูลบางชุดกำหนด department เป็น NOT NULL — ใช้ '' แทน null เมื่อไม่กรอก
    const deptForInsert =
      typeof department === 'string' ? department.trim() : '';

    // insert tenant — ลองหลายรูปแบบตามคอลัมน์ที่มี (department / is_deleted)
    let tenant_id: number | undefined;
    const insertAttempts: Array<{ sql: string; params: unknown[] }> = [
      {
        sql: `INSERT INTO tenants (first_name_th, last_name_th, email, phone, department, status, is_deleted)
              VALUES (?, ?, ?, ?, ?, ?, 0)`,
        params: [fn, ln, email || null, phone || null, deptForInsert, tenantStatus],
      },
      {
        sql: `INSERT INTO tenants (first_name_th, last_name_th, email, phone, status, is_deleted)
              VALUES (?, ?, ?, ?, ?, 0)`,
        params: [fn, ln, email || null, phone || null, tenantStatus],
      },
      {
        sql: `INSERT INTO tenants (first_name_th, last_name_th, email, phone, department, status)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [fn, ln, email || null, phone || null, deptForInsert, tenantStatus],
      },
      {
        sql: `INSERT INTO tenants (first_name_th, last_name_th, email, phone, status)
              VALUES (?, ?, ?, ?, ?)`,
        params: [fn, ln, email || null, phone || null, tenantStatus],
      },
    ];

    let insertError: unknown;
    for (const attempt of insertAttempts) {
      try {
        const result = await query(attempt.sql, attempt.params);
        const header = result as unknown as { insertId?: number };
        const insId = Number(header?.insertId);
        if (Number.isFinite(insId) && insId > 0) {
          tenant_id = insId;
          insertError = undefined;
          break;
        }
      } catch (e: unknown) {
        insertError = e;
        const err = e as { code?: string; errno?: number; message?: string };
        const isBadColumn =
          err?.code === 'ER_BAD_FIELD_ERROR' ||
          err?.errno === 1054 ||
          err?.message?.includes('Unknown column');
        if (isBadColumn) {
          continue;
        }
        throw e;
      }
    }
    if (tenant_id == null) {
      throw insertError instanceof Error
        ? insertError
        : new Error('ไม่สามารถบันทึกผู้เช่าได้');
    }

    // สร้าง contract active ใหม่ (เฉพาะเมื่อมีห้องและสถานะ active)
    if (hasRoom && room_id && tenantStatus === 'active') {
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

        const finalMoveInDate = move_in_date || new Date().toISOString().slice(0, 10);
        
        await query(
          `
          INSERT INTO contracts (tenant_id, room_id, start_date, status)
          VALUES (?, ?, ?, 'active')
        `,
          [tenant_id, room_id, finalMoveInDate]
        );

        // อัปเดต tenant status ตาม start_date
        const { updateTenantStatusByStartDate } = await import('@/lib/db-helpers');
        await updateTenantStatusByStartDate(tenant_id, finalMoveInDate);
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

