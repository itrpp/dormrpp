-- สคริปต์สร้างตารางสิทธิ์การใช้งาน (RBAC) สำหรับระบบหอพัก
-- ฐานข้อมูลจริงของโปรเจกต์นี้ใช้ MySQL (rpp_dorm ผ่าน mysql2/promise)
-- ให้รันสคริปต์นี้บนฐานข้อมูล rpp_dorm

USE rpp_dorm;

-- ตาราง auth_users: เก็บข้อมูลผู้ใช้ที่ล็อกอินผ่าน AD (อ้างอิงจาก session.username)
CREATE TABLE IF NOT EXISTS auth_users (
  auth_user_id INT AUTO_INCREMENT PRIMARY KEY,
  ad_username VARCHAR(255) NOT NULL UNIQUE, -- ใช้ค่าเดียวกับ session.username (ปัจจุบันคือ AD object GUID)
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตาราง auth_roles: กำหนดชนิดสิทธิ์ตาม requirement
CREATE TABLE IF NOT EXISTS auth_roles (
  auth_role_id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_th VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed ข้อมูลสิทธิ์พื้นฐาน (ใช้ INSERT IGNORE เพื่อไม่ให้ซ้ำ)
INSERT IGNORE INTO auth_roles (code, name_th, description) VALUES
('ADMIN',         'ผู้ดูแลระบบ',                      'จัดการได้ทั้งหมด ทุกเมนู ทุกอาคาร'),
('SUPERUSER_RP',  'Superuser หอพักรวงผึ้ง',            'เห็นเฉพาะเมนูหอพักรวงผึ้ง บันทึกค่าน้ำ-ไฟ/ผู้เช่าเฉพาะหอรวงผึ้ง'),
('SUPERUSER_MED', 'Superuser หอพักแพทยศาสตร์',        'เห็นเฉพาะเมนูอาคารแพทยศาสตร์ บันทึกค่าน้ำ-ไฟ/ผู้เช่าเฉพาะอาคารแพทยศาสตร์'),
('FINANCE',       'เจ้าหน้าที่การเงิน',                'จัดการบิลค่าใช้จ่ายทั้ง 2 อาคาร'),
('FINANCE-R',     'เจ้าหน้าที่การเงินรวงผึ้ง',         'จัดการบิลค่าใช้จ่ายอาคารรวงผึ้ง'),
('FINANCE-M',     'เจ้าหน้าที่การเงินแพทยศาสตร์',      'จัดการบิลค่าใช้จ่ายอาคารแพทยศาสตร์'),
('TENANT_RP',     'ผู้เช่าหอพักรวงผึ้ง',              'ผู้เช่าที่เห็นเฉพาะบิลห้องตัวเองในหอรวงผึ้ง'),
('TENANT_MED',    'ผู้เช่าหอพักแพทยศาสตร์',           'ผู้เช่าที่เห็นเฉพาะบิลห้องตัวเองในอาคารแพทยศาสตร์'),
('USER',          'ผู้ใช้งานทั่วไป',                   'เห็นเฉพาะ Dashboard, ตรวจสอบมิเตอร์, หน้าประกาศเท่านั้น');

-- ตารางเชื่อมผู้ใช้กับสิทธิ์
CREATE TABLE IF NOT EXISTS auth_user_roles (
  auth_user_id INT NOT NULL,
  auth_role_id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (auth_user_id, auth_role_id),
  CONSTRAINT fk_auth_user_roles_user
    FOREIGN KEY (auth_user_id) REFERENCES auth_users(auth_user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_auth_user_roles_role
    FOREIGN KEY (auth_role_id) REFERENCES auth_roles(auth_role_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตารางแมปผู้ใช้ AD (auth_users) เข้ากับผู้เช่าหอพัก (tenants)
CREATE TABLE IF NOT EXISTS tenant_auth_users (
  tenant_auth_user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  auth_user_id INT NOT NULL,
  tenant_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tenant_auth_users_auth_user
    FOREIGN KEY (auth_user_id) REFERENCES auth_users(auth_user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_tenant_auth_users_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT uq_tenant_auth_users_auth UNIQUE (auth_user_id),
  INDEX idx_tenant_auth_users_tenant (tenant_id),
  INDEX idx_tenant_auth_users_auth (auth_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตัวอย่าง seed mapping เริ่มต้น (ควรปรับให้ตรงกับข้อมูลจริงในระบบก่อนรัน)
-- INSERT INTO tenant_auth_users (auth_user_id, tenant_id, is_primary)
-- SELECT au.auth_user_id, t.tenant_id, 1
-- FROM auth_users au
-- JOIN tenants t
--   ON t.email = CONCAT(au.ad_username, '@rpphosp.go.th')
-- WHERE NOT EXISTS (
--   SELECT 1 FROM tenant_auth_users tau
--   WHERE tau.auth_user_id = au.auth_user_id
-- );

