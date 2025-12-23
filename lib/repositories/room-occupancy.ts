// lib/repositories/room-occupancy.ts
// ฟังก์ชันสำหรับจัดการและตรวจสอบจำนวนผู้เข้าพักต่อห้อง

import { query, queryOne } from '@/lib/db';

export interface RoomOccupancyInfo {
  room_id: number;
  room_number: string;
  building_name: string;
  room_type_id: number | null;
  room_type_name: string | null;
  max_occupants: number;
  current_occupants: number;
  occupancy_status: 'empty' | 'available' | 'full';
}

/**
 * ตรวจสอบจำนวนผู้เข้าพักปัจจุบันของห้อง
 * @param roomId - ID ของห้อง
 * @returns จำนวนผู้เข้าพักปัจจุบัน (active contracts)
 */
export async function getCurrentOccupants(roomId: number): Promise<number> {
  const result = await queryOne<{ count: number }>(
    `
    SELECT COUNT(*) AS count
    FROM contracts
    WHERE room_id = ? AND status = 'active'
    `,
    [roomId]
  );
  return result?.count || 0;
}

/**
 * ดึงข้อมูล max_occupants ของห้อง
 * @param roomId - ID ของห้อง
 * @returns จำนวนผู้เข้าพักสูงสุด (default = 2 ถ้าไม่มี room_type)
 */
export async function getMaxOccupants(roomId: number): Promise<number> {
  try {
    const result = await queryOne<{ max_occupants: number }>(
      `
      SELECT COALESCE(rt.max_occupants, 2) AS max_occupants
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.room_type_id
      WHERE r.room_id = ?
      `,
      [roomId]
    );
    return result?.max_occupants || 2;
  } catch (error: any) {
    // ถ้าตาราง room_types ยังไม่มี ให้ return default
    if (error.message?.includes('room_types') || error.message?.includes('room_type_id')) {
      return 2;
    }
    throw error;
  }
}

/**
 * ตรวจสอบว่าห้องสามารถเพิ่มผู้เข้าพักได้หรือไม่
 * @param roomId - ID ของห้อง
 * @param excludeContractId - contract_id ที่จะไม่นับ (สำหรับกรณี update)
 * @returns { canAdd: boolean, currentOccupants: number, maxOccupants: number, message?: string }
 */
export async function checkRoomAvailability(
  roomId: number,
  excludeContractId?: number
): Promise<{
  canAdd: boolean;
  currentOccupants: number;
  maxOccupants: number;
  roomTypeName: string;
  message?: string;
}> {
  // ดึงข้อมูลห้องพร้อม max_occupants จาก room_types
  try {
    const roomInfo = await queryOne<{
      max_occupants: number;
      room_type_name: string;
      room_number: string;
    }>(
      `
      SELECT 
        COALESCE(
          (SELECT max_occupants FROM room_types 
           WHERE id = r.room_type_id 
           LIMIT 1),
          2
        ) AS max_occupants,
        COALESCE(
          (SELECT name_type 
           FROM room_types 
           WHERE id = r.room_type_id 
           LIMIT 1),
          'ห้องปกติ'
        ) AS room_type_name,
        r.room_number
      FROM rooms r
      WHERE r.room_id = ?
      `,
      [roomId]
    );

    if (!roomInfo) {
      throw new Error('ไม่พบข้อมูลห้อง');
    }

    const maxOccupants = roomInfo.max_occupants;
    const roomTypeName = roomInfo.room_type_name;

  // นับจำนวนผู้เข้าพักปัจจุบัน
  let sql = `
    SELECT COUNT(*) AS count
    FROM contracts
    WHERE room_id = ? AND status = 'active'
  `;
  const params: any[] = [roomId];

  if (excludeContractId) {
    sql += ' AND contract_id != ?';
    params.push(excludeContractId);
  }

  const countResult = await queryOne<{ count: number }>(sql, params);
  const currentOccupants = countResult?.count || 0;

    const canAdd = currentOccupants < maxOccupants;

    return {
      canAdd,
      currentOccupants,
      maxOccupants,
      roomTypeName,
      message: canAdd
        ? undefined
        : `ห้อง ${roomInfo.room_number} มีผู้เข้าพักครบจำนวนแล้ว (${currentOccupants} / ${maxOccupants} คน - ประเภท: ${roomTypeName})`,
    };
  } catch (error: any) {
    // Fallback: ถ้าไม่มี room_types ให้ใช้ default
    if (error.message?.includes('room_types') || error.message?.includes('room_type_id')) {
      const roomInfo = await queryOne<{ room_number: string }>(
        'SELECT room_number FROM rooms WHERE room_id = ?',
        [roomId]
      );
      if (!roomInfo) {
        throw new Error('ไม่พบข้อมูลห้อง');
      }
      const maxOccupants = 2;
      const roomTypeName = 'ห้องปกติ';

      let sql = `
        SELECT COUNT(*) AS count
        FROM contracts
        WHERE room_id = ? AND status = 'active'
      `;
      const params: any[] = [roomId];

      if (excludeContractId) {
        sql += ' AND contract_id != ?';
        params.push(excludeContractId);
      }

      const countResult = await queryOne<{ count: number }>(sql, params);
      const currentOccupants = countResult?.count || 0;
      const canAdd = currentOccupants < maxOccupants;

      return {
        canAdd,
        currentOccupants,
        maxOccupants,
        roomTypeName,
        message: canAdd
          ? undefined
          : `ห้อง ${roomInfo.room_number} มีผู้เข้าพักครบจำนวนแล้ว (${currentOccupants} / ${maxOccupants} คน - ประเภท: ${roomTypeName})`,
      };
    }
    throw error;
  }
}

