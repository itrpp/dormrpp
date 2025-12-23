# ระบบจำกัดจำนวนผู้เข้าพักต่อห้อง

## 📋 ภาพรวม

ระบบนี้จำกัดจำนวนผู้เข้าพักต่อห้องตามประเภทห้อง โดย:
- **ห้องปกติ**: สูงสุด 2 คน
- **ห้อง VIP**: สูงสุด 1 คน  
- **ห้องพิเศษ**: กำหนดเองได้ (default 3 คน)

## 🗄️ โครงสร้างฐานข้อมูล

### ตาราง `room_types`
```sql
room_type_id (PK)
name_th
max_occupants  ← จำนวนผู้เข้าพักสูงสุด
```

### ตาราง `rooms`
```sql
room_id (PK)
room_number
room_type_id (FK → room_types)  ← เพิ่มใหม่ (nullable)
building_id
...
```

### การนับผู้เข้าพัก
ใช้ข้อมูลจาก `contracts` ที่ `status = 'active'`:
```sql
SELECT COUNT(*) 
FROM contracts
WHERE room_id = :room_id AND status = 'active';
```

## 🚀 การติดตั้ง

### 1. รัน Migration Script
```bash
mysql -u username -p rpp_dorm < scripts/add_room_occupancy_limit.sql
```

หรือรันผ่าน phpMyAdmin:
1. เปิดไฟล์ `scripts/add_room_occupancy_limit.sql`
2. Copy ทั้งหมด
3. ไปที่ phpMyAdmin → เลือก database `rpp_dorm`
4. ไปที่แท็บ SQL
5. Paste และ Execute

### 2. ตรวจสอบผลลัพธ์
```sql
-- ตรวจสอบว่า column ถูกเพิ่มแล้ว
DESCRIBE room_types;
DESCRIBE rooms;

-- ตรวจสอบ trigger
SHOW TRIGGERS;

-- ตรวจสอบข้อมูลเริ่มต้น
SELECT * FROM room_types;
```

## 🔒 ระบบความปลอดภัย

### 1. **API Validation** (ระดับ Application)
- ตรวจสอบก่อนสร้าง contract ใน:
  - `POST /api/contracts`
  - `POST /api/tenants`
  - `PUT /api/tenants/[tenantId]`

### 2. **Database Trigger** (ระดับ Database)
- Trigger `trg_check_room_occupancy_before_insert`
- Trigger `trg_check_room_occupancy_before_update`
- ป้องกันการเพิ่มผู้เข้าพักเกินจำนวนแม้ insert ผ่าน SQL โดยตรง

## 📊 การใช้งาน

### API Endpoints

#### 1. ตรวจสอบสถานะผู้เข้าพัก
```typescript
GET /api/rooms/occupancy
GET /api/rooms/occupancy?room_id=1
GET /api/rooms/occupancy?building_id=1
```

Response:
```json
{
  "room_id": 1,
  "room_number": "302",
  "building_name": "อาคาร A",
  "room_type_name": "ห้องปกติ",
  "max_occupants": 2,
  "current_occupants": 1,
  "occupancy_status": "available"
}
```

#### 2. สร้าง Contract (พร้อมตรวจสอบอัตโนมัติ)
```typescript
POST /api/contracts
{
  "tenant_id": 1,
  "room_id": 1,
  "start_date": "2024-01-01",
  "status": "active"
}
```

ถ้าห้องเต็มจะได้ error:
```json
{
  "error": "ห้องนี้มีผู้เข้าพักครบจำนวนแล้ว (2 / 2 คน - ประเภท: ห้องปกติ)"
}
```

### Utility Functions

```typescript
import { 
  checkRoomAvailability,
  getRoomOccupancy,
  getAllRoomsOccupancy 
} from '@/lib/repositories/room-occupancy';

// ตรวจสอบว่าห้องสามารถเพิ่มผู้เข้าพักได้หรือไม่
const availability = await checkRoomAvailability(roomId, excludeContractId);
if (!availability.canAdd) {
  console.error(availability.message);
}

// ดึงข้อมูลสถานะผู้เข้าพัก
const occupancy = await getRoomOccupancy(roomId);
console.log(`${occupancy.current_occupants} / ${occupancy.max_occupants}`);
```

