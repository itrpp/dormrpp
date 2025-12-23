// app/api/auth/me/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

// บังคับให้ route นี้เป็น dynamic เพราะมีการใช้ cookies ภายใน getSession
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'ไม่พบ session' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: session,
    });
  } catch (error) {
    console.error('Get session error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการดึงข้อมูล session' },
      { status: 500 }
    );
  }
}