/**
 * ดึงข้อมูลสถานะผู้เข้าพักของห้องทั้งหมด
 * ดึง max_occupants จาก room_types (fallback เป็น 2 ถ้าไม่มี)
 */
export async function getAllRoomsOccupancy(
  buildingId?: number
): Promise<RoomOccupancyInfo[]> {
  try {
    // ใช้ subquery เพื่อดึง max_occupants จาก room_types โดยตรง (รองรับทั้ง room_type_id และ id)
    // ใช้ subquery แทน JOIN เพื่อให้แน่ใจว่าได้ค่าถูกต้องแม้ JOIN ไม่ match
    let sql = `
      SELECT 
        r.room_id,
        r.room_number,
        r.building_id,
        b.name_th AS building_name,
        r.floor_no,
        r.room_type_id,
        COALESCE(
          (SELECT name_type 
           FROM room_types 
           WHERE id = r.room_type_id 
           LIMIT 1),
          'ห้องปกติ'
        ) AS room_type_name,
        COALESCE(
          (SELECT max_occupants FROM room_types 
           WHERE id = r.room_type_id 
           LIMIT 1),
          2
        ) AS max_occupants,
        COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS current_occupants,
        CASE 
          WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) >= COALESCE(
            (SELECT max_occupants FROM room_types 
             WHERE id = r.room_type_id 
             LIMIT 1),
            2
          ) THEN 'full'
          WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) = 0 THEN 'empty'
          ELSE 'available'
        END AS occupancy_status
      FROM rooms r
      JOIN buildings b ON r.building_id = b.building_id
      LEFT JOIN contracts c ON r.room_id = c.room_id
    `;
    const params: any[] = [];

    if (buildingId) {
      sql += ' WHERE r.building_id = ?';
      params.push(buildingId);
    }

    sql += `
      GROUP BY r.room_id, r.room_number, r.building_id, b.name_th, r.floor_no, r.room_type_id
      ORDER BY r.building_id, r.floor_no, CAST(r.room_number AS UNSIGNED), r.room_number
    `;

    const results = await query<RoomOccupancyInfo>(sql, params);
    
    return results;
  } catch (error: any) {
    // Fallback: ถ้าไม่มี room_types ให้ใช้ default
    if (error.message?.includes('room_types') || error.message?.includes('room_type_id')) {
      let sql = `
        SELECT 
          r.room_id,
          r.room_number,
          r.building_id,
          b.name_th AS building_name,
          r.floor_no,
          NULL AS room_type_id,
          NULL AS room_type_name,
          2 AS max_occupants,
          COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS current_occupants,
          CASE 
            WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) >= 2 THEN 'full'
            WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) = 0 THEN 'empty'
            ELSE 'available'
          END AS occupancy_status
        FROM rooms r
        JOIN buildings b ON r.building_id = b.building_id
        LEFT JOIN contracts c ON r.room_id = c.room_id
      `;
      const params: any[] = [];

      if (buildingId) {
        sql += ' WHERE r.building_id = ?';
        params.push(buildingId);
      }

      sql += `
        GROUP BY r.room_id, r.room_number, r.building_id, b.name_th, r.floor_no
        ORDER BY r.building_id, r.floor_no, CAST(r.room_number AS UNSIGNED), r.room_number
      `;

      return query<RoomOccupancyInfo>(sql, params);
    }
    // ถ้า error ไม่ใช่เรื่อง room_types ให้ throw ต่อ
    console.error('Error in getAllRoomsOccupancy:', error);
    throw error;
  }
}

