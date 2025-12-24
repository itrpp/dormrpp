// lib/repositories/rooms.ts
import { query, queryOne } from '@/lib/db';
import type { Room } from '@/types/db';

// Cache เพื่อป้องกันการเรียก ensureIsDeletedColumn ซ้ำ
let isDeletedColumnChecked = false;
let isDeletedColumnCheckPromise: Promise<void> | null = null;

/**
 * ตรวจสอบและสร้างคอลัมน์ is_deleted ถ้ายังไม่มี (ใช้ cache เพื่อป้องกันการเรียกซ้ำ)
 */
async function ensureIsDeletedColumn(): Promise<void> {
  // ถ้าตรวจสอบแล้ว ให้ข้าม
  if (isDeletedColumnChecked) {
    return;
  }

  // ถ้ากำลังตรวจสอบอยู่ ให้รอให้เสร็จก่อน
  if (isDeletedColumnCheckPromise) {
    return isDeletedColumnCheckPromise;
  }

  // เริ่มตรวจสอบ
  isDeletedColumnCheckPromise = (async () => {
    try {
      // ใช้ INFORMATION_SCHEMA แทนการ query ข้อมูลจริง เพื่อลดการใช้ connection
      const columnCheck = await query<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'rooms' 
           AND COLUMN_NAME = 'is_deleted' 
         LIMIT 1`
      );
      
      if (columnCheck.length > 0) {
        // คอลัมน์มีอยู่แล้ว
        isDeletedColumnChecked = true;
      } else {
        // ไม่มีคอลัมน์ ให้สร้าง
        try {
          await query(
            'ALTER TABLE rooms ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0'
          );
          console.log('Created is_deleted column in rooms table');
          isDeletedColumnChecked = true;
        } catch (alterError: any) {
          // ถ้าสร้างแล้วหรือมี error อื่น ให้ข้าม
          if (alterError.message?.includes('Duplicate column')) {
            isDeletedColumnChecked = true;
          } else {
            console.warn('Failed to create is_deleted column:', alterError.message);
            // ถ้าเป็น connection error ให้ตั้ง flag เป็น true เพื่อไม่ให้ retry ซ้ำ
            if (alterError.code === 'ER_CON_COUNT_ERROR' || alterError.message?.includes('Too many connections')) {
              isDeletedColumnChecked = true; // ตั้งเป็น true เพื่อไม่ให้ retry (silent fallback)
            }
          }
        }
      }
    } catch (error: any) {
      // ถ้าเป็น connection error ให้ตั้ง flag เป็น true เพื่อไม่ให้ retry ซ้ำ
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
        isDeletedColumnChecked = true; // ตั้งเป็น true เพื่อไม่ให้ retry
      } else {
        console.warn('Error checking is_deleted column:', error.message);
        // ถ้า error อื่นๆ ให้ข้าม
      }
    } finally {
      isDeletedColumnCheckPromise = null;
    }
  })();

  return isDeletedColumnCheckPromise;
}

export interface RoomWithDetails {
  room_id: number;
  room_number: string;
  floor_no: number | null;
  status: 'available' | 'occupied' | 'maintenance';
  building_name: string;
  building_id: number;
  // อาจไม่มีคอลัมน์ room_type_id ใน DB เก่า จึงใช้เป็น optional / nullable
  room_type_id?: number | null;
  is_deleted?: number | null; // 0 = เปิดใช้งาน, 1 = ปิดใช้งาน
}

export async function getAllRooms(buildingId?: number): Promise<RoomWithDetails[]> {
  // ตรวจสอบและสร้างคอลัมน์ is_deleted ถ้ายังไม่มี
  await ensureIsDeletedColumn();
  
  let sql = `
    SELECT r.room_id, r.room_number, r.floor_no, r.status,
           r.building_id,
           b.name_th AS building_name,
           r.room_type_id,
           COALESCE(r.is_deleted, 0) AS is_deleted
    FROM rooms r
    JOIN buildings b ON r.building_id = b.building_id
    WHERE COALESCE(r.is_deleted, 0) = 0
  `;
  const params: any[] = [];

  if (buildingId) {
    sql += ' AND r.building_id = ?';
    params.push(buildingId);
  }

  sql += ' ORDER BY b.building_id, r.floor_no, r.room_number';

  return query<RoomWithDetails>(sql, params);
}

export async function getRoomById(roomId: number): Promise<RoomWithDetails | null> {
  // ตรวจสอบและสร้างคอลัมน์ is_deleted ถ้ายังไม่มี
  await ensureIsDeletedColumn();
  
  const sql = `
    SELECT r.room_id, r.room_number, r.floor_no, r.status,
           r.building_id,
           b.name_th AS building_name,
           r.room_type_id,
           COALESCE(r.is_deleted, 0) AS is_deleted
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

/**
 * เปิดใช้งาน/ปิดใช้งานห้องพัก (soft delete)
 * @param roomId - ID ของห้อง
 * @param isDeleted - true = ปิดใช้งาน, false = เปิดใช้งาน
 */
export async function toggleRoomActive(roomId: number, isDeleted: boolean): Promise<void> {
  // ตรวจสอบว่ามีคอลัมน์ is_deleted หรือไม่
  try {
    await query(
      'UPDATE rooms SET is_deleted = ? WHERE room_id = ?',
      [isDeleted ? 1 : 0, roomId]
    );
  } catch (error: any) {
    // ถ้ายังไม่มีคอลัมน์ is_deleted ให้สร้างก่อน
    if (error.message?.includes('Unknown column') || error.message?.includes('is_deleted')) {
      // เพิ่มคอลัมน์ is_deleted
      await query(
        'ALTER TABLE rooms ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0'
      );
      // อัปเดตอีกครั้ง
      await query(
        'UPDATE rooms SET is_deleted = ? WHERE room_id = ?',
        [isDeleted ? 1 : 0, roomId]
      );
    } else {
      throw error;
    }
  }
}
