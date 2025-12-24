// app/api/announcements/[id]/files/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AnnouncementFile } from '@/types/db';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// กำหนด allowed file types และ max size
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// GET /api/announcements/[id]/files - ดึงรายการไฟล์
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const announcementId = parseInt(params.id, 10);
    if (isNaN(announcementId)) {
      return NextResponse.json(
        { error: 'Invalid announcement ID' },
        { status: 400 }
      );
    }

    try {
      const files = await query<AnnouncementFile>(
        `SELECT * FROM announcement_files WHERE announcement_id = ? ORDER BY created_at ASC`,
        [announcementId]
      );

      return NextResponse.json({
        files: files.map((file) => ({
          file_id: file.file_id,
          file_name: file.file_name,
          file_type: file.file_type,
          file_size: file.file_size,
          download_url: `/api/announcements/files/${file.file_id}/download`,
        })),
      });
    } catch (error: any) {
      if (error.message?.includes("doesn't exist")) {
        return NextResponse.json({ files: [] });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

// POST /api/announcements/[id]/files - อัปโหลดไฟล์ (Admin only)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const announcementId = parseInt(params.id, 10);
    if (isNaN(announcementId)) {
      return NextResponse.json(
        { error: 'Invalid announcement ID' },
        { status: 400 }
      );
    }

    // ตรวจสอบว่า announcement มีอยู่จริง
    const [announcement] = await query<{ announcement_id: number }>(
      `SELECT announcement_id FROM announcements WHERE announcement_id = ?`,
      [announcementId]
    );

    if (!announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      );
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const uploadedFiles: Array<{ file_id: number; file_name: string }> = [];
    const uploadDir = join(process.cwd(), 'uploads', 'announcements');
    
    // สร้างโฟลเดอร์ถ้ายังไม่มี
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // สร้างโฟลเดอร์ตามปี-เดือน
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthDir = join(uploadDir, yearMonth);
    
    if (!existsSync(monthDir)) {
      await mkdir(monthDir, { recursive: true });
    }

    for (const file of files) {
      // ตรวจสอบ file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        continue; // ข้ามไฟล์ที่ไม่รองรับ
      }

      // ตรวจสอบ file size
      if (file.size > MAX_FILE_SIZE) {
        continue; // ข้ามไฟล์ที่ใหญ่เกินไป
      }

      // สร้างชื่อไฟล์ที่ปลอดภัย
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileExtension = safeFileName.split('.').pop() || '';
      const fileName = `${String(uploadedFiles.length + 1).padStart(3, '0')}_${timestamp}_${safeFileName}`;
      const filePath = join(monthDir, fileName);

      // อ่านไฟล์และบันทึก
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filePath, buffer);

      // บันทึกข้อมูลในฐานข้อมูล
      const relativePath = `announcements/${yearMonth}/${fileName}`;
      
      try {
        const [result] = await query<{ insertId: number }>(
          `INSERT INTO announcement_files 
           (announcement_id, file_name, file_path, file_type, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            announcementId,
            file.name, // เก็บชื่อไฟล์เดิม
            relativePath,
            file.type,
            file.size,
          ]
        );

        uploadedFiles.push({
          file_id: result?.insertId,
          file_name: file.name,
        });
      } catch (error: any) {
        // ถ้ายังไม่มีตาราง announcement_files ให้ข้ามการบันทึก DB
        if (error.message?.includes("doesn't exist")) {
          console.warn('announcement_files table does not exist, file saved but not tracked in DB');
          // ยังคงเก็บไฟล์ไว้ แต่ไม่ track ใน DB
        } else {
          // ถ้า error อื่นๆ ให้ลบไฟล์ที่อัปโหลดแล้ว
          try {
            const fs = await import('fs/promises');
            await fs.unlink(filePath);
          } catch {
            // ignore
          }
          throw error;
        }
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'No valid files uploaded' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { files: uploadedFiles },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload files' },
      { status: 500 }
    );
  }
}

