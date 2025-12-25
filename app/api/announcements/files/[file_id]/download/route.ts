// app/api/announcements/files/[file_id]/download/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AnnouncementFile, Announcement } from '@/types/db';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// GET /api/announcements/files/[file_id]/download - ดาวน์โหลดไฟล์ (พร้อม authorization)
export async function GET(
  req: Request,
  { params }: { params: { file_id: string } }
) {
  try {
    const session = await getSession();
    // ไม่ require session - ให้ user ทั่วไปสามารถดาวน์โหลดได้ (แต่จะตรวจสอบ authorization ด้านล่าง)

    const fileId = parseInt(params.file_id, 10);
    if (isNaN(fileId)) {
      return NextResponse.json(
        { error: 'Invalid file ID' },
        { status: 400 }
      );
    }

    // ดึงข้อมูลไฟล์
    let file: AnnouncementFile | null = null;
    try {
      const [fileResult] = await query<AnnouncementFile>(
        `SELECT * FROM announcement_files WHERE file_id = ?`,
        [fileId]
      );
      file = fileResult || null;
    } catch (error: any) {
      if (error.message?.includes("doesn't exist")) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // ดึงข้อมูล announcement เพื่อตรวจสอบสิทธิ์
    let announcement: Announcement | null = null;
    try {
      const [annResult] = await query<Announcement>(
        `SELECT * FROM announcements WHERE announcement_id = ?`,
        [file.announcement_id]
      );
      announcement = annResult || null;
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      );
    }

    if (!announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      );
    }

    // ไม่จำกัดการเข้าถึง - ให้เห็นได้ทุกคน (เฉพาะที่ published)
    // ถ้าไม่ใช่ admin ให้ตรวจสอบว่า published แล้ว
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      // ตรวจสอบ status หรือ is_published (backward compatibility)
      const isPublished = announcement.status === 'published' || 
                         (announcement.status === null && Boolean(announcement.is_published));
      
      if (!isPublished) {
        return NextResponse.json(
          { error: 'Announcement not published' },
          { status: 404 }
        );
      }
      // ไม่ตรวจสอบ target_role, publish_start, publish_end - ให้เห็นได้ทุกคน
    }

    // อ่านไฟล์จาก disk
    const filePath = join(process.cwd(), 'uploads', file.file_path);
    
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found on server' },
        { status: 404 }
      );
    }

    const fileBuffer = await readFile(filePath);

    // ส่งไฟล์กลับพร้อม headers ที่เหมาะสม
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': file.file_type,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.file_name)}"`,
        'Content-Length': file.file_size.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download file' },
      { status: 500 }
    );
  }
}

