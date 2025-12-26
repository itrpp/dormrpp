// middleware.ts - Next.js middleware สำหรับ protect routes
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidJwtFormat, isTokenExpired, decodeJwtPayload } from '@/lib/auth/jwt-utils';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  // Public routes ที่ไม่ต้อง authentication
  const publicRoutes = [
    '/', // หน้าแรก (public dashboard)
    '/login', 
    '/api/auth/login',
    '/announcements', // หน้า announcements (public)
    '/meters', // redirect to /admin/meters
    '/admin/meters', // หน้ามิเตอร์น้ำและมิเตอร์ไฟฟ้า (public)
    '/admin', // dashboard (public)
    // '/my', // ซ่อนฟีเจอร์ /my ไว้ก่อน
  ];
  
  // Public API routes (สำหรับ tenant ที่ไม่ต้อง login)
  const publicApiRoutes = [
    '/api/announcements', // GET announcements สำหรับ tenant
    '/api/announcements/unread-count',
  ];
  
  // ตรวจสอบว่าเป็น public route หรือไม่
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  const isPublicApiRoute = pathname.startsWith('/api/') && 
    publicApiRoutes.some(route => {
      // สำหรับ /api/announcements/[id] หรือ /api/announcements/files/[id]/download
      if (pathname.startsWith('/api/announcements')) {
        // ถ้าเป็น GET /api/announcements หรือ GET /api/announcements/[id] หรือ GET /api/announcements/files/[id]/download
        // ให้เป็น public (แต่จะตรวจสอบ authorization ใน API route เอง)
        if (pathname === '/api/announcements' || 
            pathname.match(/^\/api\/announcements\/\d+$/) ||
            pathname.match(/^\/api\/announcements\/files\/\d+\/download$/)) {
          return true;
        }
      }
      return pathname === route;
    });
  
  // ถ้าเป็น public route ให้ผ่าน
  if (isPublicRoute || isPublicApiRoute) {
    return NextResponse.next();
  }

  // Admin routes ที่เป็น public (ไม่ต้อง authentication)
  const publicAdminRoutes = [
    '/admin', // dashboard
    '/admin/meters', // หน้ามิเตอร์น้ำและไฟฟ้า
    '/admin/announcements', // หน้า announcements (public)
  ];

  // ตรวจสอบว่าเป็น public admin route หรือไม่
  const isPublicAdminRoute = publicAdminRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));

  // Admin routes อื่นๆ (ที่ไม่ใช่ public) ต้องมี token และเป็น admin/superUser
  if (pathname.startsWith('/admin') && !isPublicAdminRoute) {
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ตรวจสอบว่า token ถูกต้องและยังไม่หมดอายุ
    if (!isValidJwtFormat(token) || isTokenExpired(token)) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ตรวจสอบ role สำหรับ admin routes
    const payload = decodeJwtPayload(token);
    const role = payload?.role as string;
    
    if (role !== 'admin' && role !== 'superUser') {
      // Redirect ไปหน้าหลัก
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // API routes อื่นๆ ที่ไม่ใช่ public ต้องมี token
  if (pathname.startsWith('/api/')) {
    // Admin API routes ต้องมี token
    if (pathname.startsWith('/api/admin') || 
        pathname.startsWith('/api/announcements') && (
          pathname.includes('/files') && !pathname.includes('/download') ||
          pathname.match(/^\/api\/announcements\/\d+\/files$/) && request.method !== 'GET'
        )) {
      if (!token) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      if (!isValidJwtFormat(token) || isTokenExpired(token)) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
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

