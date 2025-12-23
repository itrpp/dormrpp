-- Migration: เพิ่มระบบจำกัดจำนวนผู้เข้าพักต่อห้อง
-- วันที่: 2024
-- วัตถุประสงค์: 
--   1. เพิ่ม max_occupants ใน room_types
--   2. เพิ่ม room_type_id ใน rooms (nullable เพื่อไม่พังข้อมูลเดิม)
--   3. สร้าง trigger เพื่อป้องกันการเพิ่มผู้เข้าพักเกินจำนวน

USE rpp_dorm;

-- 1️⃣ เพิ่ม max_occupants ใน room_types (ถ้ายังไม่มี)
-- ใช้วิธีตรวจสอบก่อนเพิ่ม column เพื่อรองรับ MySQL ทุกเวอร์ชัน
SET @dbname = DATABASE();
SET @tablename = 'room_types';
SET @columnname = 'max_occupants';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT DEFAULT 2 COMMENT ''จำนวนผู้เข้าพักสูงสุดต่อห้อง''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2️⃣ อัปเดตข้อมูลเริ่มต้นสำหรับ room_types ที่มีอยู่แล้ว
-- ถ้ายังไม่มีข้อมูล ให้สร้างข้อมูลเริ่มต้น
INSERT INTO room_types (name_th, max_occupants)
VALUES 
  ('ห้องปกติ', 2),
  ('VIP', 1),
  ('ห้องพิเศษ', 3)
ON DUPLICATE KEY UPDATE max_occupants = VALUES(max_occupants);

-- 3️⃣ เพิ่ม room_type_id ใน rooms (nullable เพื่อไม่พังข้อมูลเดิม)
-- ตรวจสอบก่อนเพิ่ม column และ foreign key
SET @dbname = DATABASE();
SET @tablename = 'rooms';
SET @columnname = 'room_type_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT NULL COMMENT ''ประเภทห้อง (FK → room_types)''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- เพิ่ม foreign key (ถ้ายังไม่มี)
SET @constraintname = 'fk_rooms_room_type';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (constraint_name = @constraintname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @constraintname, ' FOREIGN KEY (room_type_id) REFERENCES room_types(room_type_id) ON DELETE SET NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 4️⃣ อัปเดตห้องที่มีอยู่แล้วให้เป็นประเภท "ห้องปกติ" (max_occupants = 2)
-- ใช้ room_type_id = 1 (ห้องปกติ) หรือสร้างใหม่ถ้ายังไม่มี
UPDATE rooms r
SET r.room_type_id = (
  SELECT room_type_id FROM room_types WHERE name_th = 'ห้องปกติ' LIMIT 1
)
WHERE r.room_type_id IS NULL;

-- 5️⃣ สร้าง Trigger เพื่อป้องกันการเพิ่มผู้เข้าพักเกินจำนวน
-- ลบ trigger เก่าถ้ามี (เพื่อป้องกัน error เมื่อรันซ้ำ)
DROP TRIGGER IF EXISTS trg_check_room_occupancy_before_insert;
DROP TRIGGER IF EXISTS trg_check_room_occupancy_before_update;

-- Trigger สำหรับ INSERT
DELIMITER $$

CREATE TRIGGER trg_check_room_occupancy_before_insert
BEFORE INSERT ON contracts
FOR EACH ROW
BEGIN
  DECLARE max_occ INT DEFAULT 2; -- ค่า default ถ้าไม่มี room_type
  DECLARE curr_occ INT DEFAULT 0;
  DECLARE room_type_name VARCHAR(100);

  -- ดึง max_occupants จาก room_types
  SELECT COALESCE(rt.max_occupants, 2), COALESCE(rt.name_th, 'ห้องปกติ')
  INTO max_occ, room_type_name
  FROM rooms r
  LEFT JOIN room_types rt ON r.room_type_id = rt.room_type_id
  WHERE r.room_id = NEW.room_id;

  -- นับจำนวนผู้เข้าพักปัจจุบัน (active contracts)
  SELECT COUNT(*)
  INTO curr_occ
  FROM contracts
  WHERE room_id = NEW.room_id
    AND status = 'active'
    AND contract_id != COALESCE(NEW.contract_id, 0); -- ไม่นับตัวเอง

  -- ตรวจสอบว่าห้องเต็มหรือไม่
  IF NEW.status = 'active' AND curr_occ >= max_occ THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = CONCAT(
      'ห้องนี้มีผู้เข้าพักครบจำนวนแล้ว (', 
      curr_occ, ' / ', max_occ, 
      ' คน - ประเภท: ', room_type_name, ')'
    );
  END IF;
END$$

-- Trigger สำหรับ UPDATE (กรณีเปลี่ยน status เป็น active)
CREATE TRIGGER trg_check_room_occupancy_before_update
BEFORE UPDATE ON contracts
FOR EACH ROW
BEGIN
  DECLARE max_occ INT DEFAULT 2;
  DECLARE curr_occ INT DEFAULT 0;
  DECLARE room_type_name VARCHAR(100);

  -- ตรวจสอบเฉพาะเมื่อเปลี่ยน status เป็น 'active'
  IF NEW.status = 'active' AND (OLD.status != 'active' OR OLD.room_id != NEW.room_id) THEN
    -- ดึง max_occupants จาก room_types
    SELECT COALESCE(rt.max_occupants, 2), COALESCE(rt.name_th, 'ห้องปกติ')
    INTO max_occ, room_type_name
    FROM rooms r
    LEFT JOIN room_types rt ON r.room_type_id = rt.room_type_id
    WHERE r.room_id = NEW.room_id;

    -- นับจำนวนผู้เข้าพักปัจจุบัน (active contracts) - ไม่นับตัวเอง
    SELECT COUNT(*)
    INTO curr_occ
    FROM contracts
    WHERE room_id = NEW.room_id
      AND status = 'active'
      AND contract_id != NEW.contract_id;

    -- ตรวจสอบว่าห้องเต็มหรือไม่
    IF curr_occ >= max_occ THEN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = CONCAT(
        'ห้องนี้มีผู้เข้าพักครบจำนวนแล้ว (', 
        curr_occ, ' / ', max_occ, 
        ' คน - ประเภท: ', room_type_name, ')'
      );
    END IF;
  END IF;
END$$

DELIMITER ;

-- 6️⃣ สร้าง View สำหรับดูสถานะผู้เข้าพัก (Optional - สำหรับการ query ที่สะดวก)
CREATE OR REPLACE VIEW v_room_occupancy AS
SELECT 
  r.room_id,
  r.room_number,
  r.building_id,
  b.name_th AS building_name,
  r.floor_no,
  rt.room_type_id,
  rt.name_th AS room_type_name,
  COALESCE(rt.max_occupants, 2) AS max_occupants,
  COUNT(CASE WHEN c.status = 'active' THEN 1 END) AS current_occupants,
  CASE 
    WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) >= COALESCE(rt.max_occupants, 2) THEN 'full'
    WHEN COUNT(CASE WHEN c.status = 'active' THEN 1 END) = 0 THEN 'empty'
    ELSE 'available'
  END AS occupancy_status
FROM rooms r
JOIN buildings b ON r.building_id = b.building_id
LEFT JOIN room_types rt ON r.room_type_id = rt.room_type_id
LEFT JOIN contracts c ON r.room_id = c.room_id
GROUP BY r.room_id, r.room_number, r.building_id, b.name_th, r.floor_no, rt.room_type_id, rt.name_th, rt.max_occupants;

-- ✅ เสร็จสิ้น
SELECT 'Migration completed successfully!' AS status;
