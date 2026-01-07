// app/api/meter-photos/[photo_id]/download/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// GET /api/meter-photos/[photo_id]/download - ดาวน์โหลดรูปมิเตอร์
export async function GET(
  req: Request,
  { params }: { params: { photo_id: string } }
) {
  try {
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
      utility_type: string;
      room_id: number;
      billing_year: number;
      billing_month: number;
    }>(
      `SELECT photo_id, photo_path, utility_type, room_id, billing_year, billing_month 
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

    // สร้าง path ไปยังไฟล์
    const filePath = join(process.cwd(), 'uploads', photo.photo_path);

    // ตรวจสอบว่าไฟล์มีอยู่จริง
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'ไม่พบไฟล์รูปภาพ' },
        { status: 404 }
      );
    }

    // อ่านไฟล์
    const fileBuffer = await readFile(filePath);

    // กำหนด content type จากนามสกุลไฟล์
    const fileExtension = photo.photo_path.split('.').pop()?.toLowerCase();
    let contentType = 'image/jpeg';
    if (fileExtension === 'png') {
      contentType = 'image/png';
    } else if (fileExtension === 'webp') {
      contentType = 'image/webp';
    }

    // Return file
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="meter_${photo.room_id}_${photo.utility_type}_${photo.billing_year}_${photo.billing_month}.${fileExtension}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('Error downloading meter photo:', error);
    return NextResponse.json(
      { error: 'ไม่สามารถดาวน์โหลดรูปมิเตอร์ได้' },
      { status: 500 }
    );
  }
}

