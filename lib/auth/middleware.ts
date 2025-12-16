// lib/auth/middleware.ts
// Middleware utilities สำหรับ protect routes

import { getSession } from './session';
import type { UserRole } from './roles';

export interface AuthOptions {
  requiredRole?: UserRole[];
  redirectTo?: string;
}

/**
 * ตรวจสอบว่า user มีสิทธิ์เข้าถึง route หรือไม่
 */
export async function requireAuth(options: AuthOptions = {}): Promise<{
  authorized: boolean;
  user: any | null;
  redirect?: string;
}> {
  const session = await getSession();

  if (!session) {
    return {
      authorized: false,
      user: null,
      redirect: options.redirectTo || '/login',
    };
  }

  // ตรวจสอบ role ถ้ามีการกำหนด
  if (options.requiredRole && options.requiredRole.length > 0) {
    const hasRequiredRole = options.requiredRole.includes(session.role);
    
    if (!hasRequiredRole) {
      // Redirect ตาม role
      if (session.role === 'admin' || session.role === 'superUser') {
        return {
          authorized: false,
          user: session,
          redirect: '/admin',
        };
      } else {
        return {
          authorized: false,
          user: session,
          redirect: '/my',
        };
      }
    }
  }

  return {
    authorized: true,
    user: session,
  };
}