/**
 * ดึงข้อมูลสถานะผู้เข้าพักของห้องเดียว
 * @param roomId - ID ของห้อง
 * @returns ข้อมูลสถานะผู้เข้าพัก
 */
export async function getRoomOccupancy(
  roomId: number
): Promise<RoomOccupancyInfo | null> {
  try {
    // ใช้ subquery เพื่อดึง max_occupants จาก room_types โดยตรง (รองรับทั้ง room_type_id และ id)
    const sql = `
      SELECT 
        r.room_id,
        r.room_number,
        r.building_id,
        b.name_th AS building_name,
        r.floor_no,
        r.room_type_id,
        COALESCE(
          (SELECT name_type 
           FROM room_types 
           WHERE id = r.room_type_id 
           LIMIT 1),
          'ห้องปกติ'
        ) AS room_type_name,
        COALESCE(
          (SELECT max_occupants FROM room_types 
           WHERE id = r.room_type_id 
           LIMIT 1),
          2
        ) AS max_occupants,
        COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS current_occupants,
        CASE 
          WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) >= COALESCE(
            (SELECT max_occupants FROM room_types 
             WHERE id = r.room_type_id 
             LIMIT 1),
            2
          ) THEN 'full'
          WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) = 0 THEN 'empty'
          ELSE 'available'
        END AS occupancy_status
      FROM rooms r
      JOIN buildings b ON r.building_id = b.building_id
      LEFT JOIN contracts c ON r.room_id = c.room_id
      WHERE r.room_id = ?
      GROUP BY r.room_id, r.room_number, r.building_id, b.name_th, r.floor_no, r.room_type_id
    `;

    const result = await queryOne<RoomOccupancyInfo>(sql, [roomId]);
    return result;
  } catch (error: any) {
    // Fallback: ถ้าไม่มี room_types หรือ JOIN error ให้ใช้ default
    if (
      error.message?.includes('room_types') ||
      error.message?.includes('room_type_id') ||
      error.message?.includes('Unknown column')
    ) {
      const sql = `
        SELECT 
          r.room_id,
          r.room_number,
          r.building_id,
          b.name_th AS building_name,
          r.floor_no,
          NULL AS room_type_id,
          NULL AS room_type_name,
          2 AS max_occupants,
          COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS current_occupants,
          CASE 
            WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) >= 2 THEN 'full'
            WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) = 0 THEN 'empty'
            ELSE 'available'
          END AS occupancy_status
        FROM rooms r
        JOIN buildings b ON r.building_id = b.building_id
        LEFT JOIN contracts c ON r.room_id = c.room_id
        WHERE r.room_id = ?
        GROUP BY r.room_id, r.room_number, r.building_id, b.name_th, r.floor_no
      `;

      return queryOne<RoomOccupancyInfo>(sql, [roomId]);
    }
    throw error;
  }
}
