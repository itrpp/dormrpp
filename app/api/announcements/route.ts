// app/api/announcements/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Announcement } from '@/types/db';

// GET /api/announcements?is_active=true&target_audience=all
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const isActive = searchParams.get('is_active');
    const targetAudience = searchParams.get('target_audience');

    let sql = 'SELECT * FROM announcements WHERE 1=1';
    const params: any[] = [];

    if (isActive !== null) {
      sql += ' AND is_active = ?';
      params.push(isActive === 'true');
    }
    if (targetAudience) {
      sql += ' AND target_audience = ?';
      params.push(targetAudience);
    }

    sql += ' ORDER BY published_at DESC, created_at DESC';

    try {
      const announcements = await query<Announcement>(sql, params);
      return NextResponse.json(announcements);
    } catch (error: any) {
      // ถ้าไม่มี column published_at ให้ ORDER BY แค่ created_at
      if (error.message?.includes("Unknown column 'published_at'")) {
        const fallbackSql = sql.replace(' ORDER BY published_at DESC, created_at DESC', ' ORDER BY created_at DESC');
        const announcements = await query<Announcement>(fallbackSql, params);
        return NextResponse.json(announcements);
      }
      throw error;
    }
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}

// POST /api/announcements
// body: { title, content, target_audience, is_active, published_at }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, content, target_audience, is_active, published_at } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    try {
      await query(
        `INSERT INTO announcements (title, content, target_audience, is_active, published_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          title,
          content,
          target_audience || 'all',
          is_active !== undefined ? Boolean(is_active) : true,
          published_at ? new Date(published_at) : new Date(),
        ]
      );
    } catch (error: any) {
      // ถ้าไม่มี column published_at ให้ INSERT โดยไม่ใช้ published_at
      if (error.message?.includes("Unknown column 'published_at'")) {
        await query(
          `INSERT INTO announcements (title, content, target_audience, is_active)
           VALUES (?, ?, ?, ?)`,
          [
            title,
            content,
            target_audience || 'all',
            is_active !== undefined ? Boolean(is_active) : true,
          ]
        );
      } else {
        throw error;
      }
    }

    return NextResponse.json({ message: 'Announcement created' }, { status: 201 });
  } catch (error) {
    console.error('Error creating announcement:', error);
    return NextResponse.json(
      { error: 'Failed to create announcement' },
      { status: 500 }
    );
  }
}

