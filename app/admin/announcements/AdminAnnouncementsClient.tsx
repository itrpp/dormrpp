'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { AnnouncementStatus } from '@/types/db';
import type { AdminAnnouncementForClient } from './page';
import { ADMIN_SURFACE_CARD } from '@/lib/ui/admin-surface';

// ใช้ type เดียวกับ page.tsx
type Announcement = AdminAnnouncementForClient;

interface AnnouncementFile {
  file_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  download_url: string;
}

export type AnnouncementLinkItem = { url: string; label: string };

interface AnnouncementForm {
  announcement_id?: number;
  title: string;
  content: string;
  target_role: 'all' | 'tenant' | 'admin';
  status?: AnnouncementStatus | null;
  is_published?: boolean | null;
  publish_start: string;
  publish_end: string;
  links: AnnouncementLinkItem[];
}

type Props = {
  initialAnnouncements: Announcement[];
};

export default function AdminAnnouncementsClient({ initialAnnouncements }: Props) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  
  // โหลดค่า filter จาก localStorage เมื่อ component mount
  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // โหลดค่า filter จาก localStorage เมื่อ component mount
  useEffect(() => {
    const savedSearchText = localStorage.getItem('adminAnnouncements_searchText');
    const savedSelectedRole = localStorage.getItem('adminAnnouncements_selectedRole');
    const savedSelectedStatus = localStorage.getItem('adminAnnouncements_selectedStatus');
    
    if (savedSearchText !== null) {
      setSearchText(savedSearchText);
    }
    if (savedSelectedRole !== null) {
      setSelectedRole(savedSelectedRole);
    }
    if (savedSelectedStatus !== null) {
      setSelectedStatus(savedSelectedStatus);
    }
  }, []);

  // บันทึกค่า filter ลง localStorage เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    localStorage.setItem('adminAnnouncements_searchText', searchText);
  }, [searchText]);

  useEffect(() => {
    localStorage.setItem('adminAnnouncements_selectedRole', selectedRole);
  }, [selectedRole]);

  useEffect(() => {
    localStorage.setItem('adminAnnouncements_selectedStatus', selectedStatus);
  }, [selectedStatus]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>({
    title: '',
    content: '',
    target_role: 'all',
    publish_start: '',
    publish_end: '',
    links: [],
  });
  
  const [uploadedFiles, setUploadedFiles] = useState<AnnouncementFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [announcementsPage, setAnnouncementsPage] = useState(1);

  // Get status label helper function (รองรับ status workflow และ backward compatibility)
  const getStatusLabel = (announcement: Announcement): AnnouncementStatus => {
    // ถ้ามี status ใช้ status โดยตรง
    if (announcement.status) {
      return announcement.status;
    }
    
    // Backward compatibility: ถ้าไม่มี status ใช้ is_published
    if (announcement.is_published === false || announcement.is_published === null) {
      return 'draft';
    }
    
    // ตรวจสอบ publish_start และ publish_end
    const now = new Date();
    if (announcement.publish_start && new Date(announcement.publish_start) > now) {
      return 'scheduled';
    }
    if (announcement.publish_end && new Date(announcement.publish_end) < now) {
      return 'expired';
    }
    
    return 'published';
  };
  
  // Get status display label (ภาษาไทย)
  const getStatusDisplayLabel = (status: AnnouncementStatus): string => {
    const labels: Record<AnnouncementStatus, string> = {
      draft: 'ร่าง',
      scheduled: 'ตั้งเวลาไว้',
      published: 'เผยแพร่แล้ว',
      paused: 'ปิดชั่วคราว',
      expired: 'หมดอายุ',
      cancelled: 'ยกเลิก',
    };
    return labels[status] || status;
  };
  
  // Get status color class
  const getStatusColorClass = (status: AnnouncementStatus): string => {
    const colors: Record<AnnouncementStatus, string> = {
      draft: 'bg-gray-100 text-gray-800',
      scheduled: 'bg-blue-100 text-blue-800',
      published: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      expired: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-200 text-gray-900',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Filter announcements
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((ann) => {
      // Filter by search text
      if (searchText && !ann.title.toLowerCase().includes(searchText.toLowerCase()) && 
          !ann.content.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      
      // Filter by role
      if (selectedRole !== 'all' && ann.target_role !== selectedRole) {
        return false;
      }
      
      // Filter by status - ใช้ getStatusLabel เพื่อให้สอดคล้องกับการแสดงผล
      if (selectedStatus !== 'all') {
        const status = getStatusLabel(ann);
        if (selectedStatus !== status) {
          return false;
        }
      }
      
      return true;
    });
  }, [announcements, searchText, selectedRole, selectedStatus]);

  const ANNOUNCEMENTS_PAGE_SIZE = 20;
  const announcementsTotalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / ANNOUNCEMENTS_PAGE_SIZE));
  const paginatedAnnouncements = useMemo(() => {
    const start = (announcementsPage - 1) * ANNOUNCEMENTS_PAGE_SIZE;
    return filteredAnnouncements.slice(start, start + ANNOUNCEMENTS_PAGE_SIZE);
  }, [filteredAnnouncements, announcementsPage]);

  useEffect(() => {
    setAnnouncementsPage(1);
  }, [searchText, selectedRole, selectedStatus, filteredAnnouncements.length]);

  // Load announcements
  const loadAnnouncements = async () => {
    try {
      console.log('[loadAnnouncements] Fetching announcements...');
      const response = await fetch('/api/announcements?scope=all', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load announcements:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to load`);
      }
      
      const data = await response.json();
      if (data.data) {
        // ตรวจสอบและแปลงข้อมูลให้แน่ใจว่ามี content และ status
        const announcementsWithContent = data.data.map((ann: any) => ({
          ...ann,
          content: ann.content || '', // ตรวจสอบว่า content มีค่า
          status: ann.status || null, // ใช้ status จาก API
          is_published: Boolean(ann.is_published !== undefined ? ann.is_published : (ann.is_active !== undefined ? ann.is_active : false)), // Legacy: เก็บไว้สำหรับ backward compatibility
        }));
        setAnnouncements(announcementsWithContent);
        console.log(`[loadAnnouncements] Loaded ${announcementsWithContent.length} announcements`);
        console.log('[loadAnnouncements] Sample announcement:', announcementsWithContent[0] ? {
          id: announcementsWithContent[0].announcement_id,
          title: announcementsWithContent[0].title,
          status: announcementsWithContent[0].status,
          is_published: announcementsWithContent[0].is_published,
        } : 'No announcements');
      } else {
        console.warn('[loadAnnouncements] No data in response:', data);
        setAnnouncements([]);
      }
    } catch (error: any) {
      console.error('Error loading announcements:', error);
      alert(`เกิดข้อผิดพลาดในการโหลดประกาศ: ${error.message || 'ไม่สามารถโหลดได้'}`);
    }
  };

  // Open create modal
  const handleCreate = () => {
    setIsEditing(false);
    setForm({
      title: '',
      content: '',
      target_role: 'all',
      publish_start: '',
      publish_end: '',
      links: [],
    });
    setUploadedFiles([]);
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  // Open edit modal
  const handleEdit = async (announcement: Announcement) => {
    setIsEditing(true);
    let content = announcement.content || '';
    let files: AnnouncementFile[] = [];
    let links: AnnouncementLinkItem[] = [];

    try {
      const detailResponse = await fetch(`/api/announcements/${announcement.announcement_id}`, {
        credentials: 'include',
      });
      const detailData = await detailResponse.json();
      if (detailData.announcement?.content) content = detailData.announcement.content;
      if (Array.isArray(detailData.files)) files = detailData.files;
      if (Array.isArray(detailData.links)) {
        links = detailData.links.map((l: { url: string; label?: string }) => ({
          url: l.url || '',
          label: l.label ?? l.url ?? '',
        }));
      }
    } catch (error) {
      console.error('Error loading announcement detail:', error);
    }

    setForm({
      announcement_id: announcement.announcement_id,
      title: announcement.title || '',
      content,
      target_role: 'all',
      publish_start: announcement.publish_start ? announcement.publish_start.split('T')[0] : '',
      publish_end: announcement.publish_end ? announcement.publish_end.split('T')[0] : '',
      links,
    });
    setUploadedFiles(files);
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  // Save announcement
  const handleSave = async () => {
    if (!form.title || !form.content) {
      alert('กรุณากรอกหัวข้อและเนื้อหา');
      return;
    }

    setLoading(true);
    try {
      const url = isEditing 
        ? `/api/announcements/${form.announcement_id}`
        : '/api/announcements';
      
      const method = isEditing ? 'PUT' : 'POST';
      
      const requestBody = {
        title: form.title,
        content: form.content,
        target_role: 'all',
        publish_start: form.publish_start || null,
        publish_end: form.publish_end || null,
        links: form.links.filter((l) => l.url.trim()),
      };

      console.log(`[handleSave] ${method} ${url}`, requestBody);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to save announcement:', errorData);
        
        // ถ้าเป็น 403 Unauthorized แสดงข้อความที่ชัดเจน
        if (response.status === 403) {
          throw new Error('ไม่มีสิทธิ์เข้าถึง กรุณา login ใหม่');
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to save`);
      }

      const result = await response.json();
      const announcementId = isEditing ? form.announcement_id : result.announcement_id;

      // Upload files if any (ไม่ใส่ Content-Type เพื่อให้เบราว์เซอร์ตั้ง multipart boundary เอง)
      if (selectedFiles.length > 0 && announcementId) {
        const formData = new FormData();
        selectedFiles.forEach((file) => {
          formData.append('files', file);
        });

        const uploadResponse = await fetch(`/api/announcements/${announcementId}/files`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const contentType = uploadResponse.headers.get('content-type') || '';
          let msg = `HTTP ${uploadResponse.status}`;
          try {
            const raw = await uploadResponse.text();
            if (contentType.includes('application/json')) {
              const data = JSON.parse(raw);
              msg = data?.error || msg;
            } else if (raw && raw.length < 500) {
              msg = `${msg} — ${raw.trim().slice(0, 200)}`;
            } else if (uploadResponse.status === 413) {
              msg = 'ขนาดไฟล์เกินขีดจำกัดของเซิร์ฟเวอร์ (413) — ให้ตั้งค่า client_max_body_size ใน Nginx หรือ body size limit ใน next.config';
            }
          } catch {
            if (uploadResponse.status === 413) {
              msg = 'ขนาดไฟล์เกินขีดจำกัดของเซิร์ฟเวอร์ (413) — ให้ตั้งค่า client_max_body_size ใน Nginx หรือ body size limit ใน next.config';
            }
          }
          console.error('Failed to upload files:', uploadResponse.status, msg);
          alert(`บันทึกประกาศสำเร็จ แต่อัปโหลดไฟล์ไม่สำเร็จ: ${msg}\n\nตรวจสอบว่าไฟล์เป็น PDF/JPG/PNG/XLSX/DOCX และขนาดไม่เกิน 50MB`);
        }
      }

      await loadAnnouncements();
      setIsModalOpen(false);
      alert(isEditing ? 'แก้ไขประกาศสำเร็จ' : 'สร้างประกาศสำเร็จ');
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      alert(`เกิดข้อผิดพลาด: ${error.message || 'ไม่สามารถบันทึกได้'}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete announcement
  const handleDelete = async (id: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบประกาศนี้?')) {
      return;
    }

    try {
      console.log(`[handleDelete] DELETE /api/announcements/${id}`);
      
      const response = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to delete announcement:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to delete`);
      }

      await loadAnnouncements();
      alert('ลบประกาศสำเร็จ');
    } catch (error: any) {
      console.error('Error deleting announcement:', error);
      alert(`เกิดข้อผิดพลาดในการลบ: ${error.message || 'ไม่สามารถลบได้'}`);
    }
  };

  // Update status helper function
  const updateStatus = async (announcement: Announcement, newStatus: AnnouncementStatus, confirmMessage: string) => {
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      console.log(`[updateStatus] Updating announcement ${announcement.announcement_id} to ${newStatus}`);
      
      // กำหนด status ตาม logic
      let finalStatus = newStatus;
      const now = new Date();
      
      // ถ้าเป็น publish ให้ตรวจสอบ publish_start
      if (newStatus === 'published') {
        if (announcement.publish_start && new Date(announcement.publish_start) > now) {
          finalStatus = 'scheduled';
        }
      }
      
      const response = await fetch(`/api/announcements/${announcement.announcement_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: announcement.title,
          content: announcement.content,
          target_role: announcement.target_role || 'all',
          status: finalStatus,
          publish_start: announcement.publish_start || null,
          publish_end: announcement.publish_end || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`Failed to update status to ${newStatus}:`, errorData);
        
        // ถ้าเป็น 403 Unauthorized แสดงข้อความที่ชัดเจน
        if (response.status === 403) {
          throw new Error('ไม่มีสิทธิ์เข้าถึง กรุณา login ใหม่');
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to update`);
      }

      // Reload เพื่อให้แน่ใจว่าข้อมูลตรงกับ server (อัปเดต status จากฐานข้อมูล)
      await loadAnnouncements();
      
      const statusLabels: Record<AnnouncementStatus, string> = {
        draft: 'บันทึกร่าง',
        scheduled: 'ตั้งเวลาเผยแพร่',
        published: 'เผยแพร่',
        paused: 'ปิดชั่วคราว',
        expired: 'หมดอายุ',
        cancelled: 'ยกเลิก',
      };
      
      alert(`${statusLabels[finalStatus]}สำเร็จ`);
    } catch (error: any) {
      console.error(`Error updating status to ${newStatus}:`, error);
      alert(`เกิดข้อผิดพลาด: ${error.message || 'ไม่สามารถอัปเดตสถานะได้'}`);
    }
  };

  // Publish announcement
  const handlePublish = async (announcement: Announcement) => {
    await updateStatus(announcement, 'published', 'คุณต้องการเผยแพร่ประกาศนี้หรือไม่?');
  };

  // Unpublish announcement (เปลี่ยนเป็น draft)
  const handleUnpublish = async (announcement: Announcement) => {
    await updateStatus(announcement, 'draft', 'คุณต้องการยกเลิกการเผยแพร่ประกาศนี้หรือไม่?');
  };

  // Pause announcement
  const handlePause = async (announcement: Announcement) => {
    await updateStatus(announcement, 'paused', 'คุณต้องการปิดชั่วคราวประกาศนี้หรือไม่?');
  };

  // Cancel announcement
  const handleCancel = async (announcement: Announcement) => {
    await updateStatus(announcement, 'cancelled', 'คุณต้องการยกเลิกประกาศนี้ถาวรหรือไม่? (ไม่สามารถแก้ไขได้)');
  };

  // Delete file
  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบไฟล์นี้?')) {
      return;
    }

    try {
      const response = await fetch(`/api/announcements/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      setUploadedFiles(uploadedFiles.filter((f) => f.file_id !== fileId));
      alert('ลบไฟล์สำเร็จ');
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการลบไฟล์');
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };


  return (
    <div className="max-w-5xl mx-auto">
      {/* Header - สไตล์เดียวกับหน้าประกาศสาธารณะ */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">📢 จัดการประกาศ</h1>
          <p className="text-sm text-gray-500">หอพักรวงผึ้ง - โรงพยาบาลราชพิพัฒน์</p>
        </div>
        <button
          onClick={handleCreate}
          className="shrink-0 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          + เพิ่มประกาศ
        </button>
      </div>

      {/* Filters - การ์ดเหมือนหน้าประกาศ */}
      <div className={`${ADMIN_SURFACE_CARD} p-4 mb-6`}>
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ค้นหาหัวข้อหรือเนื้อหา..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="w-full md:w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">กลุ่มเป้าหมาย</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="all">ทุกคน</option>
              <option value="tenant">ผู้เช่า</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="w-full md:w-44">
            <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="draft">ร่าง</option>
              <option value="scheduled">ตั้งเวลาไว้</option>
              <option value="published">เผยแพร่</option>
              <option value="paused">ปิดชั่วคราว</option>
              <option value="expired">หมดอายุ</option>
              <option value="cancelled">ยกเลิก</option>
            </select>
          </div>
        </div>
      </div>

      {/* รายการประกาศแบบการ์ด - สไตล์เดียวกับหน้าประกาศ */}
      {filteredAnnouncements.length === 0 ? (
        <div className={`${ADMIN_SURFACE_CARD} p-12 text-center`}>
          <p className="text-gray-500">ไม่พบประกาศ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedAnnouncements.map((announcement, index) => {
            const status = getStatusLabel(announcement);
            const rowNo = (announcementsPage - 1) * ANNOUNCEMENTS_PAGE_SIZE + index + 1;
            return (
              <div
                key={announcement.announcement_id}
                className={`${ADMIN_SURFACE_CARD} p-5 hover:shadow-md transition-shadow`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-semibold">
                        {rowNo}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {announcement.title}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {announcement.publish_start
                            ? new Date(announcement.publish_start).toLocaleDateString('th-TH', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : new Date(announcement.created_at).toLocaleDateString('th-TH', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                          <span className="mx-1.5">•</span>
                          {announcement.target_role === 'all'
                            ? 'ทุกคน'
                            : announcement.target_role === 'tenant'
                              ? 'ผู้เช่า'
                              : 'Admin'}
                          {announcement.file_count && announcement.file_count > 0 && (
                            <span className="ml-1.5 text-blue-600">📎 {announcement.file_count}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusColorClass(status)}`}
                      >
                        {getStatusDisplayLabel(status)}
                      </span>
                      {status !== 'cancelled' && (
                        <select
                          value={status}
                          onChange={(e) => {
                            const newStatus = e.target.value as AnnouncementStatus;
                            const confirmMessages: Record<AnnouncementStatus, string> = {
                              draft: 'คุณต้องการเปลี่ยนสถานะเป็น "ร่าง" หรือไม่?',
                              scheduled: 'คุณต้องการเปลี่ยนสถานะเป็น "ตั้งเวลาไว้" หรือไม่?',
                              published: 'คุณต้องการเปลี่ยนสถานะเป็น "เผยแพร่แล้ว" หรือไม่?',
                              paused: 'คุณต้องการเปลี่ยนสถานะเป็น "ปิดชั่วคราว" หรือไม่?',
                              expired: 'คุณต้องการเปลี่ยนสถานะเป็น "หมดอายุ" หรือไม่?',
                              cancelled:
                                'คุณต้องการเปลี่ยนสถานะเป็น "ยกเลิก" หรือไม่? (ไม่สามารถแก้ไขได้)',
                            };
                            updateStatus(announcement, newStatus, confirmMessages[newStatus]);
                          }}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white hover:bg-gray-50 focus:ring-1 focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="draft">ร่าง</option>
                          <option value="scheduled">ตั้งเวลาไว้</option>
                          <option value="published">เผยแพร่</option>
                          <option value="paused">ปิดชั่วคราว</option>
                          <option value="expired">หมดอายุ</option>
                          <option value="cancelled">ยกเลิก</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {status !== 'cancelled' && (
                      <button
                        onClick={() => handleEdit(announcement)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                        title="แก้ไขประกาศ"
                      >
                        ✏️ แก้ไข
                      </button>
                    )}
                    {status === 'draft' && (
                      <button
                        onClick={() => handlePublish(announcement)}
                        className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                        title="เผยแพร่ประกาศ"
                      >
                        ✅ เผยแพร่
                      </button>
                    )}
                    {status === 'scheduled' && (
                      <>
                        <button
                          onClick={() => handlePublish(announcement)}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                          title="เผยแพร่ทันที"
                        >
                          ✅ เผยแพร่ทันที
                        </button>
                        <button
                          onClick={() => handlePause(announcement)}
                          className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm font-medium"
                          title="ปิดชั่วคราว"
                        >
                          ⏸️ ปิดชั่วคราว
                        </button>
                      </>
                    )}
                    {status === 'published' && (
                      <>
                        <button
                          onClick={() => handlePause(announcement)}
                          className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm font-medium"
                          title="ปิดชั่วคราว"
                        >
                          ⏸️ ปิดชั่วคราว
                        </button>
                        <button
                          onClick={() => handleUnpublish(announcement)}
                          className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium"
                          title="ยกเลิกการเผยแพร่"
                        >
                          🚫 ยกเลิกเผยแพร่
                        </button>
                      </>
                    )}
                    {status === 'paused' && (
                      <>
                        <button
                          onClick={() => handlePublish(announcement)}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                          title="เผยแพร่อีกครั้ง"
                        >
                          ✅ เผยแพร่
                        </button>
                        <button
                          onClick={() => handleUnpublish(announcement)}
                          className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium"
                          title="เปลี่ยนเป็นร่าง"
                        >
                          📝 เปลี่ยนเป็นร่าง
                        </button>
                      </>
                    )}
                    {(status === 'expired' || status === 'draft') && (
                      <button
                        onClick={() => handleCancel(announcement)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                        title="ยกเลิกถาวร"
                      >
                        ❌ ยกเลิก
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(announcement.announcement_id)}
                      className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                      title="ลบประกาศ"
                    >
                      🗑️ ลบ
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination - 20 รายการต่อหน้า */}
      {filteredAnnouncements.length > 0 && (
        <div className={`mt-6 ${ADMIN_SURFACE_CARD} px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3`}>
          <p className="text-sm text-gray-600">
            แสดง{' '}
            <span className="font-medium">
              {(announcementsPage - 1) * ANNOUNCEMENTS_PAGE_SIZE + 1} -{' '}
              {Math.min(announcementsPage * ANNOUNCEMENTS_PAGE_SIZE, filteredAnnouncements.length)}
            </span>{' '}
            จาก <span className="font-medium">{filteredAnnouncements.length}</span> รายการ
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => setAnnouncementsPage((p) => Math.max(1, p - 1))}
              disabled={announcementsPage <= 1}
            >
              ก่อนหน้า
            </button>
            <span className="text-sm text-gray-600 min-w-[80px] text-center">
              หน้า {announcementsPage} / {announcementsTotalPages}
            </span>
            <button
              type="button"
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => setAnnouncementsPage((p) => Math.min(announcementsTotalPages, p + 1))}
              disabled={announcementsPage >= announcementsTotalPages}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {isEditing ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หัวข้อ *
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-md px-3 py-2"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>


                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      วันที่เริ่มแสดง
                    </label>
                    <input
                      type="date"
                      className="w-full border rounded-md px-3 py-2"
                      value={form.publish_start}
                      onChange={(e) => setForm({ ...form, publish_start: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      วันที่สิ้นสุด
                    </label>
                    <input
                      type="date"
                      className="w-full border rounded-md px-3 py-2"
                      value={form.publish_end}
                      onChange={(e) => setForm({ ...form, publish_end: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เนื้อหา *
                  </label>
                  <textarea
                    className="w-full border rounded-md px-3 py-2 h-32"
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                  />
                </div>

                {/* แนบลิงก์ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔗 แนบลิงก์
                  </label>
                  <div className="space-y-2">
                    {form.links.map((link, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <input
                          type="url"
                          placeholder="https://..."
                          className="flex-1 min-w-[200px] border rounded px-3 py-2 text-sm"
                          value={link.url}
                          onChange={(e) => {
                            const next = [...form.links];
                            next[idx] = { ...next[idx], url: e.target.value };
                            setForm({ ...form, links: next });
                          }}
                        />
                        <input
                          type="text"
                          placeholder="ข้อความแสดง (ไม่บังคับ)"
                          className="w-40 border rounded px-3 py-2 text-sm"
                          value={link.label}
                          onChange={(e) => {
                            const next = [...form.links];
                            next[idx] = { ...next[idx], label: e.target.value };
                            setForm({ ...form, links: next });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              links: form.links.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                          title="ลบลิงก์"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, links: [...form.links, { url: '', label: '' }] })
                      }
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + เพิ่มลิงก์
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📎 แนบไฟล์ (PDF, JPG, PNG, XLSX, DOCX ไม่เกิน 50MB)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx,application/pdf,image/jpeg,image/png,image/jpg"
                    className="w-full border rounded-md px-3 py-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        setSelectedFiles(Array.from(files));
                      }
                      e.target.value = '';
                    }}
                  />
                  {selectedFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="text-sm text-gray-600 flex items-center justify-between gap-2">
                          <span>• {file.name} ({formatFileSize(file.size)})</span>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFiles([]);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-xs text-red-600 hover:text-red-800 mt-1"
                      >
                        ล้างรายการไฟล์ที่เลือก
                      </button>
                    </div>
                  )}
                </div>

                {/* Existing files */}
                {uploadedFiles.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ไฟล์ที่มีอยู่
                    </label>
                    <div className="space-y-2">
                      {uploadedFiles.map((file) => (
                        <div key={file.file_id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <span className="text-sm text-gray-700">
                            {file.file_name} ({formatFileSize(file.file_size)})
                          </span>
                          <div className="flex gap-2">
                            <a
                              href={file.download_url}
                              target="_blank"
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              ดาวน์โหลด
                            </a>
                            <button
                              onClick={() => handleDeleteFile(file.file_id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              ลบ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                    disabled={loading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

