// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { createLDAPService } from '@/lib/auth/ldap';
import { determineUserRole, isUserAllowed } from '@/lib/auth/roles';
import { createSession, setSession } from '@/lib/auth/session';
import type { ActiveDirectoryUser } from '@/lib/auth/active-directory';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' },
        { status: 400 }
      );
    }

    // สร้าง LDAP service
    const ldapService = createLDAPService();

    try {
      // Authenticate ผ่าน LDAP
      const authResult = await ldapService.authenticate(username, password);

      if (!authResult.success || !authResult.user) {
        let errorMessage = 'การเข้าสู่ระบบล้มเหลว';
        
        switch (authResult.errorCode) {
          case 'MISSING_CREDENTIALS':
            errorMessage = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
            break;
          case 'USER_NOT_FOUND':
            errorMessage = 'ไม่พบผู้ใช้ในระบบ';
            break;
          case 'ACCOUNT_DISABLED':
            errorMessage = 'บัญชีผู้ใช้ถูกปิดการใช้งาน';
            break;
          case 'USER_NOT_AUTHORIZED':
            errorMessage = 'ผู้ใช้ไม่มีสิทธิ์เข้าถึงระบบ';
            break;
          case 'INVALID_CREDENTIALS':
            errorMessage = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
            break;
          case 'CONNECTION_ERROR':
            errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
            break;
          default:
            errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
        }

        return NextResponse.json(
          { error: errorMessage },
          { status: 401 }
        );
      }

      // แปลง LDAPUserData เป็น ActiveDirectoryUser สำหรับ role determination
      // หมายเหตุ: groups ใน LDAPUserData ใช้ semicolon (;) เป็นตัวแยก ไม่ใช่ comma (,)
      const memberOfArray = authResult.user.groups 
        ? authResult.user.groups.split(';').map((g: string) => g.trim()).filter((g: string) => g.length > 0)
        : [];
      
      const adUser: ActiveDirectoryUser = {
        username: authResult.user.id,
        displayName: authResult.user.name,
        email: authResult.user.email,
        distinguishedName: '', // ไม่จำเป็นสำหรับ role determination
        memberOf: memberOfArray,
      };

      // Log สำหรับ debugging (เฉพาะใน development)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Login Debug] User groups:', memberOfArray);
        console.log('[Login Debug] Allowed group DN:', 'CN=DromRpp,CN=Users-RPP,DC=rpphosp,DC=local');
      }

      // ตรวจสอบว่า user อยู่ใน allowed group หรือไม่
      // เฉพาะ user ที่อยู่ใน group 'CN=DromRpp,CN=Users-RPP,DC=rpphosp,DC=local' เท่านั้นที่สามารถใช้ระบบได้
      const isAllowed = isUserAllowed(adUser);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[Login Debug] isUserAllowed result:', isAllowed);
      }
      
      if (!isAllowed) {
        console.warn('[Login Security] User denied access:', {
          username: adUser.username,
          memberOf: adUser.memberOf,
        });
        return NextResponse.json(
          { error: 'คุณไม่มีสิทธิ์เข้าถึงระบบนี้ กรุณาติดต่อผู้ดูแลระบบ' },
          { status: 403 }
        );
      }

      // กำหนด role จาก AD groups
      const role = determineUserRole(adUser);

      // สร้าง session token
      const token = await createSession(authResult.user, role);

      // บันทึก token ลง cookies
      await setSession(token);

      // Return user data (ไม่รวม sensitive information)
      return NextResponse.json({
        success: true,
        user: {
          id: authResult.user.id,
          name: authResult.user.name,
          email: authResult.user.email,
          department: authResult.user.department,
          title: authResult.user.title,
          role,
        },
      });
    } finally {
      // ปิดการเชื่อมต่อ LDAP
      await ldapService.disconnect();
    }
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' },
      { status: 500 }
    );
  }
}

