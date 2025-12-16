// lib/auth/session.ts
// Session management utilities สำหรับ JWT tokens

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { LDAPUserData } from '@/types/ldap';
import type { UserRole } from './roles';

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ALGORITHM = 'HS256';
const TOKEN_NAME = 'auth-token';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  department?: string;
  title?: string;
  role: UserRole;
}

export interface SessionPayload {
  sub: string; // user id
  username: string;
  name: string;
  email?: string;
  department?: string;
  title?: string;
  role: UserRole;
  iat: number;
  exp: number;
  [key: string]: unknown; // Index signature for JWTPayload compatibility
}

/**
 * สร้าง JWT token จาก user data
 */
export async function createSession(user: LDAPUserData, role: UserRole): Promise<string> {
  const secret = new TextEncoder().encode(SECRET_KEY);
  
  // ใช้ sAMAccountName หรือ userPrincipalName เป็น username
  const username = user.id || user.email?.split('@')[0] || 'unknown';
  
  const payload: SessionPayload = {
    sub: username,
    username: username,
    name: user.name,
    email: user.email,
    department: user.department,
    title: user.title,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(payload.exp)
    .sign(secret);

  return token;
}

/**
 * ตรวจสอบและ decode JWT token
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = new TextEncoder().encode(SECRET_KEY);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
    });

    return payload as SessionPayload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * อ่าน session จาก cookies
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifySession(token);
  if (!payload) {
    return null;
  }

  return {
    id: payload.sub,
    username: payload.username,
    name: payload.name,
    email: payload.email,
    department: payload.department,
    title: payload.title,
    role: payload.role,
  };
}

/**
 * บันทึก session token ลง cookies
 */
export async function setSession(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

/**
 * ลบ session token จาก cookies
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_NAME);
}

