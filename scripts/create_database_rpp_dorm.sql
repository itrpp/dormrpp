-- สร้างฐานข้อมูล rpp_dorm
CREATE DATABASE IF NOT EXISTS rpp_dorm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rpp_dorm;

-- 1️⃣ buildings (อาคาร)
CREATE TABLE IF NOT EXISTS buildings (
  building_id INT AUTO_INCREMENT PRIMARY KEY,
  name_th VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2️⃣ rooms (ห้อง)
CREATE TABLE IF NOT EXISTS rooms (
  room_id INT AUTO_INCREMENT PRIMARY KEY,
  building_id INT NOT NULL,
  room_number VARCHAR(10) NOT NULL,
  floor_no INT NOT NULL,
  status ENUM('available','occupied','maintenance') DEFAULT 'available',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room (building_id, room_number),
  FOREIGN KEY (building_id) REFERENCES buildings(building_id)
) ENGINE=InnoDB;

-- 3️⃣ tenants (ผู้เช่า)
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name_th VARCHAR(100) NOT NULL,
  last_name_th VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(50),
  status ENUM('active','inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4️⃣ contracts (สัญญาเช่า) ⭐ หัวใจระบบ
CREATE TABLE IF NOT EXISTS contracts (
  contract_id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  room_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status ENUM('active','ended') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_active_contract (tenant_id, room_id, status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id)
) ENGINE=InnoDB;

-- 5️⃣ billing_cycles (รอบบิล) - เพิ่ม start_date, end_date, due_date
CREATE TABLE IF NOT EXISTS billing_cycles (
  cycle_id INT AUTO_INCREMENT PRIMARY KEY,
  billing_year SMALLINT NOT NULL,
  billing_month TINYINT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('open','closed') DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cycle (billing_year, billing_month)
) ENGINE=InnoDB;

-- 6️⃣ utility_types (ประเภทสาธารณูปโภค) - ใช้ code: 'electric', 'water'
CREATE TABLE IF NOT EXISTS utility_types (
  utility_type_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  name_th VARCHAR(50)
) ENGINE=InnoDB;

-- 7️⃣ utility_rates (อัตราค่าใช้)
CREATE TABLE IF NOT EXISTS utility_rates (
  rate_id INT AUTO_INCREMENT PRIMARY KEY,
  utility_type_id INT NOT NULL,
  rate_per_unit DECIMAL(10,2) NOT NULL,
  effective_date DATE NOT NULL,
  FOREIGN KEY (utility_type_id) REFERENCES utility_types(utility_type_id)
) ENGINE=InnoDB;

-- 8️⃣ bill_utility_readings (เลขมิเตอร์ต่อห้อง) ⭐ สำคัญมาก - Source of Truth
CREATE TABLE IF NOT EXISTS bill_utility_readings (
  reading_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  cycle_id INT NOT NULL,
  utility_type_id INT NOT NULL,
  meter_start INT NOT NULL,
  meter_end INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_cycle_utility (room_id, cycle_id, utility_type_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  FOREIGN KEY (cycle_id) REFERENCES billing_cycles(cycle_id),
  FOREIGN KEY (utility_type_id) REFERENCES utility_types(utility_type_id)
) ENGINE=InnoDB;

-- 9️⃣ meter_photos (รูปมิเตอร์)
CREATE TABLE IF NOT EXISTS meter_photos (
  photo_id INT AUTO_INCREMENT PRIMARY KEY,
  reading_id INT NOT NULL,
  photo_path VARCHAR(255) NOT NULL,
  taken_at DATETIME,
  FOREIGN KEY (reading_id) REFERENCES bill_utility_readings(reading_id)
) ENGINE=InnoDB;

-- 🔟 bills (ใบแจ้งหนี้) - ออกบิลรายผู้เช่า
CREATE TABLE IF NOT EXISTS bills (
  bill_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  room_id INT NOT NULL,
  contract_id INT,
  cycle_id INT NOT NULL,
  maintenance_fee DECIMAL(10,2) DEFAULT 0,
  electric_amount DECIMAL(10,2) DEFAULT 0,
  water_amount DECIMAL(10,2) DEFAULT 0,
  subtotal_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status ENUM('draft','sent','paid') DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bill_tenant_cycle (tenant_id, cycle_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  FOREIGN KEY (contract_id) REFERENCES contracts(contract_id),
  FOREIGN KEY (cycle_id) REFERENCES billing_cycles(cycle_id)
) ENGINE=InnoDB;

-- 11️⃣ payments (การชำระเงิน)
CREATE TABLE IF NOT EXISTS payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('cash','transfer','salary_deduct') NOT NULL,
  paid_at DATETIME NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(bill_id)
) ENGINE=InnoDB;

-- เพิ่มข้อมูลเริ่มต้น
INSERT INTO utility_types (code, name_th) VALUES 
  ('electric', 'ไฟฟ้า'),
  ('water', 'น้ำประปา')
ON DUPLICATE KEY UPDATE name_th=VALUES(name_th);
