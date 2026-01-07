-- สร้างตารางสำหรับเก็บรูปมิเตอร์ (หลักฐานการอ่านค่า)
-- meter_photos: เก็บรูปมิเตอร์พร้อมข้อมูลที่เกี่ยวข้อง
-- วันที่: 2025
-- วัตถุประสงค์: 
--   1. เก็บรูปมิเตอร์เป็นหลักฐานการอ่านค่า
--   2. รู้ว่าเป็นของห้องไหน เดือนอะไร น้ำหรือไฟ
--   3. รู้ว่าใครเป็นคนบันทึก
--   4. ผูกกับบิลภายหลัง

USE rpp_dorm;

-- ตาราง meter_photos
CREATE TABLE IF NOT EXISTS meter_photos (
  photo_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  room_id INT NOT NULL,
  contract_id INT NULL,
  bill_id BIGINT NULL,
  
  utility_type ENUM('electric','water') NOT NULL,
  
  meter_value INT NOT NULL COMMENT 'ค่าที่อ่านได้จากรูป',
  photo_path VARCHAR(500) NOT NULL COMMENT 'path รูป เช่น meters/2025-10/001_1234567890_photo.jpg',
  
  reading_date DATE NOT NULL COMMENT 'วันที่อ่านค่า',
  billing_year SMALLINT NOT NULL COMMENT 'ปีบิล (พ.ศ.)',
  billing_month TINYINT NOT NULL COMMENT 'เดือนบิล (1-12)',
  
  created_by_ad_username VARCHAR(100) NULL COMMENT 'ผู้บันทึก (AD username)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
  FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE SET NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(bill_id) ON DELETE SET NULL,
  
  INDEX idx_room_id (room_id),
  INDEX idx_billing (billing_year, billing_month),
  INDEX idx_utility_type (utility_type),
  INDEX idx_bill_id (bill_id),
  INDEX idx_reading_date (reading_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

