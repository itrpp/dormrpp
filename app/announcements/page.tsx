// app/announcements/page.tsx - หน้าแสดงรายการประกาศ (public)
import { query } from '@/lib/db';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import AdminLayoutClient from '@/components/AdminLayout';

async function getAnnouncements() {
  try {
    const announcements = await query<any>(
      `SELECT 
        a.announcement_id,
        a.title,
        a.content,
        COALESCE(a.target_role, 'all') as target_role,
        COALESCE(a.is_published, 0) as is_published,
        a.publish_start,
        a.publish_end,
        a.created_at,
        (SELECT COUNT(*) FROM announcement_files af WHERE af.announcement_id = a.announcement_id) as file_count
      FROM announcements a
      WHERE (
        a.status = 'published'
        OR 
        (a.status IS NULL AND COALESCE(a.is_published, 0) = 1)
      )
      ORDER BY a.created_at DESC`
    );
    return announcements || [];
  } catch (error: any) {
    console.error('Error fetching announcements:', error);
    return [];
  }
}

export default async function AnnouncementsPage() {
  const session = await getSession();
  const announcements = await getAnnouncements();

  return (
    <AdminLayoutClient sessionName={session?.name} sessionRole={session?.role}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">📢 ประกาศ</h1>
        </div>

        {announcements.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-12 text-center">
            <p className="text-gray-500 text-sm">ยังไม่มีประกาศ</p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement: any) => (
              <Link
                key={announcement.announcement_id}
                href={`/announcements/${announcement.announcement_id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-blue-400 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 text-lg line-clamp-2 flex-1 group-hover:text-blue-600 transition-colors">
                        {announcement.title}
                      </h3>
                      {announcement.file_count > 0 && (
                        <span className="text-blue-600 flex-shrink-0 mt-0.5" aria-label="มีไฟล์แนบ">
                          📎
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                      {announcement.content}
                    </p>
                    <p className="text-xs text-gray-500">
                      {announcement.created_at
                        ? new Date(announcement.created_at).toLocaleString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayoutClient>
  );
}

