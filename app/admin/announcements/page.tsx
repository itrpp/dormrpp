// app/admin/announcements/page.tsx - Manage announcements
import { query } from '@/lib/db';
import type { Announcement } from '@/types/db';
import AdminAnnouncementsClient from './AdminAnnouncementsClient';

interface AdminAnnouncementForClient {
  announcement_id: number;
  title: string;
  content: string;
  target_role: string;
  is_published: boolean;
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
       WHERE COALESCE(a.is_deleted, 0) = 0
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
  const transformedAnnouncements: AdminAnnouncementForClient[] = announcements.map((ann) => ({
    announcement_id: ann.announcement_id,
    title: ann.title,
    content: ann.content,
    target_role: ann.target_role || ann.target_audience || 'all',
    // ถ้า is_published เป็น null/undefined ให้ fallback ไปใช้ is_active (boolean)
    is_published: (ann.is_published ?? ann.is_active) === true,
    publish_start: ann.publish_start ? new Date(ann.publish_start).toISOString() : null,
    publish_end: ann.publish_end ? new Date(ann.publish_end).toISOString() : null,
    created_at: ann.created_at ? new Date(ann.created_at).toISOString() : new Date().toISOString(),
    file_count: ann.file_count ?? 0,
  }));

  return <AdminAnnouncementsClient initialAnnouncements={transformedAnnouncements} />;
}

