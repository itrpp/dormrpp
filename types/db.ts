// types/db.ts - TypeScript type definitions for database entities

// Announcement types
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'paused' | 'expired' | 'cancelled';

export interface Announcement {
  announcement_id: number;
  title: string;
  content: string;
  target_role?: string | null;
  target_audience?: string | null; // Legacy field
  status?: AnnouncementStatus | null;
  is_published?: boolean | null; // Legacy: เก็บไว้สำหรับ backward compatibility
  is_active?: boolean | null; // Legacy field
  publish_start?: string | null;
  publish_end?: string | null;
  created_by_ad_username?: string | null;
  created_at: string | Date;
  updated_at?: string | Date | null;
  is_deleted?: number | boolean | null; // Legacy field
}

export interface AnnouncementFile {
  file_id: number;
  announcement_id: number;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at?: string | Date | null;
  download_url?: string; // Optional: สำหรับ client-side
}

// Building types
export interface Building {
  building_id: number;
  name_th: string;
  name_en?: string | null;
}

// Room types
export interface RoomType {
  room_type_id: number;
  id?: number; // Legacy field
  name_th?: string | null;
  name_en?: string | null;
  name_type?: string | null; // Alternative name field
  description?: string | null;
  max_occupants?: number | null;
}

// Room types
export interface Room {
  room_id: number;
  room_number: string;
  floor_no?: number | null;
  building_id: number;
  room_type_id?: number | null;
  status?: 'available' | 'occupied' | 'maintenance' | null;
  is_deleted?: number | boolean | null;
}

// Tenant types
export interface Tenant {
  tenant_id: number;
  first_name?: string | null;
  last_name?: string | null;
  first_name_th?: string | null; // Thai name fields
  last_name_th?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  is_deleted?: number | boolean | null;
}

// Contract types
export interface Contract {
  contract_id: number;
  tenant_id: number;
  room_id: number;
  start_date: string | Date;
  end_date?: string | Date | null;
  status: 'active' | 'inactive' | 'terminated' | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
}

// Bill types
export interface BillingCycle {
  cycle_id: number;
  billing_year: number;
  billing_month: number;
  billing_date: string | Date;
  due_date: string | Date;
  status?: string | null;
  created_at?: string | Date | null;
}

export interface UtilityRate {
  rate_id: number;
  utility_code: 'electric' | 'water';
  rate_per_unit: number;
  effective_from?: string | Date | null;
  effective_to?: string | Date | null;
  created_at?: string | Date | null;
}

export interface BillUtilityReading {
  reading_id: number;
  bill_id: number;
  utility_code: 'electric' | 'water';
  meter_start: number;
  meter_end: number;
  units: number;
  rate_per_unit: number;
  amount: number;
}

export interface Bill {
  bill_id: number;
  contract_id: number;
  cycle_id: number;
  total_amount: number;
  maintenance_fee: number;
  utility_amount: number;
  electric_amount?: number; // จำนวนเงินค่าไฟฟ้า
  water_amount?: number; // จำนวนเงินค่าน้ำ
  subtotal_amount?: number; // ยอดรวมก่อนรวมค่าบำรุงรักษา
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'sent' | null;
  paid_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
}

