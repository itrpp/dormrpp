// app/api/announcements/[id]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import type { Announcement, AnnouncementFile } from '@/types/db';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// GET /api/announcements/[id] - ดึงรายละเอียดประกาศพร้อมไฟล์
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

    // ดึงข้อมูลประกาศ
    let announcement: Announcement | null = null;
    try {
      const [annResult] = await query<Announcement>(
        `SELECT * FROM announcements WHERE announcement_id = ? AND COALESCE(is_deleted, 0) = 0`,
        [announcementId]
      );
      announcement = annResult || null;
    } catch (error: any) {
      // Fallback สำหรับ schema เก่า
      if (error.message?.includes("Unknown column")) {
        const [annResult] = await query<Announcement>(
          `SELECT * FROM announcements WHERE announcement_id = ?`,
          [announcementId]
        );
        announcement = annResult || null;
      } else {
        throw error;
      }
    }

    if (!announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      );
    }

    // ตรวจสอบสิทธิ์การเข้าถึง
    const userRole = session?.role || 'tenant';
    const targetRole = announcement.target_role || announcement.target_audience || 'all';
    
    if (targetRole !== 'all') {
      if (targetRole === 'admin' && userRole !== 'admin' && userRole !== 'superUser') {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
      if (targetRole === 'tenant' && (userRole === 'admin' || userRole === 'superUser')) {
        // Admin สามารถดูได้
      }
    }

    // ตรวจสอบ publishing window (ถ้าไม่ใช่ admin)
    if (userRole !== 'admin' && userRole !== 'superUser') {
      const now = new Date();
      const isPublished = announcement.is_published !== undefined 
        ? announcement.is_published 
        : announcement.is_active;
      
      if (!isPublished) {
        return NextResponse.json(
          { error: 'Announcement not published' },
          { status: 403 }
        );
      }

      if (announcement.publish_start && new Date(announcement.publish_start) > now) {
        return NextResponse.json(
          { error: 'Announcement not yet published' },
          { status: 403 }
        );
      }

      if (announcement.publish_end && new Date(announcement.publish_end) < now) {
        return NextResponse.json(
          { error: 'Announcement expired' },
          { status: 403 }
        );
      }
    }

    // ดึงไฟล์แนบ
    let files: AnnouncementFile[] = [];
    try {
      files = await query<AnnouncementFile>(
        `SELECT * FROM announcement_files WHERE announcement_id = ? ORDER BY created_at ASC`,
        [announcementId]
      );
    } catch (error: any) {
      // ถ้ายังไม่มีตาราง announcement_files ให้ข้าม
      if (!error.message?.includes("doesn't exist")) {
        console.warn('Cannot fetch announcement files:', error.message);
      }
    }

    return NextResponse.json({
      announcement: {
        announcement_id: announcement.announcement_id,
        title: announcement.title,
        content: announcement.content,
        target_role: announcement.target_role || announcement.target_audience || 'all',
        is_published: announcement.is_published !== undefined 
          ? announcement.is_published 
          : announcement.is_active,
        publish_start: announcement.publish_start,
        publish_end: announcement.publish_end,
        created_by_ad_username: announcement.created_by_ad_username,
        created_at: announcement.created_at,
        updated_at: announcement.updated_at,
      },
      files: files.map((file) => ({
        file_id: file.file_id,
        file_name: file.file_name,
        file_type: file.file_type,
        file_size: file.file_size,
        download_url: `/api/announcements/files/${file.file_id}/download`,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching announcement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch announcement' },
      { status: 500 }
    );
  }
}

// PUT /api/announcements/[id] - แก้ไขประกาศ (Admin only)
export async function PUT(
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

    const body = await req.json();
    const { title, content, target_role, is_published, publish_start, publish_end } = body;

    // Validation
    if (publish_start && publish_end && new Date(publish_start) > new Date(publish_end)) {
      return NextResponse.json(
        { error: 'publish_end must be after publish_start' },
        { status: 400 }
      );
    }

    try {
      await query(
        `UPDATE announcements 
         SET title = ?, content = ?, target_role = ?, is_published = ?, 
             publish_start = ?, publish_end = ?, updated_at = NOW()
         WHERE announcement_id = ?`,
        [
          title,
          content,
          target_role || 'all',
          is_published !== undefined ? (is_published ? 1 : 0) : 1,
          publish_start ? new Date(publish_start) : null,
          publish_end ? new Date(publish_end) : null,
          announcementId,
        ]
      );

      return NextResponse.json({ ok: true });
    } catch (error: any) {
      // Fallback สำหรับ schema เก่า
      if (error.message?.includes("Unknown column")) {
        await query(
          `UPDATE announcements 
           SET title = ?, content = ?, target_audience = ?, is_active = ?, updated_at = NOW()
           WHERE announcement_id = ?`,
          [
            title,
            content,
            target_role || 'all',
            is_published !== undefined ? (is_published ? 1 : 0) : 1,
            announcementId,
          ]
        );
        return NextResponse.json({ ok: true });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error updating announcement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update announcement' },
      { status: 500 }
    );
  }
}

// DELETE /api/announcements/[id] - ลบประกาศ (Admin only, soft delete)
export async function DELETE(
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

    try {
      // Soft delete
      await query(
        `UPDATE announcements SET is_deleted = 1, updated_at = NOW() WHERE announcement_id = ?`,
        [announcementId]
      );
    } catch (error: any) {
      // ถ้ายังไม่มี is_deleted column ให้ hard delete
      if (error.message?.includes("Unknown column")) {
        await query(
          `DELETE FROM announcements WHERE announcement_id = ?`,
          [announcementId]
        );
      } else {
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting announcement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete announcement' },
      { status: 500 }
    );
  }
}

