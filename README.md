# ระบบจัดการหอพัก (Dormitory Management System)

ระบบจัดการหอพักที่พัฒนาด้วย Next.js 14 (App Router) และ TypeScript

## โครงสร้างโปรเจค

```
my-dorm-app/
├─ app/
│  ├─ layout.tsx              # Root layout
│  ├─ page.tsx                # Landing page / login redirect
│  ├─ admin/                  # Admin section
│  │  ├─ layout.tsx           # Admin layout (menu)
│  │  ├─ page.tsx             # Admin dashboard
│  │  ├─ rooms/               # Manage rooms
│  │  ├─ tenants/              # Manage tenants
│  │  ├─ bills/               # Manage bills
│  │  ├─ maintenance/         # Manage maintenance requests
│  │  └─ announcements/       # Manage announcements
│  ├─ my/                     # Tenant section
│  │  ├─ page.tsx             # Tenant home
│  │  ├─ bills/               # View own bills
│  │  └─ maintenance/         # Create/view maintenance requests
│  └─ api/                    # API routes
│     ├─ rooms/
│     ├─ tenants/
│     ├─ bills/
│     ├─ maintenance/
│     └─ announcements/
├─ lib/
│  ├─ db.ts                   # MySQL connection pool
│  └─ repositories/           # Data access layer
├─ types/
│  └─ db.ts                   # TypeScript types
└─ public/
   └─ meter-photos/           # Meter photos storage
```

## การติดตั้ง

1. ติดตั้ง dependencies:
```bash
npm install
```

2. สร้างไฟล์ `.env.local` (หรือแก้ไขจากไฟล์ที่มีอยู่):
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=rp_dorm
DB_CONNECTION_LIMIT=10
```

3. รัน development server:
```bash
npm run dev
```

4. เปิดเบราว์เซอร์ไปที่ [http://localhost:3000](http://localhost:3000)

## เทคโนโลยีที่ใช้

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **MySQL** - Database (via mysql2)
- **Tailwind CSS** - Styling (via globals.css)

## API Routes

### Rooms
- `GET /api/rooms?building_id=1` - Get all rooms
- `POST /api/rooms` - Create new room

### Tenants
- `GET /api/tenants?room_id=1` - Get all tenants
- `POST /api/tenants` - Create new tenant

### Bills
- `GET /api/bills?year=2568&month=10&room_id=1` - Get bills by month
- `POST /api/bills` - Create new bill
- `GET /api/bills/[billId]` - Get bill details
- `PATCH /api/bills/[billId]` - Update bill
- `DELETE /api/bills/[billId]` - Delete bill

### Maintenance
- `GET /api/maintenance?room_id=1&tenant_id=1&status=pending` - Get maintenance requests
- `POST /api/maintenance` - Create maintenance request

### Announcements
- `GET /api/announcements?is_active=true&target_audience=all` - Get announcements
- `POST /api/announcements` - Create announcement

## หมายเหตุ

- ระบบยังไม่มีระบบ authentication/authorization จริง ต้องเพิ่มในอนาคต
- ไฟล์ `.env.local` ไม่ควร commit ลง Git (อยู่ใน .gitignore แล้ว)
- ต้องมีฐานข้อมูล MySQL ที่มีตารางตามโครงสร้างที่กำหนด

