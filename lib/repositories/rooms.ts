// lib/repositories/rooms.ts
import { query, queryOne } from '@/lib/db';
import type { Room } from '@/types/db';

export interface RoomWithDetails {
  room_id: number;
  room_number: string;
  floor_no: number | null;
  status: 'available' | 'occupied' | 'maintenance';
  building_name: string;
  building_id: number;
}

export async function getAllRooms(buildingId?: number): Promise<RoomWithDetails[]> {
  let sql = `
    SELECT r.room_id, r.room_number, r.floor_no, r.status,
           r.building_id,
           b.name_th AS building_name
    FROM rooms r
    JOIN buildings b ON r.building_id = b.building_id
  `;
  const params: any[] = [];

  if (buildingId) {
    sql += ' WHERE r.building_id = ?';
    params.push(buildingId);
  }

  sql += ' ORDER BY b.building_id, r.floor_no, r.room_number';

  return query<RoomWithDetails>(sql, params);
}

export async function getRoomById(roomId: number): Promise<RoomWithDetails | null> {
  const sql = `
    SELECT r.room_id, r.room_number, r.floor_no, r.status,
           r.building_id,
           b.name_th AS building_name
    FROM rooms r
    JOIN buildings b ON r.building_id = b.building_id
    WHERE r.room_id = ?
  `;
  return queryOne<RoomWithDetails>(sql, [roomId]);
}

export async function createRoom(
  buildingId: number,
  roomNumber: string,
  floorNo: number | null,
  status: 'available' | 'occupied' | 'maintenance' = 'available'
): Promise<number> {
  const { pool } = await import('@/lib/db');
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO rooms (building_id, room_number, floor_no, status)
       VALUES (?, ?, ?, ?)`,
      [buildingId, roomNumber, floorNo, status]
    );
    const insertId = (result as any).insertId;
    return insertId || 0;
  } finally {
    connection.release();
  }
}

export async function updateRoom(
  roomId: number,
  updates: Partial<Pick<Room, 'room_number' | 'floor_no' | 'status' | 'building_id'>>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.room_number !== undefined) {
    fields.push('room_number = ?');
    values.push(updates.room_number);
  }
  if (updates.floor_no !== undefined) {
    fields.push('floor_no = ?');
    values.push(updates.floor_no);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.building_id !== undefined) {
    fields.push('building_id = ?');
    values.push(updates.building_id);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(roomId);

  await query(
    `UPDATE rooms SET ${fields.join(', ')} WHERE room_id = ?`,
    values
  );
}

export async function deleteRoom(roomId: number): Promise<void> {
  await query('DELETE FROM rooms WHERE room_id = ?', [roomId]);
}
