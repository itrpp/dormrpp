/**
 * Utility functions สำหรับ JWT ที่สามารถใช้ใน Edge Runtime ได้
 * ใช้สำหรับ middleware ที่ต้องทำงานใน Edge Runtime
 */

/**
 * ตรวจสอบว่า JWT token มีรูปแบบที่ถูกต้องหรือไม่ (เบื้องต้น)
 * ฟังก์ชันนี้ไม่ verify signature แต่ตรวจสอบแค่ structure
 * สำหรับการ verify จริงๆ ควรใช้ใน API routes ที่ทำงานใน Node.js runtime
 * @param token - JWT token string
 * @returns true ถ้า token มีรูปแบบถูกต้อง, false ถ้าไม่
 */
export function isValidJwtFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // ตรวจสอบว่าแต่ละ part เป็น base64 ที่ถูกต้องหรือไม่
  try {
    parts.forEach((part) => {
      // JWT ใช้ base64url encoding (ไม่ใช่ base64 ธรรมดา)
      // แปลง base64url เป็น base64 แล้ว decode
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      // เพิ่ม padding ถ้าจำเป็น
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      atob(padded);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode JWT payload โดยไม่ verify signature
 * ใช้สำหรับอ่านข้อมูลจาก token ใน middleware
 * @param token - JWT token string
 * @returns payload object หรือ null
 */
export function decodeJwtPayload(token: string): { exp?: number; [key: string]: unknown } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    // แปลง base64url เป็น base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // เพิ่ม padding ถ้าจำเป็น
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    // Decode base64
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * ตรวจสอบว่า JWT token หมดอายุหรือไม่
 * @param token - JWT token string
 * @returns true ถ้า token หมดอายุแล้ว, false ถ้ายังไม่หมดอายุ
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  
  if (!payload || !payload.exp) {
    return true;
  }

  const expirationTime = payload.exp * 1000; // แปลงเป็น milliseconds
  const currentTime = Date.now();

  return currentTime >= expirationTime;
}

