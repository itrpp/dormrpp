// app/api/utility-types/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ request.url
export const dynamic = 'force-dynamic';

// GET /api/utility-types?code=electric
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    let sql = `SELECT utility_type_id, code, name_th FROM utility_types WHERE 1=1`;
    const params: any[] = [];

    if (code) {
      sql += ' AND code = ?';
      params.push(code);
    }

    sql += ' ORDER BY code';

    const types = await query(sql, params);
    
    if (code) {
      // ถ้ามี code ให้ return object เดียว
      return NextResponse.json(types[0] || null);
    }
    
    return NextResponse.json(types);
  } catch (error: any) {
    console.error('Error fetching utility types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch utility types' },
      { status: 500 }
    );
  }
}

