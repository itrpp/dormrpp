// app/api/announcements/[id]/read/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// POST /api/announcements/[id]/read - บันทึกว่าอ่านแล้ว
export async function POST(
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

    // ตรวจสอบว่ามีการอ่านแล้วหรือยัง
    try {
      const [existingRead] = await query<{ read_id: number }>(
        `SELECT read_id FROM announcement_reads 
         WHERE announcement_id = ? 
         AND (tenant_id = ? OR user_ad_username = ?)
         LIMIT 1`,
        [announcementId, session.id, session.username]
      );

      if (existingRead) {
        // อัปเดต read_at
        await query(
          `UPDATE announcement_reads SET read_at = NOW() 
           WHERE read_id = ?`,
          [existingRead.read_id]
        );
      } else {
        // สร้างใหม่
        // ถ้าเป็น regular (tenant) ให้ใช้ tenant_id, ถ้าเป็น admin ให้ใช้ user_ad_username
        if (session.role === 'regular' || !session.role) {
          // พยายามหา tenant_id จาก session หรือใช้ null
          await query(
            `INSERT INTO announcement_reads 
             (announcement_id, tenant_id, user_ad_username, read_at)
             VALUES (?, ?, ?, NOW())`,
            [announcementId, null, session.username]
          );
        } else {
          await query(
            `INSERT INTO announcement_reads 
             (announcement_id, user_ad_username, read_at)
             VALUES (?, ?, NOW())`,
            [announcementId, session.username]
          );
        }
      }
    } catch (error: any) {
      // ถ้ายังไม่มีตาราง announcement_reads ให้ข้าม (optional feature)
      if (error.message?.includes("doesn't exist")) {
        console.warn('announcement_reads table does not exist, skipping read tracking');
        return NextResponse.json({ ok: true, read_at: new Date().toISOString() });
      }
      throw error;
    }

    return NextResponse.json({ 
      ok: true, 
      read_at: new Date().toISOString() 
    });
  } catch (error: any) {
    console.error('Error marking announcement as read:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark as read' },
      { status: 500 }
    );
  }
}

