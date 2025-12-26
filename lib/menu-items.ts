// lib/menu-items.ts - Shared menu items configuration
export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  external?: boolean;
  public?: boolean; // true = visible to non-logged in users
  adminOnly?: boolean; // true = visible only to admin
}

export function getMenuItems(sessionRole?: string): MenuItem[] {
  const isAdmin = sessionRole === 'admin' || sessionRole === 'superUser';

  const allMenuItems: MenuItem[] = [
    { href: '/admin', label: 'หน้าหลัก', icon: '🏠', public: true },
    { href: '/admin/rooms', label: 'ห้องพัก', icon: '🏢', public: false, adminOnly: true },
    { href: '/admin/tenants', label: 'ผู้เช่า', icon: '👥', public: false, adminOnly: true },
    { href: '/admin/utility-readings', label: 'บันทึกเลขมิเตอร์', icon: '📝', public: false, adminOnly: true },
    { href: '/admin/meters', label: '💧⚡ตรวจสอบ มิเตอร์น้ำ-ไฟ', icon: '', public: true },
    { href: '/admin/bills', label: 'บิลค่าใช้จ่าย', icon: '💰', public: false, adminOnly: true },
    { href: 'https://services.rpphosp.go.th/auth', label: 'การซ่อมบำรุง', icon: '🔧', external: true, public: true },
    { href: '/announcements', label: 'ประกาศ', icon: '📢', public: true }, // สำหรับ user ทั่วไป
    { href: '/admin/announcements', label: 'จัดการประกาศ', icon: '📢', public: false, adminOnly: true }, // สำหรับ admin
  ];

  // กรองเมนูตาม role และป้องกันการซ้ำ
  const filteredItems = allMenuItems.filter(item => {
    // ถ้าเป็น admin ให้แสดงทุกเมนู
    if (isAdmin) {
      return true;
    }
    // ถ้าไม่ใช่ admin ให้แสดงเฉพาะเมนูที่เป็น public และไม่ใช่ adminOnly
    return item.public && !item.adminOnly;
  });

  // ลบเมนูที่ซ้ำกัน (ถ้ามี href เดียวกัน)
  const uniqueItems = filteredItems.filter((item, index, self) =>
    index === self.findIndex((t) => t.href === item.href)
  );

  return uniqueItems;
}

