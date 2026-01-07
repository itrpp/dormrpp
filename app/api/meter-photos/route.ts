// app/api/meter-photos/route.ts
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getUtilityTypeId } from '@/lib/repositories/bills';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// กำหนด allowed file types และ max size สำหรับรูปมิเตอร์
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/meter-photos - อัปโหลดรูปมิเตอร์ (Admin only)
export async function POST(req: Request) {
  try {
    const session = await getSession();
    
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const photo = formData.get('photo') as File | null;
    const room_id = formData.get('room_id');
    const utility_type = formData.get('utility_type');
    const meter_value = formData.get('meter_value');
    const billing_year = formData.get('billing_year');
    const billing_month = formData.get('billing_month');
    const reading_date = formData.get('reading_date');

    // Validation
    if (!photo || !(photo instanceof File)) {
      return NextResponse.json(
        { error: 'กรุณาเลือกรูปภาพ' },
        { status: 400 }
      );
    }

    if (!room_id || !utility_type || !meter_value || !billing_year || !billing_month || !reading_date) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน กรุณากรอกข้อมูลให้ครบ' },
        { status: 400 }
      );
    }

    // ตรวจสอบ file type
    if (!ALLOWED_TYPES.includes(photo.type)) {
      return NextResponse.json(
        { error: 'รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WebP)' },
        { status: 400 }
      );
    }

    // ตรวจสอบ file size
    if (photo.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'ขนาดไฟล์เกิน 10MB' },
        { status: 400 }
      );
    }

    // ตรวจสอบ utility_type
    if (utility_type !== 'electric' && utility_type !== 'water') {
      return NextResponse.json(
        { error: 'utility_type ต้องเป็น electric หรือ water' },
        { status: 400 }
      );
    }

    // แปลงค่า
    const roomId = Number(room_id);
    const meterValue = Number(meter_value);
    const billingYear = Number(billing_year);
    const billingMonth = Number(billing_month);

    if (isNaN(roomId) || isNaN(meterValue) || isNaN(billingYear) || isNaN(billingMonth)) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบ' },
        { status: 400 }
      );
    }

    // ตรวจสอบว่า room มีอยู่จริง
    const [room] = await query<{ room_id: number }>(
      `SELECT room_id FROM rooms WHERE room_id = ?`,
      [roomId]
    );

    if (!room) {
      return NextResponse.json(
        { error: 'ไม่พบห้องที่ระบุ' },
        { status: 404 }
      );
    }

    // สร้างโฟลเดอร์สำหรับเก็บรูปมิเตอร์
    const uploadDir = join(process.cwd(), 'uploads', 'meters');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // สร้างโฟลเดอร์ตามปี-เดือน (ใช้ billing_year และ billing_month)
    const yearMonth = `${billingYear}-${String(billingMonth).padStart(2, '0')}`;
    const monthDir = join(uploadDir, yearMonth);
    if (!existsSync(monthDir)) {
      await mkdir(monthDir, { recursive: true });
    }

    // สร้างชื่อไฟล์ที่ปลอดภัย
    const timestamp = Date.now();
    const safeFileName = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileExtension = safeFileName.split('.').pop() || 'jpg';
    const fileName = `${roomId}_${utility_type}_${timestamp}.${fileExtension}`;
    const filePath = join(monthDir, fileName);

    // อ่านไฟล์และบันทึก
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // บันทึกข้อมูลในฐานข้อมูล
    const relativePath = `meters/${yearMonth}/${fileName}`;
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // บันทึกรูปภาพ
      const [result] = await connection.query(
        `INSERT INTO meter_photos 
         (room_id, utility_type, meter_value, photo_path, reading_date, billing_year, billing_month, created_by_ad_username, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          roomId,
          utility_type,
          meterValue,
          relativePath,
          reading_date,
          billingYear,
          billingMonth,
          session.username || null,
        ]
      );

      const insertId = (result as any).insertId;

      // ดึง cycle_id จาก billing_year และ billing_month
      const [cycle] = await connection.query(
        `SELECT cycle_id FROM billing_cycles 
         WHERE billing_year = ? AND billing_month = ?`,
        [billingYear, billingMonth]
      );

      const cycles = cycle as any[];
      if (cycles.length > 0) {
        const cycleId = cycles[0].cycle_id;
        
        // ดึง utility_type_id
        const utilityTypeId = await getUtilityTypeId(utility_type);
        
        if (utilityTypeId) {
          // ตรวจสอบว่ามี bill_utility_readings สำหรับ room_id, cycle_id, utility_type_id หรือไม่
          const [existingReading] = await connection.query(
            `SELECT reading_id, meter_start, meter_end 
             FROM bill_utility_readings 
             WHERE room_id = ? AND cycle_id = ? AND utility_type_id = ?`,
            [roomId, cycleId, utilityTypeId]
          );

          const readings = existingReading as any[];
          
          if (readings.length > 0) {
            // ถ้ามีอยู่แล้ว ให้อัปเดต meter_end
            const existing = readings[0];
            await connection.query(
              `UPDATE bill_utility_readings 
               SET meter_end = ? 
               WHERE reading_id = ?`,
              [meterValue, existing.reading_id]
            );
          } else {
            // ถ้ายังไม่มี ให้ดึง meter_start จากรอบก่อนหน้า
            const [previousReading] = await connection.query(
              `SELECT bur.meter_end 
               FROM bill_utility_readings bur
               JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
               WHERE bur.room_id = ? 
                 AND bur.utility_type_id = ?
                 AND bur.meter_end IS NOT NULL
                 AND (
                   bc.billing_year < ?
                   OR (bc.billing_year = ? AND bc.billing_month < ?)
                 )
               ORDER BY bc.billing_year DESC, bc.billing_month DESC
               LIMIT 1`,
              [roomId, utilityTypeId, billingYear, billingYear, billingMonth]
            );

            const previousReadings = previousReading as any[];
            const meterStart = previousReadings.length > 0 
              ? previousReadings[0].meter_end 
              : meterValue; // ถ้าไม่มีรอบก่อนหน้า ให้ใช้ meter_value เป็น meter_start

            // สร้าง bill_utility_readings ใหม่
            await connection.query(
              `INSERT INTO bill_utility_readings 
               (room_id, cycle_id, utility_type_id, meter_start, meter_end)
               VALUES (?, ?, ?, ?, ?)`,
              [roomId, cycleId, utilityTypeId, meterStart, meterValue]
            );
          }
        }
      }

      await connection.commit();
      connection.release();

      return NextResponse.json({
        message: 'อัปโหลดรูปมิเตอร์สำเร็จ',
        photo_id: insertId,
        photo_path: relativePath,
      }, { status: 201 });
    } catch (dbError: any) {
      // ถ้า database error ให้ rollback transaction และลบไฟล์ที่อัปโหลดแล้ว
      try {
        if (connection) {
          await connection.rollback();
          connection.release();
        }
      } catch (rollbackError) {
        // Ignore rollback error
      }
      try {
        const fs = await import('fs/promises');
        await fs.unlink(filePath);
      } catch (unlinkError) {
        // Ignore unlink error
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Error uploading meter photo:', error);
    return NextResponse.json(
      { error: error.message || 'ไม่สามารถอัปโหลดรูปมิเตอร์ได้' },
      { status: 500 }
    );
  }
}

// GET /api/meter-photos?room_id=302&year=2025&month=10
// ดึงรูปมิเตอร์ตาม room_id, year, month
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const room_id = searchParams.get('room_id');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const utility_type = searchParams.get('utility_type'); // optional filter

    let sql = `
      SELECT 
        mp.photo_id,
        mp.room_id,
        mp.contract_id,
        mp.bill_id,
        mp.utility_type,
        mp.meter_value,
        mp.photo_path,
        mp.reading_date,
        mp.billing_year,
        mp.billing_month,
        mp.created_by_ad_username,
        mp.created_at,
        r.room_number,
        b.name_th AS building_name
      FROM meter_photos mp
      JOIN rooms r ON mp.room_id = r.room_id
      JOIN buildings b ON r.building_id = b.building_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (room_id) {
      sql += ' AND mp.room_id = ?';
      params.push(Number(room_id));
    }

    if (year) {
      sql += ' AND mp.billing_year = ?';
      params.push(Number(year));
    }

    if (month) {
      sql += ' AND mp.billing_month = ?';
      params.push(Number(month));
    }

    if (utility_type && (utility_type === 'electric' || utility_type === 'water')) {
      sql += ' AND mp.utility_type = ?';
      params.push(utility_type);
    }

    sql += ' ORDER BY mp.reading_date DESC, mp.utility_type';

    const photos = await query(sql, params);
    return NextResponse.json(photos);
  } catch (error: any) {
    console.error('Error fetching meter photos:', error);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงข้อมูลรูปมิเตอร์ได้' },
      { status: 500 }
    );
  }
}

