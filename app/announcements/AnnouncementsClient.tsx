'use client';

import { useState, useEffect, useMemo } from 'react';
import { ADMIN_SURFACE_CARD } from '@/lib/ui/admin-surface';

const PAGE_SIZE = 20;

interface Announcement {
  announcement_id: number;
  title: string;
  excerpt: string;
  target_role: string;
  is_published: boolean;
  publish_start: string | null;
  publish_end: string | null;
  created_at: string;
  has_files: boolean;
  unread: boolean;
}

interface AnnouncementDetail {
  announcement: {
    announcement_id: number;
    title: string;
    content: string;
    target_role: string;
    is_published: boolean;
    publish_start: string | null;
    publish_end: string | null;
    created_at: string;
  };
  files: Array<{
    file_id: number;
    file_name: string;
    file_type: string;
    file_size: number;
    download_url: string;
  }>;
  links?: Array<{ url: string; label?: string }>;
}

export default function AnnouncementsClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementDetail | null>(null);
  const [searchText, setSearchText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewFile, setPreviewFile] = useState<{
    file_id: number;
    file_name: string;
    file_type: string;
    file_size: number;
    download_url: string;
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadAnnouncements();
    loadUnreadCount();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/announcements?scope=active');
      const data = await response.json();
      if (data.data) {
        setAnnouncements(data.data);
      }
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const response = await fetch('/api/announcements/unread-count');
      const data = await response.json();
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const handleOpenAnnouncement = async (announcementId: number) => {
    try {
      const response = await fetch(`/api/announcements/${announcementId}`);
      const data: AnnouncementDetail = await response.json();
      setSelectedAnnouncement(data);

      try {
        await fetch(`/api/announcements/${announcementId}/read`, {
          method: 'POST',
        });
        setAnnouncements((prev) =>
          prev.map((ann) =>
            ann.announcement_id === announcementId
              ? { ...ann, unread: false }
              : ann,
          ),
        );
        loadUnreadCount();
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    } catch (error) {
      console.error('Error loading announcement:', error);
      alert('เกิดข้อผิดพลาดในการโหลดประกาศ');
    }
  };

  const handleDownload = async (downloadUrl: string, fileName: string) => {
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error('Failed to download');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isPreviewableInline = (type: string) =>
    type === 'application/pdf' || (type || '').startsWith('image/');

  const openPreview = async (file: {
    file_id: number;
    file_name: string;
    file_type: string;
    file_size: number;
    download_url: string;
  }) => {
    setPreviewFile(file);
    if (!isPreviewableInline(file.file_type)) {
      setPreviewBlobUrl(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewBlobUrl(null);
    try {
      const res = await fetch(file.download_url, { credentials: 'include' });
      if (!res.ok) throw new Error('โหลดไม่สำเร็จ');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch {
      setPreviewBlobUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewFile(null);
  };

  const filteredAnnouncements = useMemo(
    () =>
      announcements.filter((ann) => {
        if (searchText.trim()) {
          return (
            ann.title.toLowerCase().includes(searchText.toLowerCase()) ||
            (ann.excerpt || '').toLowerCase().includes(searchText.toLowerCase())
          );
        }
        return true;
      }),
    [announcements, searchText]
  );

  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / PAGE_SIZE));
  const paginatedAnnouncements = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAnnouncements.slice(start, start + PAGE_SIZE);
  }, [filteredAnnouncements, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, filteredAnnouncements.length]);

  if (selectedAnnouncement) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setSelectedAnnouncement(null)}
          className="mb-4 text-blue-600 hover:text-blue-800 flex items-center gap-2 font-medium transition-colors"
        >
          ← กลับ
        </button>

        <div className={`${ADMIN_SURFACE_CARD} p-6`}>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {selectedAnnouncement.announcement.title}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {selectedAnnouncement.announcement.created_at
              ? new Date(
                  selectedAnnouncement.announcement.created_at,
                ).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : ''}
          </p>

          <div className="prose max-w-none mb-6">
            <div className="whitespace-pre-wrap text-gray-700">
              {selectedAnnouncement.announcement.content}
            </div>
          </div>

          {selectedAnnouncement.links && selectedAnnouncement.links.length > 0 && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">🔗 ลิงก์ที่แนบ:</h3>
              <div className="space-y-2">
                {selectedAnnouncement.links.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-blue-700 hover:text-blue-900 transition-colors"
                  >
                    <span className="shrink-0">↗</span>
                    <span className="truncate">
                      {link.label && link.label.trim() ? link.label : link.url}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {selectedAnnouncement.files && selectedAnnouncement.files.length > 0 && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                📎 เอกสารแนบ:
              </h3>
              <div className="space-y-3">
                {selectedAnnouncement.files.map((file) => (
                  <div
                    key={file.file_id}
                    className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl shrink-0">
                        {file.file_type === 'application/pdf'
                          ? '📄'
                          : (file.file_type || '').startsWith('image/')
                            ? '🖼️'
                            : '📎'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {file.file_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(file.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPreview(file)}
                        className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        👁 ดูตัวอย่าง
                      </button>
                      <button
                        onClick={() =>
                          handleDownload(file.download_url, file.file_name)
                        }
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        ดาวน์โหลด
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal ดูตัวอย่างไฟล์ */}
          {previewFile && (
            <div
              className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
              onClick={closePreview}
              role="dialog"
              aria-modal="true"
              aria-label="ดูตัวอย่างไฟล์"
            >
              <div
                className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900 truncate pr-4">
                    {previewFile.file_name}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={previewFile.download_url}
                      download={previewFile.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      ดาวน์โหลด
                    </a>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                      aria-label="ปิด"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-4 bg-gray-100">
                  {previewLoading ? (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      กำลังโหลด...
                    </div>
                  ) : isPreviewableInline(previewFile.file_type) && previewBlobUrl ? (
                    previewFile.file_type === 'application/pdf' ? (
                      <iframe
                        src={previewBlobUrl}
                        title={previewFile.file_name}
                        className="w-full h-[70vh] min-h-[400px] rounded-lg bg-white"
                      />
                    ) : (previewFile.file_type || '').startsWith('image/') ? (
                      <img
                        src={previewBlobUrl}
                        alt={previewFile.file_name}
                        className="max-w-full h-auto max-h-[75vh] mx-auto rounded-lg object-contain"
                      />
                    ) : null
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                      <p className="mb-4">
                        ไม่สามารถแสดงตัวอย่างในเบราว์เซอร์ได้
                      </p>
                      <a
                        href={previewFile.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        เปิดในแท็บใหม่
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownload(
                            previewFile.download_url,
                            previewFile.file_name
                          )
                        }
                        className="mt-2 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ดาวน์โหลดไฟล์
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">📢 ประกาศล่าสุด</h1>
        <p className="text-sm text-gray-500">หอพักรวงผึ้ง - โรงพยาบาลราชพิพัฒน์</p>
      </div>

      <div className={`${ADMIN_SURFACE_CARD} p-4 mb-6`}>
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <input
            type="text"
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
            placeholder="ค้นหาประกาศ..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {unreadCount > 0 && (
            <div className="bg-blue-50 text-blue-800 px-4 py-2.5 rounded-lg font-medium border border-blue-100 shrink-0">
              ยังไม่อ่าน: {unreadCount}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">กำลังโหลด...</p>
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">ไม่พบประกาศ</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedAnnouncements.map((announcement, index) => {
              const rowNo = (currentPage - 1) * PAGE_SIZE + index + 1;
              return (
                <div
                  key={announcement.announcement_id}
                  className={`${ADMIN_SURFACE_CARD} p-5 hover:shadow-md transition-shadow cursor-pointer`}
                  onClick={() => handleOpenAnnouncement(announcement.announcement_id)}
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-semibold">
                      {rowNo}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {announcement.unread ? (
                          <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shrink-0" />
                        ) : (
                          <span className="w-2.5 h-2.5 bg-gray-300 rounded-full shrink-0" />
                        )}
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {announcement.title}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">
                        {announcement.created_at
                          ? new Date(announcement.created_at).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                        {announcement.has_files && (
                          <span className="ml-2 text-blue-600">📎 มีเอกสารแนบ</span>
                        )}
                      </p>
                      {announcement.excerpt && (
                        <p className="text-gray-600 line-clamp-2 text-sm">
                          {announcement.excerpt}
                        </p>
                      )}
                    </div>
                    <span className="text-gray-300 shrink-0 mt-1">▸</span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredAnnouncements.length > 0 && (
            <div className={`mt-6 ${ADMIN_SURFACE_CARD} px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3`}>
              <p className="text-sm text-gray-600">
                แสดง{' '}
                <span className="font-medium">
                  {(currentPage - 1) * PAGE_SIZE + 1} -{' '}
                  {Math.min(currentPage * PAGE_SIZE, filteredAnnouncements.length)}
                </span>{' '}
                จาก <span className="font-medium">{filteredAnnouncements.length}</span> รายการ
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  ก่อนหน้า
                </button>
                <span className="text-sm text-gray-600 min-w-[70px] text-center">
                  หน้า {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

