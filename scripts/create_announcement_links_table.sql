-- ตารางเก็บลิงก์แนบของประกาศ (ใช้ร่วมกับ announcements)
USE rpp_dorm;

CREATE TABLE IF NOT EXISTS announcement_links (
  link_id INT AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT NOT NULL,
  url VARCHAR(2000) NOT NULL,
  label VARCHAR(500) NULL COMMENT 'ข้อความแสดงแทน URL',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE,
  INDEX idx_announcement_links_announcement (announcement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
