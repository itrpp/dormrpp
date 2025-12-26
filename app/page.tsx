// app/page.tsx - Public Dashboard สำหรับผู้ใช้ทั่วไป
import { query } from '@/lib/db';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import PublicLayout from '@/components/PublicLayout';

// ฟังก์ชันดึงสถิติทั่วไป
async function getPublicStats() {
  try {
    const [roomStats, tenantStats, buildingStats] = await Promise.all([
      query<{ status: string; count: number }>(
        `SELECT status, COUNT(*) as count 
         FROM rooms 
         WHERE COALESCE(is_deleted, 0) = 0
         GROUP BY status`
      ),
      query<{ count: number }>(
        'SELECT COUNT(*) as count FROM tenants WHERE COALESCE(is_deleted, 0) = 0'
      ),
      query<{ count: number }>(
        'SELECT COUNT(*) as count FROM buildings'
      ),
    ]);

    const totalRooms = roomStats.reduce((sum, r) => sum + (r.count || 0), 0);
    const availableRooms = roomStats.find(r => r.status === 'available')?.count || 0;
    const occupiedRooms = roomStats.find(r => r.status === 'occupied')?.count || 0;
    const totalTenants = tenantStats[0]?.count || 0;
    const totalBuildings = buildingStats[0]?.count || 0;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      totalTenants,
      totalBuildings,
    };
  } catch (error: any) {
    console.error('Error fetching public stats:', error);
    return {
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      totalTenants: 0,
      totalBuildings: 0,
    };
  }
}


// ฟังก์ชันดึงประกาศล่าสุด
async function getLatestAnnouncements() {
  try {
    const now = new Date();
    const nowDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // ลองใช้ schema ใหม่ก่อน (ใช้วิธีเดียวกับ API route)
    let announcements: any[] = [];
    
    try {
      // ไม่จำกัดการเข้าถึง - แสดงเฉพาะที่ published แล้ว
      announcements = await query<any>(
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
        ORDER BY a.created_at DESC
        LIMIT 5`
      );
    } catch (queryError: any) {
      // ถ้า query ผิดพลาด ลอง query แบบง่ายๆ (ไม่ใช้เงื่อนไข publish_start/publish_end)
      if (queryError.message?.includes("Unknown column") || queryError.message?.includes("doesn't exist")) {
        try {
          // ไม่จำกัดการเข้าถึง - แสดงเฉพาะที่ published แล้ว
          announcements = await query<any>(
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
            ORDER BY a.created_at DESC
            LIMIT 5`
          );
        } catch (retryError: any) {
          // ถ้ายัง error ให้ throw error เดิม
          throw queryError;
        }
      } else {
        throw queryError;
      }
    }
    
    // ถ้ายังไม่มีข้อมูล ลอง query แบบง่ายที่สุด (ไม่ใช้เงื่อนไข publish และ is_deleted)
    if (!announcements || announcements.length === 0) {
      try {
        // ไม่จำกัดการเข้าถึง - แสดงเฉพาะที่ published แล้ว
        announcements = await query<any>(
          `SELECT 
            announcement_id,
            title,
            content,
            COALESCE(target_role, 'all') as target_role,
            COALESCE(is_published, 0) as is_published,
            publish_start,
            publish_end,
            created_at,
            0 as file_count
          FROM announcements
          WHERE (
            status = 'published'
            OR 
            (status IS NULL AND COALESCE(is_published, 0) = 1)
          )
          ORDER BY created_at DESC
          LIMIT 5`
        );
      } catch (simpleError: any) {
        console.error('Simple query failed:', simpleError);
      }
    }
    
    // Log สำหรับ debug
    if (announcements && announcements.length > 0) {
      console.log(`Found ${announcements.length} announcements`);
    } else {
      console.log('No announcements found with filters, trying simpler query...');
    }
    
    return announcements || [];
  } catch (error: any) {
    console.error('Error fetching latest announcements:', error);
    
    // Fallback สุดท้าย - ลองใช้ schema ใหม่ก่อน (target_role, is_published)
    try {
      const fallbackAnnouncements = await query<any>(
        `SELECT 
          announcement_id,
          title,
          content,
          COALESCE(target_role, 'all') as target_role,
          COALESCE(is_published, 0) as is_published,
          publish_start,
          publish_end,
          created_at,
          0 as file_count
        FROM announcements
        WHERE (
          status = 'published'
          OR 
          (status IS NULL AND COALESCE(is_published, 0) = 1)
        )
        ORDER BY created_at DESC
        LIMIT 5`
      );
      return fallbackAnnouncements || [];
    } catch (fallbackError: any) {
      console.error('Fallback query failed:', fallbackError);
      
      // ลอง query แบบง่ายที่สุด (แสดงทุกประกาศที่ยังไม่ถูกลบ)
      try {
        const allAnnouncements = await query<any>(
          `SELECT 
            announcement_id,
            title,
            content,
            COALESCE(target_role, 'all') as target_role,
            COALESCE(is_published, 1) as is_published,
            publish_start,
            publish_end,
            created_at,
            0 as file_count
          FROM announcements
          WHERE (
            status = 'published'
            OR 
            (status IS NULL AND COALESCE(is_published, 1) = 1)
          )
          ORDER BY created_at DESC
          LIMIT 5`
        );
        return allAnnouncements || [];
      } catch (finalError: any) {
        console.error('Final fallback query failed:', finalError);
        
        // ลอง query แบบง่ายที่สุด (แสดงทุกประกาศ)
        try {
          const allAnnouncements = await query<any>(
            `SELECT 
              announcement_id,
              title,
              content,
              'all' as target_role,
              1 as is_published,
              NULL as publish_start,
              NULL as publish_end,
              created_at,
              0 as file_count
            FROM announcements
            ORDER BY created_at DESC
            LIMIT 5`
          );
          return allAnnouncements || [];
        } catch (lastError: any) {
          console.error('Last fallback query failed:', lastError);
          return [];
        }
      }
    }
  }
}

// ฟังก์ชันจัดรูปแบบตัวเลข
function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num);
}

export default async function HomePage() {
  // Redirect ไปที่ /admin เพื่อใช้ dashboard เดียวกัน
  redirect('/admin');
}

