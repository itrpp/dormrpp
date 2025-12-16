// middleware.ts - Next.js middleware สำหรับ protect routes
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidJwtFormat, isTokenExpired, decodeJwtPayload } from '@/lib/auth/jwt-utils';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  // Public routes ที่ไม่ต้อง authentication
  const publicRoutes = ['/login', '/api/auth/login'];
  
  // ถ้าเป็น public route ให้ผ่าน
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // ถ้าไม่มี token และไม่ใช่ public route ให้ redirect ไป login
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ตรวจสอบว่า token ถูกต้องและยังไม่หมดอายุ
  if (!isValidJwtFormat(token) || isTokenExpired(token)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ตรวจสอบ role สำหรับ admin routes
  if (pathname.startsWith('/admin')) {
    const payload = decodeJwtPayload(token);
    const role = payload?.role as string;
    
    if (role !== 'admin' && role !== 'superUser') {
      // Redirect ไปหน้า tenant
      return NextResponse.redirect(new URL('/my', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

