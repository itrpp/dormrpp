// app/api/announcements/route.ts
import { NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
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
      // ไม่จำกัดการเข้าถึง - แสดงเฉพาะที่ published แล้ว
      // ใช้ status สำหรับ query (รองรับ backward compatibility)
      sql += ` AND (
        a.status = 'published'
        OR 
        (a.status IS NULL AND a.is_published = 1)
      )`;
      // ไม่ตรวจสอบ target_role, publish_start, publish_end - ให้เห็นได้ทุกคน
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
        // ไม่จำกัดการเข้าถึง - แสดงเฉพาะที่ published แล้ว
        countSql += ` AND (
          status = 'published'
          OR 
          (status IS NULL AND is_published = 1)
        )`;
        // ไม่ตรวจสอบ target_role, publish_start, publish_end - ให้เห็นได้ทุกคน
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

      // ไม่ตรวจสอบ unread (ตัดฟีเจอร์การจำกัดออก)
      const announcementsWithUnread = await Promise.all(
        announcements.map(async (ann) => {
          let unread = false; // ไม่ใช้ unread tracking
          
          // กำหนด status จากฐานข้อมูล (รองรับ backward compatibility)
          let status: string = 'draft';
          if (ann.status) {
            status = ann.status;
          } else if (ann.is_published || ann.is_active) {
            // Backward compatibility: ถ้าไม่มี status แต่มี is_published/is_active
            const now = new Date();
            if (ann.publish_start && new Date(ann.publish_start) > now) {
              status = 'scheduled';
            } else if (ann.publish_end && new Date(ann.publish_end) < now) {
              status = 'expired';
            } else {
              status = 'published';
            }
          }
          
          return {
            announcement_id: ann.announcement_id,
            title: ann.title,
            content: ann.content || '', // ส่ง content เต็มกลับไป
            excerpt: ann.content ? (ann.content.substring(0, 150) + (ann.content.length > 150 ? '...' : '')) : '',
            target_role: ann.target_role || ann.target_audience || 'all',
            status: status,
            is_published: Boolean(ann.is_published !== undefined ? ann.is_published : (ann.is_active !== undefined ? ann.is_active : false)), // Legacy: เก็บไว้สำหรับ backward compatibility
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
    const { title, content, target_role, status, is_published, publish_start, publish_end } = body;

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

    // กำหนด status อัตโนมัติถ้าไม่ได้ระบุ
    let finalStatus: string = status || 'draft';
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
      // ใช้ pool.query โดยตรงสำหรับ INSERT เพื่อให้ได้ result object ที่มี insertId
      // รองรับทั้ง status และ is_published (backward compatibility)
      const [result] = await pool.query(
        `INSERT INTO announcements 
         (title, content, target_role, status, is_published, publish_start, publish_end, created_by_ad_username, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          title,
          content,
          target_role || 'all',
          finalStatus,
          is_published !== undefined ? (is_published ? 1 : 0) : (finalStatus === 'published' || finalStatus === 'scheduled' ? 1 : 0),
          publish_start ? new Date(publish_start) : null,
          publish_end ? new Date(publish_end) : null,
          session.username,
        ]
      ) as any;

      const insertId = result?.insertId;
      if (!insertId) {
        throw new Error('Failed to get insertId from query result');
      }

      return NextResponse.json(
        { announcement_id: insertId },
        { status: 201 }
      );
    } catch (error: any) {
      // Fallback สำหรับ schema เก่า
      if (error.message?.includes("Unknown column")) {
        try {
          const [result] = await pool.query(
            `INSERT INTO announcements 
             (title, content, target_audience, is_active, published_at, created_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [
              title,
              content,
              target_role || 'all',
              is_published !== undefined ? (is_published ? 1 : 0) : 1,
            ]
          ) as any;
          
          const insertId = result?.insertId;
          if (!insertId) {
            throw new Error('Failed to get insertId from fallback query result');
          }

          return NextResponse.json(
            { announcement_id: insertId },
            { status: 201 }
          );
        } catch (fallbackError: any) {
          console.error('Fallback query also failed:', fallbackError);
          throw fallbackError;
        }
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
