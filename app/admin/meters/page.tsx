// app/admin/meters/page.tsx - หน้ามิเตอร์น้ำและไฟฟ้า (public/admin)
import { query } from '@/lib/db';
import MetersClient from './MetersClient';

// ฟังก์ชันดึงรอบบิลทั้งหมด
async function getBillingCycles() {
  try {
    const cycles = await query<any>(
      `SELECT 
        cycle_id,
        billing_year,
        billing_month,
        start_date,
        end_date,
        due_date,
        status
      FROM billing_cycles
      ORDER BY billing_year DESC, billing_month DESC
      LIMIT 24`
    );
    return cycles;
  } catch (error: any) {
    console.error('Error fetching billing cycles:', error);
    return [];
  }
}

// ฟังก์ชันดึงห้องทั้งหมด
async function getRooms() {
  try {
    const rooms = await query<any>(
      `SELECT 
        r.room_id,
        r.room_number,
        r.floor_no,
        b.name_th AS building_name,
        b.building_id
      FROM rooms r
      JOIN buildings b ON r.building_id = b.building_id
      WHERE COALESCE(r.is_deleted, 0) = 0
      ORDER BY b.name_th, r.room_number`
    );
    return rooms;
  } catch (error: any) {
    console.error('Error fetching rooms:', error);
    return [];
  }
}

// ฟังก์ชันดึงข้อมูลมิเตอร์ของรอบบิลและห้องที่เลือก
async function getMeterReadings(cycleId?: number, roomId?: number) {
  try {
    // ตรวจสอบว่ามี utility_types ที่มี code = 'water' หรือ 'electric' หรือไม่
    const utilityTypes = await query<any>(
      `SELECT utility_type_id, code, name_th 
       FROM utility_types 
       WHERE code IN ('water', 'electric')`
    );
    
    if (!utilityTypes || utilityTypes.length === 0) {
      return [];
    }

    const utilityTypeIds = utilityTypes.map((ut: any) => ut.utility_type_id);

    let sql = `
      SELECT 
        bur.reading_id,
        bur.room_id,
        bur.cycle_id,
        bur.meter_start,
        bur.meter_end,
        (bur.meter_end - bur.meter_start) as \`usage\`,
        bc.billing_year,
        bc.billing_month,
        r.room_number,
        r.floor_no,
        b.name_th AS building_name,
        ut.code AS utility_code,
        ut.name_th AS utility_name,
        ut.utility_type_id
      FROM bill_utility_readings bur
      INNER JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
      INNER JOIN rooms r ON bur.room_id = r.room_id
      INNER JOIN buildings b ON r.building_id = b.building_id
      INNER JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
      WHERE COALESCE(r.is_deleted, 0) = 0
        AND bur.utility_type_id IN (${utilityTypeIds.map(() => '?').join(',')})
    `;
    const params: any[] = [...utilityTypeIds];

    if (cycleId) {
      sql += ' AND bur.cycle_id = ?';
      params.push(cycleId);
    }

    if (roomId) {
      sql += ' AND bur.room_id = ?';
      params.push(roomId);
    }

    sql += ' ORDER BY bc.billing_year DESC, bc.billing_month DESC, b.name_th, r.room_number, ut.code';

    const readings = await query<any>(sql, params);
    
    return readings || [];
  } catch (error: any) {
    console.error('Error fetching meter readings:', error);
    console.error('SQL Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
    });
    return [];
  }
}

export default async function MetersPage() {
  const cycles = await getBillingCycles();
  const rooms = await getRooms();
  let initialReadings = await getMeterReadings();

  // ถ้าไม่มีข้อมูล ลองตรวจสอบว่ามีข้อมูลในตารางหรือไม่
  if (!initialReadings || initialReadings.length === 0) {
    try {
      // ตรวจสอบว่ามีข้อมูลใน bill_utility_readings หรือไม่
      const [countResult] = await query<any>('SELECT COUNT(*) as total FROM bill_utility_readings');
      const totalReadings = countResult?.total || 0;

      if (totalReadings > 0) {
        // ลอง query แบบง่ายๆ (ไม่ใช้ JOIN หลายตาราง)
        const simpleReadings = await query<any>(
          `SELECT 
            bur.reading_id,
            bur.room_id,
            bur.cycle_id,
            bur.meter_start,
            bur.meter_end,
            (bur.meter_end - bur.meter_start) as \`usage\`,
            bur.utility_type_id
          FROM bill_utility_readings bur
          ORDER BY bur.cycle_id DESC, bur.room_id, bur.utility_type_id
          LIMIT 100`
        );

        if (simpleReadings && simpleReadings.length > 0) {
          // ตรวจสอบ utility_types
          const utilityTypes = await query<any>('SELECT utility_type_id, code, name_th FROM utility_types');

          // ลองดึงข้อมูลเพิ่มเติม
          const readingsWithDetails = await Promise.all(
            simpleReadings.map(async (r: any) => {
              try {
                const [cycle] = await query<any>(
                  'SELECT billing_year, billing_month FROM billing_cycles WHERE cycle_id = ?',
                  [r.cycle_id]
                );
                const [room] = await query<any>(
                  `SELECT r.room_number, r.floor_no, b.name_th AS building_name
                   FROM rooms r
                   JOIN buildings b ON r.building_id = b.building_id
                   WHERE r.room_id = ?`,
                  [r.room_id]
                );
                const [utility] = await query<any>(
                  'SELECT code AS utility_code, name_th AS utility_name FROM utility_types WHERE utility_type_id = ?',
                  [r.utility_type_id]
                );

                // ตรวจสอบว่าเป็น water หรือ electric
                const utilityCode = utility?.utility_code || '';
                if (utilityCode !== 'water' && utilityCode !== 'electric') {
                  return null; // ข้าม utility types อื่นๆ
                }

                return {
                  ...r,
                  billing_year: cycle?.billing_year || 0,
                  billing_month: cycle?.billing_month || 0,
                  room_number: room?.room_number || '',
                  floor_no: room?.floor_no || null,
                  building_name: room?.building_name || '',
                  utility_code: utilityCode,
                  utility_name: utility?.utility_name || '',
                };
              } catch (err) {
                console.error('Error fetching details for reading:', r.reading_id, err);
                return null;
              }
            })
          );

          initialReadings = readingsWithDetails.filter((r) => r !== null && r !== undefined);
        }
      }
    } catch (error: any) {
      // Silent fail
    }
  }

  // ไม่ต้องใช้ AdminLayoutClient เพราะ app/admin/layout.tsx จะ wrap ให้อยู่แล้ว
  return (
    <MetersClient
      initialCycles={cycles || []}
      initialRooms={rooms || []}
      initialReadings={initialReadings || []}
    />
  );
}

