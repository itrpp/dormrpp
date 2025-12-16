# ระบบ Authentication ด้วย Active Directory

ระบบ authentication ใช้ Active Directory (LDAP) สำหรับการยืนยันตัวตนผู้ใช้

## โครงสร้าง

### API Routes
- `POST /api/auth/login` - เข้าสู่ระบบ
- `POST /api/auth/logout` - ออกจากระบบ
- `GET /api/auth/me` - ตรวจสอบ session ปัจจุบัน

### Pages
- `/login` - หน้า login
- `/` - Landing page (redirect ไป login หรือ dashboard ตาม role)

### Middleware
- `middleware.ts` - Protect routes และตรวจสอบ authentication

### Utilities
- `lib/auth/session.ts` - จัดการ JWT tokens และ cookies
- `lib/auth/middleware.ts` - Helper functions สำหรับ protect routes
- `lib/auth/ldap.ts` - LDAP service สำหรับ authentication
- `lib/auth/roles.ts` - กำหนด role จาก AD groups
- `lib/auth/jwt-utils.ts` - JWT utilities สำหรับ Edge Runtime

## การตั้งค่า

### Environment Variables

เพิ่มใน `.env.local`:

```env
# LDAP/Active Directory Configuration
LDAP_URL=ldaps://192.168.238.8
LDAP_BASE_DN=DC=rpphosp,DC=local
LDAP_BIND_DN=ldaprpp@rpphosp.local
LDAP_BIND_PASSWORD=rpp14641

# JWT Secret (เปลี่ยนใน production!)
JWT_SECRET=your-secret-key-change-in-production

# Optional LDAP Settings
LDAP_SEARCH_FILTER=(|(sAMAccountName={{username}})(userPrincipalName={{username}}))
LDAP_TIMEOUT=5000
LDAP_CONNECT_TIMEOUT=10000
LDAP_IDLE_TIMEOUT=30000
LDAP_RECONNECT=false
```

### User Roles

ระบบจะกำหนด role จาก AD groups:
- **admin** - ผู้ใช้ในกลุ่ม `manage Ad_admin` หรือ `manage Ad_it`
- **superUser** - ผู้ใช้ในกลุ่ม `manage Ad_user`
- **regular** - ผู้ใช้อื่นๆ

## การใช้งาน

### Login

```typescript
// POST /api/auth/login
{
  "username": "username",
  "password": "password"
}

// Response
{
  "success": true,
  "user": {
    "id": "username",
    "name": "Display Name",
    "email": "email@example.com",
    "department": "Department",
    "title": "Title",
    "role": "admin"
  }
}
```

### Logout

```typescript
// POST /api/auth/logout
// Response: { "success": true }
```

### ตรวจสอบ Session

```typescript
// GET /api/auth/me
// Response: { "user": { ... } }
```

## Protected Routes

### Admin Routes
- `/admin/*` - ต้องมี role `admin` หรือ `superUser`

### Tenant Routes
- `/my/*` - ต้องมี authentication

### Public Routes
- `/login` - ไม่ต้อง authentication
- `/api/auth/login` - ไม่ต้อง authentication

## Security Features

1. **JWT Tokens** - ใช้ JWT สำหรับ session management
2. **HttpOnly Cookies** - ป้องกัน XSS attacks
3. **Secure Cookies** - ใช้ HTTPS ใน production
4. **Token Expiration** - Token หมดอายุใน 7 วัน
5. **Role-based Access Control** - ตรวจสอบ role ก่อนเข้าถึง routes

## Error Handling

### Login Errors
- `MISSING_CREDENTIALS` - ไม่ได้กรอก username หรือ password
- `USER_NOT_FOUND` - ไม่พบผู้ใช้ในระบบ
- `ACCOUNT_DISABLED` - บัญชีถูกปิดการใช้งาน
- `USER_NOT_AUTHORIZED` - ผู้ใช้ไม่มีสิทธิ์เข้าถึงระบบ
- `INVALID_CREDENTIALS` - ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
- `CONNECTION_ERROR` - ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้

## หมายเหตุ

- ต้องมี LDAP server ที่สามารถเข้าถึงได้
- JWT_SECRET ควรเป็น random string ที่ยาวและปลอดภัย
- ใน production ควรใช้ HTTPS
- ควรตั้งค่า LDAP timeout ให้เหมาะสมกับ network

