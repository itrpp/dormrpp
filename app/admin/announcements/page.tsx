// app/admin/announcements/page.tsx - Manage announcements
import { query } from '@/lib/db';
import type { Announcement, AnnouncementStatus } from '@/types/db';
import AdminAnnouncementsClient from './AdminAnnouncementsClient';

export interface AdminAnnouncementForClient {
  announcement_id: number;
  title: string;
  content: string;
  target_role: string;
  status?: AnnouncementStatus | null; // Status workflow
  is_published?: boolean | null; // Legacy: เก็บไว้สำหรับ backward compatibility
  publish_start: string | null;
  publish_end: string | null;
  created_at: string;
  file_count?: number;
}

async function getAnnouncements() {
  try {
    const announcements = await query<Announcement & { file_count?: number }>(
      `SELECT a.*, 
       (SELECT COUNT(*) FROM announcement_files af WHERE af.announcement_id = a.announcement_id) as file_count
       FROM announcements a 
       ORDER BY a.created_at DESC`
    );
    return announcements;
  } catch (error: any) {
    // Fallback สำหรับ schema เก่า
    if (error.message?.includes("Unknown column") || error.message?.includes("doesn't exist")) {
      try {
        return await query<Announcement & { file_count?: number }>(
          'SELECT *, 0 as file_count FROM announcements ORDER BY created_at DESC'
        );
      } catch {
        return [];
      }
    }
    return [];
  }
}

export default async function AdminAnnouncementsPage() {
  const announcements = await getAnnouncements();

  // Transform data for client
  const transformedAnnouncements: AdminAnnouncementForClient[] = announcements.map((ann) => {
    // ตรวจสอบว่า status เป็น AnnouncementStatus ที่ถูกต้องหรือไม่
    const validStatuses: AnnouncementStatus[] = ['draft', 'scheduled', 'published', 'paused', 'expired', 'cancelled'];
    const status = ann.status && validStatuses.includes(ann.status as AnnouncementStatus) 
      ? (ann.status as AnnouncementStatus) 
      : null;

    return {
      announcement_id: ann.announcement_id,
      title: ann.title,
      content: ann.content,
      target_role: ann.target_role || ann.target_audience || 'all',
      status: status, // ส่ง status ไปให้ client (ตรวจสอบว่าเป็น AnnouncementStatus ที่ถูกต้อง)
      // ถ้า is_published เป็น null/undefined ให้ fallback ไปใช้ is_active (boolean)
      is_published: (ann.is_published ?? ann.is_active) === true,
      publish_start: ann.publish_start ? new Date(ann.publish_start).toISOString() : null,
      publish_end: ann.publish_end ? new Date(ann.publish_end).toISOString() : null,
      created_at: ann.created_at ? new Date(ann.created_at).toISOString() : new Date().toISOString(),
      file_count: ann.file_count ?? 0,
    };
  });

  return <AdminAnnouncementsClient initialAnnouncements={transformedAnnouncements} />;
}

