-- สคริปต์สำหรับเพิ่มคอลัมน์ที่จำเป็นลงในตาราง tenants
-- ใช้สคริปต์นี้ใน phpMyAdmin หรือ MySQL client
-- 
-- สคริปต์นี้จะเพิ่ม:
-- 1. phone - เบอร์โทรศัพท์
-- 2. is_deleted - สำหรับ soft delete
-- 3. status - สถานะผู้เช่า (active/inactive)

-- เพิ่มคอลัมน์ phone (สำหรับเก็บเบอร์โทร)
ALTER TABLE tenants
  ADD COLUMN phone VARCHAR(50) NULL;

-- เพิ่มคอลัมน์ is_deleted (สำหรับ soft delete)
ALTER TABLE tenants
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;

-- เพิ่มคอลัมน์ status (สำหรับสถานะผู้เช่า: active/inactive)
ALTER TABLE tenants
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';

-- หมายเหตุ: 
-- - คอลัมน์ phone: เป็น NULL ได้ (ไม่บังคับ), ความยาวสูงสุด 50 ตัวอักษร
-- - คอลัมน์ is_deleted: เก็บ 0/1, DEFAULT 0 (แถวเดิมทั้งหมดจะถือว่ายังไม่ถูกลบ)
-- - คอลัมน์ status: NOT NULL, DEFAULT 'active' (แถวเดิมทั้งหมดจะถือว่า active)
-- - หลังจากรันสคริปต์นี้แล้ว ให้ Refresh หน้าเว็บ
-- 
-- วิธีใช้งาน:
-- 1. เปิด phpMyAdmin
-- 2. เลือกฐานข้อมูล (rp_dorm)
-- 3. เลือกตาราง tenants
-- 4. ไปที่แท็บ SQL
-- 5. Copy เนื้อหาจากสคริปต์นี้แล้ววาง
-- 6. กด Run หรือ Execute
-- 7. Refresh หน้าเว็บ

