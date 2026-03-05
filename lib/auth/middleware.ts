// lib/auth/middleware.ts
// Middleware utilities สำหรับ protect routes

import { getSession } from './session';
import type { UserRole } from './roles';
import { getAppRolesForSessionUser, type AppRoleCode } from './app-roles';

export interface AuthOptions {
  requiredRole?: UserRole[];
  redirectTo?: string;
}

/**
 * ตรวจสอบว่า user มีสิทธิ์เข้าถึง route หรือไม่ (ใช้ role จาก AD: admin / superUser / regular)
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
          // ส่ง admin ไปหน้าแดชบอร์ดใหม่ที่ URL /dormrpp (ยังใช้ route เดิม /admin ผ่าน rewrite)
          redirect: '/dormrpp',
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

/**
 * ตรวจสอบสิทธิ์ตามบทบาทเชิงธุรกิจ (AppRoleCode) จากตาราง auth_user_roles
 * เหมาะสำหรับใช้กับ endpoint ที่ต้องการจำกัดสิทธิ์แบบละเอียด เช่น finance / superuser รายอาคาร
 */
export async function requireAppRoles(requiredRoles: AppRoleCode[]): Promise<{
  authorized: boolean;
  user: any | null;
  redirect?: string;
  appRoles?: AppRoleCode[];
}> {
  const session = await getSession();

  if (!session) {
    return {
      authorized: false,
      user: null,
      redirect: '/login',
    };
  }

  const appRoles = await getAppRolesForSessionUser(session);
  const hasRole = requiredRoles.some((r) => appRoles.includes(r));

  if (!hasRole) {
    // ถ้าไม่มีสิทธิ์ ให้ redirect ตามประเภทผู้ใช้หลัก
    if (session.role === 'admin' || session.role === 'superUser') {
      return {
        authorized: false,
        user: session,
        // ส่ง admin ไปหน้าแดชบอร์ดใหม่ที่ URL /dormrpp
        redirect: '/dormrpp',
        appRoles,
      };
    }

    return {
      authorized: false,
      user: session,
      redirect: '/my',
      appRoles,
    };
  }

  return {
    authorized: true,
    user: session,
    appRoles,
  };
}

