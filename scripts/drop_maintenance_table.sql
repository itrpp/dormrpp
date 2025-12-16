-- สคริปต์สำหรับลบตาราง maintenance_requests และข้อมูลที่เกี่ยวข้อง
-- ใช้สคริปต์นี้ใน phpMyAdmin หรือ MySQL client

-- ลบตาราง maintenance_requests
DROP TABLE IF EXISTS maintenance_requests;

-- หมายเหตุ: 
-- - สคริปต์นี้จะลบตาราง maintenance_requests ทั้งหมด
-- - ข้อมูลทั้งหมดในตารางจะถูกลบถาวร
-- - แนะนำให้ backup ข้อมูลก่อนรันสคริปต์นี้

