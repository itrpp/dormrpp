// app/api/announcements/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import type { Announcement } from '@/types/db';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url และ cookies
export const dynamic = 'force-dynamic';

// GET /api/announcements?scope=active&q=search&page=1&page_size=20
export async function GET(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    
    const scope = searchParams.get('scope') || 'active'; // active | all
    const q = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '20', 10);
    const sort = searchParams.get('sort') || 'created_at_desc';

    // ถ้า scope=all ต้องเป็น admin เท่านั้น
    if (scope === 'all' && (!session || (session.role !== 'admin' && session.role !== 'superUser'))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    let sql = `
      SELECT 
        a.*,
        (SELECT COUNT(*) FROM announcement_files af WHERE af.announcement_id = a.announcement_id) as file_count
      FROM announcements a
      WHERE 1=1
    `;
    const params: any[] = [];

    // Filter ตาม scope
    if (scope === 'active') {
      const now = new Date();
      const userRole = session?.role || 'tenant';
      
      // ตรวจสอบ role
      sql += ` AND (a.target_role = 'all' OR a.target_role = ?)`;
      params.push(userRole === 'admin' || userRole === 'superUser' ? 'admin' : 'tenant');
      
      // ตรวจสอบ publishing window
      sql += ` AND a.is_published = 1`;
      sql += ` AND (a.publish_start IS NULL OR a.publish_start <= ?)`;
      sql += ` AND (a.publish_end IS NULL OR a.publish_end >= ?)`;
      params.push(now, now);
      
      // ไม่แสดงที่ถูกลบ
      sql += ` AND COALESCE(a.is_deleted, 0) = 0`;
    } else {
      // scope=all (admin only) - แสดงทั้งหมดรวม draft และ expired
      if (q) {
        sql += ` AND (a.title LIKE ? OR a.content LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }
    }

    // Search
    if (q && scope === 'active') {
      sql += ` AND (a.title LIKE ? OR a.content LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    // Sort
    if (sort === 'publish_start_desc') {
      sql += ` ORDER BY a.publish_start DESC, a.created_at DESC`;
    } else {
      sql += ` ORDER BY a.created_at DESC`;
    }

    // Pagination
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    try {
      let announcements: (Announcement & { file_count: number })[];
      try {
        announcements = await query<Announcement & { file_count: number }>(sql, params);
      } catch (queryError: any) {
        // ถ้าเป็น "Too many connections" ให้ return empty array แทน error
        if (queryError.code === 'ER_CON_COUNT_ERROR' || queryError.message?.includes('Too many connections')) {
          // Silent fallback - ไม่ log เพื่อลด log noise
          return NextResponse.json({
            data: [],
            pagination: {
              page,
              page_size: pageSize,
              total: 0,
            },
          });
        }
        throw queryError;
      }
      
      // นับ total สำหรับ pagination
      let countSql = `SELECT COUNT(*) as total FROM announcements WHERE 1=1`;
      const countParams: any[] = [];
      
      if (scope === 'active') {
        const now = new Date();
        const userRole = session?.role || 'tenant';
        countSql += ` AND (target_role = 'all' OR target_role = ?)`;
        countParams.push(userRole === 'admin' || userRole === 'superUser' ? 'admin' : 'tenant');
        countSql += ` AND is_published = 1`;
        countSql += ` AND (publish_start IS NULL OR publish_start <= ?)`;
        countSql += ` AND (publish_end IS NULL OR publish_end >= ?)`;
        countSql += ` AND COALESCE(is_deleted, 0) = 0`;
        countParams.push(now, now);
        if (q) {
          countSql += ` AND (title LIKE ? OR content LIKE ?)`;
          countParams.push(`%${q}%`, `%${q}%`);
        }
      } else {
        if (q) {
          countSql += ` AND (title LIKE ? OR content LIKE ?)`;
          countParams.push(`%${q}%`, `%${q}%`);
        }
      }
      
      const [countResult] = await query<{ total: number }>(countSql, countParams);
      const total = countResult?.total || 0;

      // ตรวจสอบ unread สำหรับ tenant
      const announcementsWithUnread = await Promise.all(
        announcements.map(async (ann) => {
          let unread = false;
          if (session && (session.role === 'regular' || !session.role)) {
            try {
              const [readResult] = await query<{ read_id: number }>(
                `SELECT read_id FROM announcement_reads 
                 WHERE announcement_id = ? 
                 AND (tenant_id = ? OR user_ad_username = ?)
                 LIMIT 1`,
                [ann.announcement_id, session.id, session.username]
              );
              unread = !readResult;
            } catch {
              unread = true; // ถ้า error ให้ถือว่า unread
            }
          }
          
          return {
            announcement_id: ann.announcement_id,
            title: ann.title,
            content: ann.content || '', // ส่ง content เต็มกลับไป
            excerpt: ann.content ? (ann.content.substring(0, 150) + (ann.content.length > 150 ? '...' : '')) : '',
            target_role: ann.target_role || ann.target_audience || 'all',
            is_published: ann.is_published !== undefined ? ann.is_published : ann.is_active,
            publish_start: ann.publish_start,
            publish_end: ann.publish_end,
            created_at: ann.created_at,
            has_files: (ann.file_count || 0) > 0,
            unread,
          };
        })
      );

      return NextResponse.json({
        data: announcementsWithUnread,
        pagination: {
          page,
          page_size: pageSize,
          total,
        },
      });
    } catch (error: any) {
      // Fallback สำหรับ schema เก่า
      if (error.message?.includes("Unknown column")) {
        const fallbackSql = `
          SELECT a.*, 0 as file_count
          FROM announcements a
          WHERE a.is_active = 1
          ${q ? `AND (a.title LIKE ? OR a.content LIKE ?)` : ''}
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?
        `;
        const fallbackParams: any[] = [];
        if (q) {
          fallbackParams.push(`%${q}%`, `%${q}%`);
        }
        fallbackParams.push(pageSize, offset);
        
        const announcements = await query<Announcement & { file_count: number }>(fallbackSql, fallbackParams);
        
        return NextResponse.json({
          data: announcements.map((ann) => ({
            announcement_id: ann.announcement_id,
            title: ann.title,
            content: ann.content || '', // ส่ง content เต็มกลับไป
            excerpt: ann.content ? (ann.content.substring(0, 150) + (ann.content.length > 150 ? '...' : '')) : '',
            target_role: ann.target_audience || 'all',
            is_published: ann.is_active,
            publish_start: null,
            publish_end: null,
            created_at: ann.created_at,
            has_files: false,
            unread: false,
          })),
          pagination: {
            page,
            page_size: pageSize,
            total: announcements.length,
          },
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error fetching announcements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}

// POST /api/announcements - สร้างประกาศใหม่ (Admin only)
export async function POST(req: Request) {
  try {
    const session = await getSession();
    
    if (!session || (session.role !== 'admin' && session.role !== 'superUser')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title, content, target_role, is_published, publish_start, publish_end } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    // Validation
    if (publish_start && publish_end && new Date(publish_start) > new Date(publish_end)) {
      return NextResponse.json(
        { error: 'publish_end must be after publish_start' },
        { status: 400 }
      );
    }

    try {
      const [result] = await query<{ insertId: number }>(
        `INSERT INTO announcements 
         (title, content, target_role, is_published, publish_start, publish_end, created_by_ad_username, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          title,
          content,
          target_role || 'all',
          is_published !== undefined ? (is_published ? 1 : 0) : 1,
          publish_start ? new Date(publish_start) : null,
          publish_end ? new Date(publish_end) : null,
          session.username,
        ]
      );

      return NextResponse.json(
        { announcement_id: result?.insertId },
        { status: 201 }
      );
    } catch (error: any) {
      // Fallback สำหรับ schema เก่า
      if (error.message?.includes("Unknown column")) {
        const [result] = await query<{ insertId: number }>(
          `INSERT INTO announcements 
           (title, content, target_audience, is_active, published_at, created_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [
            title,
            content,
            target_role || 'all',
            is_published !== undefined ? (is_published ? 1 : 0) : 1,
          ]
        );
        
        return NextResponse.json(
          { announcement_id: result?.insertId },
          { status: 201 }
        );
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error creating announcement:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create announcement' },
      { status: 500 }
    );
  }
}
