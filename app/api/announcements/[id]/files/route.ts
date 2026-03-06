// app/api/announcements/[id]/files/route.ts
// อัปโหลดไฟล์: ต้องตั้ง body size ที่ next.config (serverActions.bodySizeLimit, proxyClientMaxBodySize)
// ถ้า deploy หลัง Nginx: เพิ่ม client_max_body_size 50m; ใน server หรือ http block
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireAppRoles } from '@/lib/auth/middleware';
import type { AppRoleCode } from '@/lib/auth/app-roles';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AnnouncementFile } from '@/types/db';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

const ANNOUNCEMENT_ADMIN_ROLES: AppRoleCode[] = ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'];

// กำหนด allowed file types และ max size (รองรับ MIME ที่เบราว์เซอร์ส่งต่างกัน)
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg', // บางเบราว์เซอร์ส่ง JPEG แบบนี้
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx'];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// GET /api/announcements/[id]/files - ดึงรายการไฟล์
// Admin สามารถดูไฟล์ได้ทุก announcement
// Tenant สามารถดูไฟล์ได้เฉพาะ announcement ที่ published แล้ว
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    const announcementId = parseInt(params.id, 10);
    
    if (isNaN(announcementId)) {
      return NextResponse.json(
        { error: 'Invalid announcement ID' },
        { status: 400 }
      );
    }

    // Admin (session หรือ app role) เห็นไฟล์ทุกประกาศ; คนอื่นเห็นเฉพาะที่ published
    const appAuth = session ? await requireAppRoles(ANNOUNCEMENT_ADMIN_ROLES) : { authorized: false };
    const isAdmin = session && (session.role === 'admin' || session.role === 'superUser' || appAuth.authorized);
    if (!isAdmin) {
      try {
        const [announcement] = await query<{ status?: string | null; is_published?: number | null }>(
          `SELECT status, is_published FROM announcements WHERE announcement_id = ?`,
          [announcementId]
        );

        if (!announcement) {
          return NextResponse.json(
            { error: 'Announcement not found' },
            { status: 404 }
          );
        }

        const isPublished = announcement.status === 'published' ||
                           (announcement.status === null && Boolean(announcement.is_published));

        if (!isPublished) {
          return NextResponse.json(
            { error: 'Announcement not published' },
            { status: 404 }
          );
        }
      } catch (error: any) {
        return NextResponse.json(
          { error: 'Failed to fetch files' },
          { status: 500 }
        );
      }
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

function isFileAllowed(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (ALLOWED_MIME_TYPES.includes(type)) return true;
  if (!type || type === 'application/octet-stream') {
    return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  }
  return false;
}

// POST /api/announcements/[id]/files - อัปโหลดไฟล์ (Admin / ผู้จัดการประกาศ)
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const appAuth = await requireAppRoles(ANNOUNCEMENT_ADMIN_ROLES);
    const legacyAdmin = session.role === 'admin' || session.role === 'superUser';
    if (!appAuth.authorized && !legacyAdmin) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์อัปโหลดไฟล์ประกาศ' },
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

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const bodyTooLarge =
        /body|413|payload|too large|limit|size|exceeded/i.test(msg);
      console.error('[announcements/files] formData error:', msg);
      return NextResponse.json(
        {
          error: bodyTooLarge
            ? 'ขนาดไฟล์เกินขีดจำกัดของเซิร์ฟเวอร์ (ลองตั้งค่า body size limit ที่ next.config หรือ Nginx client_max_body_size)'
            : 'อ่านข้อมูลฟอร์มไม่สำเร็จ',
        },
        { status: bodyTooLarge ? 413 : 500 }
      );
    }

    const fileEntries = formData.getAll('files');

    // Filter และแปลง FormDataEntryValue เป็น File
    const files = fileEntries.filter((entry): entry is File => entry instanceof File);

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
      if (!isFileAllowed(file)) {
        continue;
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
        // ใช้ pool.query โดยตรงสำหรับ INSERT เพื่อให้ได้ result object ที่มี insertId
        const [result] = await pool.query(
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
        ) as any;

        const insertId = result?.insertId;
        if (!insertId) {
          throw new Error('Failed to get insertId from query result');
        }

        uploadedFiles.push({
          file_id: insertId,
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
        {
          error:
            'ไม่มีไฟล์ที่รองรับ (รองรับ PDF, JPG, PNG, XLSX, DOCX ขนาดไม่เกิน 50MB) หรือประเภทไฟล์ไม่ตรง',
        },
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

