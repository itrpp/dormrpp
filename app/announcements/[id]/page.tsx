// app/announcements/[id]/page.tsx - หน้าแสดงรายละเอียดประกาศ (ใช้เมนูตามสิทธิ์)
import { query } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getAppRolesForSessionUser, type AppRoleCode } from '@/lib/auth/app-roles';
import { getAuthRoles } from '@/lib/repositories/auth-users';
import AdminLayoutClient from '@/components/AdminLayout';

async function getAnnouncement(id: number) {
  try {
    // ไม่จำกัดการเข้าถึง - แสดงเฉพาะที่ published แล้ว
    const [announcement] = await query<any>(
      `SELECT 
        a.*,
        (SELECT COUNT(*) FROM announcement_files af WHERE af.announcement_id = a.announcement_id) as file_count
      FROM announcements a
      WHERE a.announcement_id = ?
        AND (
          a.status = 'published'
          OR 
          (a.status IS NULL AND COALESCE(a.is_published, 0) = 1)
        )`,
      [id]
    );

    if (!announcement) {
      return null;
    }

    // ดึงไฟล์แนบ
    let files: any[] = [];
    try {
      files = await query<any>(
        `SELECT * FROM announcement_files WHERE announcement_id = ? ORDER BY created_at ASC`,
        [id]
      );
    } catch {
      // ถ้ายังไม่มีตาราง announcement_files
    }

    return { announcement, files };
  } catch (error: any) {
    // Fallback สำหรับ schema เก่า
    if (error.message?.includes("Unknown column")) {
      try {
        const [announcement] = await query<any>(
          `SELECT * FROM announcements 
           WHERE announcement_id = ?
             AND (
               status = 'published'
               OR 
               (status IS NULL AND COALESCE(is_published, 0) = 1)
             )`,
          [id]
        );
        return announcement ? { announcement, files: [] } : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ฟังก์ชันจัดรูปแบบขนาดไฟล์
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const announcementId = parseInt(params.id, 10);

  if (isNaN(announcementId)) {
    notFound();
  }

  const data = await getAnnouncement(announcementId);

  if (!data) {
    notFound();
  }

  const { announcement, files } = data;
  const session = await getSession();
  const appRoleCodes =
    session && session.username
      ? await getAppRolesForSessionUser(session).catch(() => [])
      : [];

  let sessionRoleLabel: string | undefined;
  try {
    const allRoles = await getAuthRoles();
    const priority: AppRoleCode[] = [
      'ADMIN',
      'SUPERUSER_RP',
      'SUPERUSER_MED',
      'FINANCE',
      'TENANT_RP',
      'TENANT_MED',
      'USER',
    ];
    const primaryCode =
      priority.find((code) => appRoleCodes.includes(code)) || appRoleCodes[0];
    const primaryRole = primaryCode
      ? allRoles.find((r) => r.code === primaryCode)
      : undefined;
    sessionRoleLabel = primaryRole?.name_th;
  } catch {
    sessionRoleLabel = undefined;
  }

  return (
    <AdminLayoutClient
      sessionName={session?.name}
      sessionRole={session?.role}
      appRoleCodes={appRoleCodes}
      sessionRoleLabel={sessionRoleLabel}
    >
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {announcement.title}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {announcement.created_at
              ? new Date(announcement.created_at).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : ''}
          </p>

          <div className="prose max-w-none mb-6">
            <div className="whitespace-pre-wrap text-gray-700">
              {announcement.content}
            </div>
          </div>

          {files && files.length > 0 && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📎 เอกสารแนบ:</h3>
              <div className="space-y-3">
                {files.map((file: any) => (
                  <a
                    key={file.file_id}
                    href={`/api/announcements/files/${file.file_id}/download`}
                    target="_blank"
                    className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div>
                        <p className="font-medium text-gray-900">{file.file_name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <span className="text-blue-600 hover:text-blue-800">ดาวน์โหลด</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayoutClient>
  );
}

