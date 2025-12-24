// app/api/announcements/unread-count/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

// บังคับให้ route นี้เป็น dynamic
export const dynamic = 'force-dynamic';

// GET /api/announcements/unread-count - นับจำนวนประกาศที่ยังไม่อ่าน
export async function GET(req: Request) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ unread_count: 0 });
    }

    const userRole = session.role || 'tenant';
    const now = new Date();

    try {
      // ดึงประกาศที่เข้าถึงได้และยังไม่อ่าน
      const unreadAnnouncements = await query<{ announcement_id: number }>(
        `SELECT a.announcement_id
         FROM announcements a
         WHERE (a.target_role = 'all' OR a.target_role = ?)
           AND a.is_published = 1
           AND (a.publish_start IS NULL OR a.publish_start <= ?)
           AND (a.publish_end IS NULL OR a.publish_end >= ?)
           AND COALESCE(a.is_deleted, 0) = 0
           AND NOT EXISTS (
             SELECT 1 FROM announcement_reads ar
             WHERE ar.announcement_id = a.announcement_id
             AND (ar.tenant_id = ? OR ar.user_ad_username = ?)
           )`,
        [
          userRole === 'admin' || userRole === 'superUser' ? 'admin' : 'tenant',
          now,
          now,
          session.id,
          session.username,
        ]
      );

      return NextResponse.json({ 
        unread_count: unreadAnnouncements.length 
      });
    } catch (error: any) {
      // Fallback สำหรับ schema เก่า
      if (error.message?.includes("Unknown column") || error.message?.includes("doesn't exist")) {
        return NextResponse.json({ unread_count: 0 });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ unread_count: 0 });
  }
}

