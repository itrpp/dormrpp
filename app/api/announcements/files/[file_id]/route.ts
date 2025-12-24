// app/api/announcements/files/[file_id]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AnnouncementFile } from '@/types/db';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// DELETE /api/announcements/files/[file_id] - ลบไฟล์ (Admin only)
export async function DELETE(
  req: Request,
  { params }: { params: { file_id: string } }
) {
  try {
    const session = await getSession();
    
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

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

    // ลบไฟล์จาก disk
    const filePath = join(process.cwd(), 'uploads', file.file_path);
    if (existsSync(filePath)) {
      try {
        await unlink(filePath);
      } catch (error: any) {
        console.warn('Failed to delete file from disk:', error.message);
        // ยังคงลบ record ใน DB แม้ลบไฟล์ไม่สำเร็จ
      }
    }

    // ลบ record จาก database
    try {
      await query(
        `DELETE FROM announcement_files WHERE file_id = ?`,
        [fileId]
      );
    } catch (error: any) {
      if (error.message?.includes("doesn't exist")) {
        // ถ้ายังไม่มีตารางก็ไม่ต้องทำอะไร
        return NextResponse.json({ ok: true });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete file' },
      { status: 500 }
    );
  }
}

