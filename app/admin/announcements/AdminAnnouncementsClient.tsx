'use client';

import { useState, useEffect, useMemo } from 'react';

interface Announcement {
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

interface AnnouncementFile {
  file_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  download_url: string;
}

interface AnnouncementForm {
  announcement_id?: number;
  title: string;
  content: string;
  target_role: 'all' | 'tenant' | 'admin';
  is_published: boolean;
  publish_start: string;
  publish_end: string;
}

type Props = {
  initialAnnouncements: Announcement[];
};

export default function AdminAnnouncementsClient({ initialAnnouncements }: Props) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>({
    title: '',
    content: '',
    target_role: 'all',
    is_published: true,
    publish_start: '',
    publish_end: '',
  });
  
  const [uploadedFiles, setUploadedFiles] = useState<AnnouncementFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter announcements
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((ann) => {
      if (searchText && !ann.title.toLowerCase().includes(searchText.toLowerCase()) && 
          !ann.content.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      if (selectedRole !== 'all' && ann.target_role !== selectedRole) {
        return false;
      }
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'published' && !ann.is_published) return false;
        if (selectedStatus === 'draft' && ann.is_published) return false;
        if (selectedStatus === 'expired') {
          if (ann.publish_end && new Date(ann.publish_end) < new Date()) {
            return true;
          }
          return false;
        }
      }
      return true;
    });
  }, [announcements, searchText, selectedRole, selectedStatus]);

  // Load announcements
  const loadAnnouncements = async () => {
    try {
      const response = await fetch('/api/announcements?scope=all');
      const data = await response.json();
      if (data.data) {
        // ตรวจสอบและแปลงข้อมูลให้แน่ใจว่ามี content
        const announcementsWithContent = data.data.map((ann: any) => ({
          ...ann,
          content: ann.content || '', // ตรวจสอบว่า content มีค่า
        }));
        setAnnouncements(announcementsWithContent);
      }
    } catch (error) {
      console.error('Error loading announcements:', error);
    }
  };

  // Open create modal
  const handleCreate = () => {
    setIsEditing(false);
    setForm({
      title: '',
      content: '',
      target_role: 'all',
      is_published: true,
      publish_start: '',
      publish_end: '',
    });
    setUploadedFiles([]);
    setSelectedFiles([]);
    setIsModalOpen(true);
  };

  // Open edit modal
  const handleEdit = async (announcement: Announcement) => {
    setIsEditing(true);
    
    // ถ้า announcement ไม่มี content ให้ดึงจาก API
    let content = announcement.content || '';
    if (!content && announcement.announcement_id) {
      try {
        const detailResponse = await fetch(`/api/announcements/${announcement.announcement_id}`);
        const detailData = await detailResponse.json();
        if (detailData.announcement?.content) {
          content = detailData.announcement.content;
        }
      } catch (error) {
        console.error('Error loading announcement detail:', error);
      }
    }
    
    setForm({
      announcement_id: announcement.announcement_id,
      title: announcement.title || '',
      content: content,
      target_role: (announcement.target_role || 'all') as 'all' | 'tenant' | 'admin',
      is_published: announcement.is_published,
      publish_start: announcement.publish_start ? announcement.publish_start.split('T')[0] : '',
      publish_end: announcement.publish_end ? announcement.publish_end.split('T')[0] : '',
    });
    
    // Load files
    try {
      const response = await fetch(`/api/announcements/${announcement.announcement_id}/files`);
      const data = await response.json();
      setUploadedFiles(data.files || []);
    } catch (error) {
      console.error('Error loading files:', error);
      setUploadedFiles([]);
    }
    
    setSelectedFiles([]);
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
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          target_role: form.target_role,
          is_published: form.is_published,
          publish_start: form.publish_start || null,
          publish_end: form.publish_end || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }

      const result = await response.json();
      const announcementId = isEditing ? form.announcement_id : result.announcement_id;

      // Upload files if any
      if (selectedFiles.length > 0 && announcementId) {
        const formData = new FormData();
        selectedFiles.forEach((file) => {
          formData.append('files', file);
        });

        const uploadResponse = await fetch(`/api/announcements/${announcementId}/files`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          console.error('Failed to upload files');
        }
      }

      await loadAnnouncements();
      setIsModalOpen(false);
      alert(isEditing ? 'แก้ไขประกาศสำเร็จ' : 'สร้างประกาศสำเร็จ');
    } catch (error: any) {
      alert(error.message || 'เกิดข้อผิดพลาด');
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
      const response = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      await loadAnnouncements();
      alert('ลบประกาศสำเร็จ');
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการลบ');
    }
  };

  // Toggle publish status
  const handleTogglePublish = async (announcement: Announcement) => {
    try {
      const response = await fetch(`/api/announcements/${announcement.announcement_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...announcement,
          is_published: !announcement.is_published,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update');
      }

      await loadAnnouncements();
    } catch (error) {
      alert('เกิดข้อผิดพลาด');
    }
  };

  // Delete file
  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบไฟล์นี้?')) {
      return;
    }

    try {
      const response = await fetch(`/api/announcements/files/${fileId}`, {
        method: 'DELETE',
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

  // Get status label
  const getStatusLabel = (announcement: Announcement) => {
    if (!announcement.is_published) return 'draft';
    if (announcement.publish_end && new Date(announcement.publish_end) < new Date()) {
      return 'expired';
    }
    return 'published';
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">จัดการประกาศ</h1>
        <button
          onClick={handleCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + เพิ่มประกาศ
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="ค้นหาหัวข้อหรือเนื้อหา..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">กลุ่มเป้าหมาย</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="all">ทุกกลุ่ม</option>
              <option value="all">ทุกคน</option>
              <option value="tenant">ผู้เช่า</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="published">เผยแพร่แล้ว</option>
              <option value="draft">ร่าง</option>
              <option value="expired">หมดอายุ</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                หัวข้อ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                กลุ่มเป้าหมาย
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                สถานะ
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                วันที่
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                การจัดการ
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAnnouncements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  ไม่พบข้อมูลประกาศ
                </td>
              </tr>
            ) : (
              filteredAnnouncements.map((announcement) => {
                const status = getStatusLabel(announcement);
                return (
                  <tr key={announcement.announcement_id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {announcement.title}
                      {announcement.file_count && announcement.file_count > 0 && (
                        <span className="ml-2 text-blue-600">📎 {announcement.file_count}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {announcement.target_role === 'all' ? 'ทุกคน' : 
                       announcement.target_role === 'tenant' ? 'ผู้เช่า' : 'Admin'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          status === 'published'
                            ? 'bg-green-100 text-green-800'
                            : status === 'draft'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {status === 'published' ? 'เผยแพร่แล้ว' : 
                         status === 'draft' ? 'ร่าง' : 'หมดอายุ'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {announcement.publish_start
                        ? new Date(announcement.publish_start).toLocaleDateString('th-TH')
                        : new Date(announcement.created_at).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(announcement)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleTogglePublish(announcement)}
                          className="text-green-600 hover:text-green-900"
                        >
                          {announcement.is_published ? 'ยกเลิกเผยแพร่' : 'เผยแพร่'}
                        </button>
                        <button
                          onClick={() => handleDelete(announcement.announcement_id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    กลุ่มเป้าหมาย
                  </label>
                  <select
                    className="w-full border rounded-md px-3 py-2"
                    value={form.target_role}
                    onChange={(e) => setForm({ ...form, target_role: e.target.value as any })}
                  >
                    <option value="all">ทุกคน</option>
                    <option value="tenant">ผู้เช่า</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_published}
                      onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    />
                    <span className="text-sm font-medium text-gray-700">เผยแพร่</span>
                  </label>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📎 แนบไฟล์ (PDF, JPG, PNG, XLSX, DOCX)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                    className="w-full border rounded-md px-3 py-2"
                    onChange={(e) => {
                      if (e.target.files) {
                        setSelectedFiles(Array.from(e.target.files));
                      }
                    }}
                  />
                  {selectedFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="text-sm text-gray-600">
                          • {file.name} ({formatFileSize(file.size)})
                        </div>
                      ))}
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

