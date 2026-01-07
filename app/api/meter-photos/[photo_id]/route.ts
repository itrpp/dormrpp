// app/api/meter-photos/[photo_id]/route.ts
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getUtilityTypeId } from '@/lib/repositories/bills';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// PATCH /api/meter-photos/[photo_id] - อัปเดตค่ามิเตอร์ (Admin only)
export async function PATCH(
  req: Request,
  { params }: { params: { photo_id: string } }
) {
  const connection = await pool.getConnection();
  
  try {
    const session = await getSession();
    
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      connection.release();
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const photoId = parseInt(params.photo_id, 10);
    
    if (isNaN(photoId)) {
      connection.release();
      return NextResponse.json(
        { error: 'Invalid photo ID' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { meter_value } = body;

    if (!meter_value || isNaN(Number(meter_value))) {
      connection.release();
      return NextResponse.json(
        { error: 'meter_value is required and must be a number' },
        { status: 400 }
      );
    }

    const meterValue = Number(meter_value);

    await connection.beginTransaction();

    // ดึงข้อมูลรูปจากฐานข้อมูล
    const [photoRows] = await connection.query(
      `SELECT photo_id, room_id, utility_type, billing_year, billing_month, bill_id 
       FROM meter_photos 
       WHERE photo_id = ?`,
      [photoId]
    );

    const photos = photoRows as any[];
    if (photos.length === 0) {
      await connection.rollback();
      connection.release();
      return NextResponse.json(
        { error: 'ไม่พบรูปมิเตอร์ที่ระบุ' },
        { status: 404 }
      );
    }

    const photoData = photos[0];

    // ตรวจสอบว่ามีบิลผูกอยู่หรือไม่ (ถ้ามีบิลแล้วห้ามแก้ไข)
    if (photoData.bill_id) {
      await connection.rollback();
      connection.release();
      return NextResponse.json(
        { error: 'ไม่สามารถแก้ไขค่ามิเตอร์ได้ เนื่องจากรูปนี้ถูกผูกกับบิลแล้ว' },
        { status: 400 }
      );
    }

    // อัปเดต meter_value ใน meter_photos
    await connection.query(
      `UPDATE meter_photos 
       SET meter_value = ? 
       WHERE photo_id = ?`,
      [meterValue, photoId]
    );

    // ดึง cycle_id จาก billing_year และ billing_month
    const [cycle] = await connection.query(
      `SELECT cycle_id FROM billing_cycles 
       WHERE billing_year = ? AND billing_month = ?`,
      [photoData.billing_year, photoData.billing_month]
    );

    const cycles = cycle as any[];
    if (cycles.length > 0) {
      const cycleId = cycles[0].cycle_id;
      
      // ดึง utility_type_id
      const utilityTypeId = await getUtilityTypeId(photoData.utility_type);
      
      if (utilityTypeId) {
        // ตรวจสอบว่ามี bill_utility_readings สำหรับ room_id, cycle_id, utility_type_id หรือไม่
        const [existingReading] = await connection.query(
          `SELECT reading_id, meter_start, meter_end 
           FROM bill_utility_readings 
           WHERE room_id = ? AND cycle_id = ? AND utility_type_id = ?`,
          [photoData.room_id, cycleId, utilityTypeId]
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
            [photoData.room_id, utilityTypeId, photoData.billing_year, photoData.billing_year, photoData.billing_month]
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
            [photoData.room_id, cycleId, utilityTypeId, meterStart, meterValue]
          );
        }
      }
    }

    await connection.commit();
    connection.release();

    return NextResponse.json({
      message: 'อัปเดตค่ามิเตอร์สำเร็จ',
      photo_id: photoId,
      meter_value: meterValue,
    });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error updating meter value:', error);
    return NextResponse.json(
      { error: error.message || 'ไม่สามารถอัปเดตค่ามิเตอร์ได้' },
      { status: 500 }
    );
  }
}

// DELETE /api/meter-photos/[photo_id] - ลบรูปมิเตอร์ (Admin only)
export async function DELETE(
  req: Request,
  { params }: { params: { photo_id: string } }
) {
  try {
    const session = await getSession();
    
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const photoId = parseInt(params.photo_id, 10);
    
    if (isNaN(photoId)) {
      return NextResponse.json(
        { error: 'Invalid photo ID' },
        { status: 400 }
      );
    }

    // ดึงข้อมูลรูปจากฐานข้อมูล
    const [photo] = await query<{
      photo_id: number;
      photo_path: string;
      bill_id: number | null;
      room_id: number;
      billing_year: number;
      billing_month: number;
    }>(
      `SELECT photo_id, photo_path, bill_id, room_id, billing_year, billing_month 
       FROM meter_photos 
       WHERE photo_id = ?`,
      [photoId]
    );

    if (!photo) {
      return NextResponse.json(
        { error: 'ไม่พบรูปมิเตอร์ที่ระบุ' },
        { status: 404 }
      );
    }

    // ตรวจสอบว่ามีบิลผูกอยู่หรือไม่ (ถ้ามีบิลแล้วห้ามลบ)
    if (photo.bill_id) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบรูปได้ เนื่องจากรูปนี้ถูกผูกกับบิลแล้ว' },
        { status: 400 }
      );
    }

    // ลบไฟล์รูปภาพ
    const filePath = join(process.cwd(), 'uploads', photo.photo_path);
    if (existsSync(filePath)) {
      try {
        await unlink(filePath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
        // ยังคงลบข้อมูลในฐานข้อมูลต่อ แม้ไฟล์ลบไม่ได้
      }
    }

    // ลบข้อมูลในฐานข้อมูล
    await pool.query(
      `DELETE FROM meter_photos WHERE photo_id = ?`,
      [photoId]
    );

    return NextResponse.json({
      message: 'ลบรูปมิเตอร์สำเร็จ',
    });
  } catch (error: any) {
    console.error('Error deleting meter photo:', error);
    return NextResponse.json(
      { error: error.message || 'ไม่สามารถลบรูปมิเตอร์ได้' },
      { status: 500 }
    );
  }
}