## 🖥️ UI Features

### หน้า Admin Rooms (`/admin/rooms`)
- แสดงคอลัมน์ **"ผู้เข้าพัก"** ในรูปแบบ `X / Y`
- สีแดง (🔴) = เต็ม
- สีเขียว (🟢) = ว่างบางส่วน
- สีเทา = ว่าง

### ตัวอย่างการแสดงผล
```
ห้อง 302: 2 / 2 🔴 เต็ม
ห้อง 305: 1 / 2 🟢 ว่าง
ห้อง 401: 0 / 1 🟢 ว่าง
```

## ⚙️ การตั้งค่า

### เปลี่ยนจำนวนผู้เข้าพักสูงสุด
```sql
-- เปลี่ยนห้องปกติเป็น 3 คน
UPDATE room_types 
SET max_occupants = 3 
WHERE name_th = 'ห้องปกติ';

-- เปลี่ยนห้อง VIP เป็น 2 คน
UPDATE room_types 
SET max_occupants = 2 
WHERE name_th = 'VIP';
```

### กำหนดประเภทห้องให้ห้อง
```sql
-- กำหนดห้อง 302 เป็น VIP
UPDATE rooms 
SET room_type_id = (SELECT room_type_id FROM room_types WHERE name_th = 'VIP' LIMIT 1)
WHERE room_number = '302';
```

## 🔍 View สำหรับ Query

มี View `v_room_occupancy` สำหรับ query ที่สะดวก:
```sql
SELECT * FROM v_room_occupancy 
WHERE occupancy_status = 'full';
```

## ⚠️ หมายเหตุสำคัญ

1. **ข้อมูลเดิม**: ห้องที่มีอยู่แล้วจะถูกกำหนดเป็น "ห้องปกติ" (max_occupants = 2) อัตโนมัติ
2. **Backward Compatibility**: `room_type_id` เป็น nullable เพื่อไม่ให้พังข้อมูลเดิม
3. **Default Value**: ถ้าห้องไม่มี `room_type_id` จะใช้ค่า default = 2 คน
4. **Trigger Safety**: Trigger จะป้องกันการเพิ่มผู้เข้าพักเกินจำนวนแม้ insert ผ่าน SQL โดยตรง

## 🐛 Troubleshooting

### ปัญหา: Trigger ไม่ทำงาน
```sql
-- ตรวจสอบว่า trigger ถูกสร้างแล้ว
SHOW TRIGGERS LIKE 'contracts';

-- ถ้าไม่มี ให้รัน migration script อีกครั้ง
```

### ปัญหา: ห้องแสดง "-" ใน UI
- ตรวจสอบว่า API `/api/rooms/occupancy` ทำงานได้
- ตรวจสอบ console ใน browser สำหรับ error

### ปัญหา: ไม่สามารถเพิ่มผู้เข้าพักได้
- ตรวจสอบว่า `room_type_id` ถูกกำหนดให้ห้องแล้ว
- ตรวจสอบว่า `max_occupants` ใน `room_types` ถูกต้อง
- ตรวจสอบจำนวนผู้เข้าพักปัจจุบัน:
  ```sql
  SELECT COUNT(*) 
  FROM contracts 
  WHERE room_id = ? AND status = 'active';
  ```

## 📝 TODO / Future Improvements

- [ ] เพิ่มการแจ้งเตือนเมื่อห้องใกล้เต็ม (เช่น 80% ของ max_occupants)
- [ ] เพิ่มหน้า Admin สำหรับจัดการ room_types
- [ ] เพิ่มรายงานสถิติการใช้งานห้อง
- [ ] รองรับการย้ายผู้เข้าพักระหว่างห้อง
