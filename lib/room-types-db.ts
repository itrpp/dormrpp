/**
 * ช่วย INSERT/UPDATE/DELETE room_types ให้รองรับ schema ที่ใช้ id หรือ room_type_id และ name_th หรือ name_type
 */
import { pool } from '@/lib/db';
import { query, queryOne } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

export async function insertRoomTypeRow(
  name: string,
  maxOccupants: number,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('ชื่อประเภทห้องต้องไม่ว่าง');
  }

  const variants: Array<{ sql: string; params: unknown[] }> = [
    {
      sql: 'INSERT INTO room_types (name_th, max_occupants) VALUES (?, ?)',
      params: [trimmed, maxOccupants],
    },
    {
      sql: 'INSERT INTO room_types (name_type, max_occupants) VALUES (?, ?)',
      params: [trimmed, maxOccupants],
    },
    {
      sql: 'INSERT INTO room_types (name_th, name_type, max_occupants) VALUES (?, ?, ?)',
      params: [trimmed, trimmed, maxOccupants],
    },
  ];

  let lastErr: unknown;
  for (const v of variants) {
    try {
      const [res] = await pool.query(v.sql, v.params);
      const ins = res as ResultSetHeader;
      if (ins.insertId) {
        return ins.insertId;
      }
    } catch (e: unknown) {
      lastErr = e;
      const err = e as { code?: string; errno?: number };
      if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.errno === 1054) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('ไม่สามารถเพิ่มประเภทห้องได้ (โครงสร้างตารางไม่รองรับ)');
}

type RoomTypeMeta = {
  pkCol: 'id' | 'room_type_id';
  pkVal: number;
  hasNameTh: boolean;
  hasNameType: boolean;
};

async function loadRoomTypeMeta(id: number): Promise<RoomTypeMeta | null> {
  let raw: Record<string, unknown> | null = null;
  try {
    raw = await queryOne<Record<string, unknown>>(
      'SELECT * FROM room_types WHERE id = ? LIMIT 1',
      [id],
    );
  } catch {
    // บางฐานข้อมูลอาจไม่มีคอลัมน์ id
  }
  if (!raw) {
    try {
      raw = await queryOne<Record<string, unknown>>(
        'SELECT * FROM room_types WHERE room_type_id = ? LIMIT 1',
        [id],
      );
    } catch {
      return null;
    }
  }
  if (!raw) {
    return null;
  }

  let pkCol: 'id' | 'room_type_id';
  let pkVal: number;
  if (raw.id != null && raw.id !== '') {
    pkCol = 'id';
    pkVal = Number(raw.id);
  } else if (raw.room_type_id != null && raw.room_type_id !== '') {
    pkCol = 'room_type_id';
    pkVal = Number(raw.room_type_id);
  } else {
    return null;
  }

  return {
    pkCol,
    pkVal,
    hasNameTh: Object.prototype.hasOwnProperty.call(raw, 'name_th'),
    hasNameType: Object.prototype.hasOwnProperty.call(raw, 'name_type'),
  };
}

export async function updateRoomTypeRow(
  id: number,
  name: string,
  maxOccupants: number,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('ชื่อประเภทห้องต้องไม่ว่าง');
  }

  const meta = await loadRoomTypeMeta(id);
  if (!meta) {
    throw new Error('ไม่พบประเภทห้อง');
  }

  const where = `${meta.pkCol} = ?`;
  const wParam = meta.pkVal;

  if (meta.hasNameTh && meta.hasNameType) {
    const [res] = await pool.query(
      `UPDATE room_types SET name_th = ?, name_type = ?, max_occupants = ? WHERE ${where}`,
      [trimmed, trimmed, maxOccupants, wParam],
    );
    if ((res as ResultSetHeader).affectedRows === 0) {
      throw new Error('ไม่สามารถอัปเดตประเภทห้องได้');
    }
    return;
  }

  if (meta.hasNameTh) {
    const [res] = await pool.query(
      `UPDATE room_types SET name_th = ?, max_occupants = ? WHERE ${where}`,
      [trimmed, maxOccupants, wParam],
    );
    if ((res as ResultSetHeader).affectedRows === 0) {
      throw new Error('ไม่สามารถอัปเดตประเภทห้องได้');
    }
    return;
  }

  if (meta.hasNameType) {
    const [res] = await pool.query(
      `UPDATE room_types SET name_type = ?, max_occupants = ? WHERE ${where}`,
      [trimmed, maxOccupants, wParam],
    );
    if ((res as ResultSetHeader).affectedRows === 0) {
      throw new Error('ไม่สามารถอัปเดตประเภทห้องได้');
    }
    return;
  }

  throw new Error('ตาราง room_types ไม่มีคอลัมน์ name_th หรือ name_type');
}

export async function deleteRoomTypeRow(id: number): Promise<void> {
  const [r1] = await pool.query<ResultSetHeader>(
    'DELETE FROM room_types WHERE id = ? LIMIT 1',
    [id],
  );
  if (r1.affectedRows > 0) {
    return;
  }
  try {
    const [r2] = await pool.query<ResultSetHeader>(
      'DELETE FROM room_types WHERE room_type_id = ? LIMIT 1',
      [id],
    );
    if (r2.affectedRows > 0) {
      return;
    }
  } catch {
    // ไม่มีคอลัมน์ room_type_id
  }
  throw new Error('ไม่พบประเภทห้องที่ต้องการลบ');
}

export async function countRoomsUsingRoomType(roomTypeId: number): Promise<number> {
  const rows = await query<{ c: number }>(
    'SELECT COUNT(*) AS c FROM rooms WHERE room_type_id = ?',
    [roomTypeId],
  );
  return Number(rows[0]?.c ?? 0);
}
