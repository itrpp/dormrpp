'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
}

export default function TenantAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [searchText, setSearchText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load announcements
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

  // Open announcement detail
  const handleOpenAnnouncement = async (announcementId: number) => {
    try {
      const response = await fetch(`/api/announcements/${announcementId}`);
      const data: AnnouncementDetail = await response.json();
      setSelectedAnnouncement(data);

      // Mark as read
      try {
        await fetch(`/api/announcements/${announcementId}/read`, {
          method: 'POST',
        });
        // Update local state
        setAnnouncements((prev) =>
          prev.map((ann) =>
            ann.announcement_id === announcementId ? { ...ann, unread: false } : ann
          )
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

  // Download file
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

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Filter announcements
  const filteredAnnouncements = announcements.filter((ann) => {
    if (searchText) {
      return (
        ann.title.toLowerCase().includes(searchText.toLowerCase()) ||
        ann.excerpt.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    return true;
  });

  if (selectedAnnouncement) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setSelectedAnnouncement(null)}
          className="mb-4 text-blue-600 hover:text-blue-800 flex items-center gap-2"
        >
          ← กลับ
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {selectedAnnouncement.announcement.title}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {selectedAnnouncement.announcement.created_at
              ? new Date(selectedAnnouncement.announcement.created_at).toLocaleDateString('th-TH', {
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

          {selectedAnnouncement.files && selectedAnnouncement.files.length > 0 && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📎 เอกสารแนบ:</h3>
              <div className="space-y-3">
                {selectedAnnouncement.files.map((file) => (
                  <div
                    key={file.file_id}
                    className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {file.file_type === 'application/pdf' ? '📄' : 
                         file.file_type.startsWith('image/') ? '🖼️' : '📎'}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{file.file_name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(file.download_url, file.file_name)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      ดาวน์โหลด
                    </button>
                  </div>
                ))}
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📢 ประกาศล่าสุด</h1>
        <p className="text-sm text-gray-500">หอพักรวงผึ้ง - โรงพยาบาลราชพิพัฒน์</p>
      </div>

      {/* Search and Unread Count */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <input
            type="text"
            className="flex-1 border rounded-md px-4 py-2"
            placeholder="ค้นหาประกาศ..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {unreadCount > 0 && (
            <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-medium">
              ยังไม่อ่าน: {unreadCount}
            </div>
          )}
        </div>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">กำลังโหลด...</div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">ไม่พบประกาศ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAnnouncements.map((announcement) => (
            <div
              key={announcement.announcement_id}
              className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleOpenAnnouncement(announcement.announcement_id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {announcement.unread ? (
                      <span className="w-3 h-3 bg-blue-600 rounded-full"></span>
                    ) : (
                      <span className="w-3 h-3 bg-gray-300 rounded-full"></span>
                    )}
                    <h3 className="text-lg font-semibold text-gray-900">
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
                  <p className="text-gray-600 line-clamp-2">{announcement.excerpt}</p>
                </div>
                <div className="ml-4 text-gray-400">▸</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

