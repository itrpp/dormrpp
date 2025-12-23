// types/db.ts
// TypeScript types for database tables (rpp_dorm schema)

// 1️⃣ buildings (อาคาร)
export interface Building {
  building_id: number;
  name_th: string;
  name_en?: string | null;
  created_at?: Date | null;
}

// 2️⃣ rooms (ห้อง)
export interface Room {
  room_id: number;
  building_id: number;
  room_number: string;
  floor_no: number | null;
  status: 'available' | 'occupied' | 'maintenance';
  created_at?: Date | null;
}

// 3️⃣ tenants (ผู้เช่า)
export interface Tenant {
  tenant_id: number;
  first_name_th: string;
  last_name_th: string;
  email?: string | null;
  phone?: string | null;
  status: 'active' | 'inactive';
  created_at?: Date | null;
}

// 4️⃣ contracts (สัญญาเช่า) ⭐ หัวใจระบบ
export interface Contract {
  contract_id: number;
  tenant_id: number;
  room_id: number;
  start_date: Date;
  end_date?: Date | null;
  status: 'active' | 'ended';
  created_at?: Date | null;
}

// 5️⃣ billing_cycles (รอบบิล)
export interface BillingCycle {
  cycle_id: number;
  billing_year: number;
  billing_month: number;
  start_date: Date;
  end_date: Date;
  due_date: Date;
  status: 'open' | 'closed';
  created_at?: Date | null;
}

// 6️⃣ utility_types (ประเภทสาธารณูปโภค)
export interface UtilityType {
  utility_type_id: number;
  code: string;
  name_th: string;
}

// 7️⃣ utility_rates (อัตราค่าใช้)
export interface UtilityRate {
  rate_id: number;
  utility_type_id: number;
  rate_per_unit: number;
  effective_date: Date;
}

// 8️⃣ bill_utility_readings (เลขมิเตอร์ต่อห้อง) ⭐ สำคัญมาก
export interface BillUtilityReading {
  reading_id: number;
  room_id: number;
  cycle_id: number;
  utility_type_id: number;
  meter_start: number;
  meter_end: number;
  created_at?: Date | null;
}

// 9️⃣ meter_photos (รูปมิเตอร์)
export interface MeterPhoto {
  photo_id: number;
  reading_id: number;
  photo_path: string;
  taken_at?: Date | null;
}

// 🔟 bills (ใบแจ้งหนี้) ⭐ ออกบิลรายผู้เช่า
export interface Bill {
  bill_id: number;
  tenant_id: number;
  room_id: number;
  contract_id: number | null;
  cycle_id: number;
  maintenance_fee: number;
  electric_amount: number;
  water_amount: number;
  subtotal_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid';
  created_at?: Date | null;
}

// 11️⃣ payments (การชำระเงิน)
export interface Payment {
  payment_id: number;
  bill_id: number;
  amount: number;
  payment_method: 'cash' | 'transfer' | 'salary_deduct';
  paid_at: Date;
}

// Legacy types (for backward compatibility during migration)
export interface RoomType {
  room_type_id: number;
  name_th: string;
  name_en?: string | null;
  description?: string | null;
  // รองรับคอลัมน์ name_type (ชื่อประเภทห้อง) หากมีในฐานข้อมูล
  name_type?: string | null;
}

export interface BillOtherItem {
  bill_other_item_id: number;
  bill_id: number;
  item_name: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount: number;
  description?: string | null;
}

export interface Announcement {
  announcement_id: number;
  title: string;
  content: string;
  target_audience?: string | null;
  is_active: boolean;
  published_at?: Date | null;
  created_at?: Date | null;
  updated_at?: Date | null;
}
