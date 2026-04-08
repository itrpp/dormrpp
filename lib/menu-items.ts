// lib/menu-items.ts - จำกัดสิทธิ์เมนูตามตาราง auth_roles (ผ่าน appRoleCodes จาก auth_user_roles)
export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  external?: boolean;
  public?: boolean;
  /** สิทธิ์จาก auth_roles (code) ที่เห็นเมนูนี้; ถ้ามี ADMIN = เห็นทุกเมนูที่ requiredAppRoles ตรง */
  requiredAppRoles?: string[];
}

const MENU_ITEMS: MenuItem[] = [
  // ส่วน Admin / เจ้าหน้าที่ (ใช้ URL /dormrpp แทน /admin)
  { href: '/dormrpp', label: 'หน้าหลัก', icon: '🏠', public: true },
  { href: '/dormrpp/rooms', label: 'ห้องพัก', icon: '🏢', requiredAppRoles: ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'] },
  { href: '/dormrpp/tenants', label: 'ผู้เช่า', icon: '👥', requiredAppRoles: ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'] },
  { href: '/dormrpp/utility-readings', label: 'บันทึกเลขมิเตอร์', icon: '📝', requiredAppRoles: ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'] },
  { href: '/dormrpp/meters', label: '💧⚡ตรวจสอบ มิเตอร์น้ำ-ไฟ', icon: '', public: true },
  { href: '/dormrpp/bills', label: 'บิลค่าใช้จ่าย', icon: '💰', requiredAppRoles: ['ADMIN', 'FINANCE', 'SUPERUSER_RP', 'SUPERUSER_MED'] },
  { href: '/dormrpp/announcements', label: 'จัดการประกาศ', icon: '📢', requiredAppRoles: ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'] },
  { href: '/dormrpp/tenant-mappings', label: 'แมปผู้ใช้↔ผู้เช่าเพื่อดูบิล', icon: '🧩', requiredAppRoles: ['ADMIN', 'SUPERUSER_RP', 'SUPERUSER_MED'] },
  { href: '/dormrpp/user-roles', label: 'สิทธิ์ผู้ใช้', icon: '🔐', requiredAppRoles: ['ADMIN'] },

  // ส่วนเมนูสำหรับผู้เช่า / ผู้ใช้งานทั่วไป
  { href: '/my/bills', label: 'บิลของฉัน', icon: '🧾', requiredAppRoles: [ 'TENANT_RP', 'TENANT_MED'] },
  { href: '/announcements', label: 'ประกาศ', icon: '📢', public: true },
];

/**
 * กรองเมนูตามสิทธิ์จากตาราง auth_roles (appRoleCodes = รหัสจาก auth_user_roles + auth_roles)
 * - ถ้าไม่มี appRoleCodes ส่งมา: ใช้ sessionRole (admin/superUser) แทนเพื่อ backward compatibility
 */
export function getMenuItems(sessionRole?: string, appRoleCodes?: string[]): MenuItem[] {
  const isAdmin = sessionRole === 'admin' || sessionRole === 'superUser';
  const hasAdminRole = Boolean(appRoleCodes?.includes('ADMIN'));

  const filteredItems = MENU_ITEMS.filter((item) => {
    if (item.public) return true;

    if (appRoleCodes && appRoleCodes.length > 0) {
      if (hasAdminRole) return true;
      if (item.requiredAppRoles?.length) {
        return item.requiredAppRoles.some((r) => appRoleCodes.includes(r));
      }
      return false;
    }

    return isAdmin;
  });

  return filteredItems.filter((item, index, self) =>
    index === self.findIndex((t) => t.href === item.href)
  );
}

