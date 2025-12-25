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

    // ไม่จำกัดการเข้าถึง - ให้เห็นได้ทุกคน (เฉพาะที่ published)
    const isPublished = announcement.status === 'published' || 
                       (announcement.status === null && Boolean(announcement.is_published));
    
    if (!isPublished) {
      // ถ้าไม่ใช่ admin ให้แสดงเฉพาะที่ published
      if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
        return NextResponse.json(
          { error: 'Announcement not published' },
          { status: 404 }
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
    
    // Debug: Log session info
    if (!session) {
      console.log('[PUT /api/announcements/[id]] No session found');
      return NextResponse.json(
        { error: 'Unauthorized: No session' },
        { status: 403 }
      );
    }
    
    console.log('[PUT /api/announcements/[id]] Session:', {
      username: session.username,
      role: session.role,
      name: session.name,
    });
    
    if (session.role !== 'admin' && session.role !== 'superUser') {
      console.log('[PUT /api/announcements/[id]] Unauthorized role:', session.role);
      return NextResponse.json(
        { error: `Unauthorized: Role '${session.role}' is not allowed. Required: admin or superUser` },
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
    const { title, content, target_role, status, is_published, publish_start, publish_end } = body;

    // Validation
    if (publish_start && publish_end && new Date(publish_start) > new Date(publish_end)) {
      return NextResponse.json(
        { error: 'publish_end must be after publish_start' },
        { status: 400 }
      );
    }

    // กำหนด status อัตโนมัติถ้าไม่ได้ระบุ (รองรับ backward compatibility)
    let finalStatus: string | null = status || null;
    if (!status && is_published !== undefined) {
      // Backward compatibility: ถ้าใช้ is_published แทน status
      const now = new Date();
      if (publish_start && new Date(publish_start) > now) {
        finalStatus = 'scheduled';
      } else if (is_published) {
        finalStatus = 'published';
      } else {
        finalStatus = 'draft';
      }
    }

    try {
      // รองรับทั้ง status และ is_published (backward compatibility)
      await query(
        `UPDATE announcements 
         SET title = ?, content = ?, target_role = ?, 
             ${finalStatus !== null ? 'status = ?,' : ''}
             is_published = ?, 
             publish_start = ?, publish_end = ?, updated_at = NOW()
         WHERE announcement_id = ?`,
        [
          title,
          content,
          target_role || 'all',
          ...(finalStatus !== null ? [finalStatus] : []),
          is_published !== undefined ? (is_published ? 1 : 0) : (finalStatus === 'published' || finalStatus === 'scheduled' ? 1 : 0),
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
    
    // Debug: Log session info
    if (!session) {
      console.log('[DELETE /api/announcements/[id]] No session found');
      return NextResponse.json(
        { error: 'Unauthorized: No session' },
        { status: 403 }
      );
    }
    
    console.log('[DELETE /api/announcements/[id]] Session:', {
      username: session.username,
      role: session.role,
      name: session.name,
    });
    
    if (session.role !== 'admin' && session.role !== 'superUser') {
      console.log('[DELETE /api/announcements/[id]] Unauthorized role:', session.role);
      return NextResponse.json(
        { error: `Unauthorized: Role '${session.role}' is not allowed. Required: admin or superUser` },
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

