'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';
import { getMenuItems } from '@/lib/menu-items';

interface AdminLayoutProps {
  children: React.ReactNode;
  sessionName?: string;
  sessionRole?: string;
  /** สิทธิ์จากตาราง auth_roles (ผ่าน auth_user_roles) ใช้จำกัดเมนู */
  appRoleCodes?: string[];
  /** label แสดงชื่อสิทธิ์หลัก จาก auth_roles.name_th */
  sessionRoleLabel?: string;
}

export default function AdminLayout({
  children,
  sessionName,
  sessionRole,
  appRoleCodes = [],
  sessionRoleLabel,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  /** โลโก้แถบข้าง: แอดมิน/การเงิน = โลโก้ รพ.ราชพิพัฒน์ (RPP), แพทยศาสตร์ = medrpp, รวงผึ้ง = dorm-rpp */
  const sidebarLogo = useMemo(() => {
    const codes = new Set(appRoleCodes ?? []);
    const legacyStaff =
      sessionRole === 'admin' || sessionRole === 'superUser';

    const adminBrand = {
      src: '/rpp-admin-logo.png',
      alt: 'โรงพยาบาลราชพิพัฒน์',
      objectFit: 'contain' as const,
    };

    if (codes.has('ADMIN')) {
      return adminBrand;
    }
    if (codes.has('FINANCE')) {
      return adminBrand;
    }
    if (codes.has('SUPERUSER_MED') || codes.has('TENANT_MED')) {
      return { src: '/medrpp.jpg', alt: 'หอพักแพทยศาสตร์', objectFit: 'cover' as const };
    }
    if (codes.has('SUPERUSER_RP') || codes.has('TENANT_RP')) {
      return { src: '/dorm-rpp.jpg', alt: 'หอพักรวงผึ้ง', objectFit: 'cover' as const };
    }
    if (legacyStaff && codes.size === 0) {
      return adminBrand;
    }
    return adminBrand;
  }, [appRoleCodes, sessionRole]);

  /** พื้นหลังโซนเนื้อหา: รูปอาคาร/แบรนด์จางๆ + ชั้นสีอ่อนทับ ไม่บังข้อความ */
  const contentBackdrop = useMemo(() => {
    const codes = new Set(appRoleCodes ?? []);
    const legacyStaff =
      sessionRole === 'admin' || sessionRole === 'superUser';

    if (codes.has('SUPERUSER_MED') || codes.has('TENANT_MED')) {
      return {
        url: '/medrpp.jpg',
        imageOpacity: 0.14,
        size: 'cover' as const,
      };
    }
    if (codes.has('SUPERUSER_RP') || codes.has('TENANT_RP')) {
      return {
        url: '/dorm-rpp.jpg',
        imageOpacity: 0.14,
        size: 'cover' as const,
      };
    }
    if (
      codes.has('ADMIN') ||
      codes.has('FINANCE') ||
      (legacyStaff && codes.size === 0)
    ) {
      return {
        url: '/rpp-admin-logo.png',
        imageOpacity: 0.06,
        size: 'contain' as const,
      };
    }
    return {
      url: '/rpp-admin-logo.png',
      imageOpacity: 0.06,
      size: 'contain' as const,
    };
  }, [appRoleCodes, sessionRole]);

  useEffect(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true');
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('adminSidebarCollapsed', String(newState));
  };

  const menuItems = getMenuItems(sessionRole, appRoleCodes);
  const roleStatusLabel = useMemo(() => {
    const codes = new Set(appRoleCodes ?? []);
    const managedBuildings: string[] = [];

    if (codes.has('SUPERUSER_RP')) {
      managedBuildings.push('หอพักรวงผึ้ง');
    }
    if (codes.has('SUPERUSER_MED')) {
      managedBuildings.push('หอพักแพทยศาสตร์');
    }

    if (managedBuildings.length > 1) {
      return `ดูแลจัดการระบบ ${managedBuildings.join(', ')}`;
    }
    if (managedBuildings.length === 1) {
      return `ดูแลจัดการระบบ ${managedBuildings[0]}`;
    }
    return sessionRoleLabel || 'ผู้ใช้งานระบบ';
  }, [appRoleCodes, sessionRoleLabel]);

  const isActive = (href: string) => {
    // รองรับทั้ง URL เดิม (/admin) และ URL ใหม่ (/dormrpp)
    const current = pathname || '';

    if (href === '/dormrpp') {
      return current === '/dormrpp' || current === '/admin';
    }

    if (href.startsWith('http')) {
      return false;
    }

    // ถ้าเมนูเป็น /dormrpp/... ให้ถือว่า active เมื่ออยู่ที่ /dormrpp/... หรือ /admin/... เดิม
    if (href.startsWith('/dormrpp')) {
      const adminHref = href.replace('/dormrpp', '/admin');
      return current.startsWith(href) || current.startsWith(adminHref);
    }

    return current.startsWith(href);
  };

  return (
    <div className="flex min-h-screen bg-slate-50/80">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-30 border-r border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-50/90 shadow-[inset_-1px_0_0_rgba(148,163,184,0.12)] transition-all duration-300 ${
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
        }`}
      >
        {/* Logo Section */}
        <div
          className={`flex items-center gap-3 border-b border-slate-200/70 bg-white/40 px-4 py-4 backdrop-blur-[2px] ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
        >
          <img
            src={sidebarLogo.src}
            alt={sidebarLogo.alt}
            className={`h-10 w-10 rounded-full flex-shrink-0 ${
              sidebarLogo.objectFit === 'contain' ? 'object-contain' : 'object-cover'
            }`}
          />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight text-slate-900">
                ระบบจัดการหอพัก
              </h1>
              <p className="truncate text-xs text-slate-500">
                โรงพยาบาลราชพิพัฒน์
              </p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="ml-auto rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100/90 hover:text-slate-800"
            title={sidebarCollapsed ? 'ขยายเมนู' : 'ยุบเมนู'}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {sidebarCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-3">
          <div className={`space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-2'}`}>
            {menuItems.map((item) => {
              const active = isActive(item.href);
              const MenuLink = item.external ? 'a' : Link;
              const linkProps = item.external
                ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
                : { href: item.href };

              return (
                <MenuLink
                  key={item.href}
                  {...linkProps}
                  className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                  } ${
                    active
                      ? 'border border-slate-200/70 border-l-[3px] border-l-teal-700 bg-white/95 text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                  }`}
                  title={sidebarCollapsed ? item.label : ''}
                >
                  {item.icon && <span className="text-lg flex-shrink-0">{item.icon}</span>}
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </MenuLink>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-50/90 shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Mobile Sidebar Header */}
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/50 px-4 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <img
                src={sidebarLogo.src}
                alt={sidebarLogo.alt}
                className={`h-10 w-10 rounded-full ${
                  sidebarLogo.objectFit === 'contain' ? 'object-contain' : 'object-cover'
                }`}
              />
              <div>
                <h1 className="text-sm font-bold tracking-tight text-slate-900">ระบบจัดการหอพัก</h1>
                <p className="text-xs text-slate-500">โรงพยาบาลราชพิพัฒน์</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100/90 hover:text-slate-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mobile Navigation */}
          <nav className="flex-1 overflow-y-auto py-3">
            <div className="space-y-0.5 px-2">
              {menuItems.map((item) => {
                const active = isActive(item.href);
                const MenuLink = item.external ? 'a' : Link;
                const linkProps = item.external
                  ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
                  : { href: item.href };

                return (
                  <MenuLink
                    key={item.href}
                    {...linkProps}
                    onClick={() => !item.external && setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'border border-slate-200/70 border-l-[3px] border-l-teal-700 bg-white/95 text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                    }`}
                  >
                    {item.icon && <span className="text-lg">{item.icon}</span>}
                    <span>{item.label}</span>
                  </MenuLink>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`relative flex min-h-screen flex-1 flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div
            className="absolute inset-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${contentBackdrop.url})`,
              backgroundSize: contentBackdrop.size,
              opacity: contentBackdrop.imageOpacity,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50/94 via-gray-50/92 to-slate-100/95" />
        </div>

        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-gradient-to-b from-white/96 via-slate-50/35 to-white/90 shadow-[0_1px_3px_rgba(15,23,42,0.05)] backdrop-blur-md">
          <div className="px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <div className="flex items-center justify-between">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100/90 hover:text-slate-800 lg:hidden"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Desktop Title - Dynamic based on pathname */}
              <div className="hidden lg:block">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  {pathname === '/admin' || pathname === '/dormrpp'
                    ? 'หน้าหลัก'
                    : pathname?.startsWith('/admin/rooms') || pathname?.startsWith('/dormrpp/rooms')
                    ? 'ห้องพัก'
                    : pathname?.startsWith('/admin/tenants') || pathname?.startsWith('/dormrpp/tenants')
                    ? 'ผู้เช่า'
                    : pathname?.startsWith('/admin/utility-readings') ||
                      pathname?.startsWith('/dormrpp/utility-readings')
                    ? 'บันทึกเลขมิเตอร์'
                    : pathname?.startsWith('/admin/bills') || pathname?.startsWith('/dormrpp/bills')
                    ? 'บิลค่าใช้จ่าย'
                    : pathname?.startsWith('/admin/announcements') ||
                      pathname?.startsWith('/dormrpp/announcements')
                    ? 'จัดการประกาศ'
                    : pathname?.startsWith('/admin/meters') || pathname?.startsWith('/dormrpp/meters')
                    ? 'ตรวจสอบ💧⚡ มิเตอร์น้ำและไฟฟ้า'
                    : pathname?.startsWith('/announcements')
                    ? 'ประกาศ'
                    : 'ระบบจัดการหอพัก'}
                </h2>
              </div>

              {/* Mobile Title */}
              <div className="lg:hidden flex-1 ml-3">
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  {pathname === '/admin' || pathname === '/dormrpp'
                    ? 'หน้าหลัก'
                    : pathname?.startsWith('/admin/rooms') || pathname?.startsWith('/dormrpp/rooms')
                    ? 'ห้องพัก'
                    : pathname?.startsWith('/admin/tenants') || pathname?.startsWith('/dormrpp/tenants')
                    ? 'ผู้เช่า'
                    : pathname?.startsWith('/admin/utility-readings') ||
                      pathname?.startsWith('/dormrpp/utility-readings')
                    ? 'บันทึกเลขมิเตอร์'
                    : pathname?.startsWith('/admin/bills') || pathname?.startsWith('/dormrpp/bills')
                    ? 'บิลค่าใช้จ่าย'
                    : pathname?.startsWith('/admin/announcements') ||
                      pathname?.startsWith('/dormrpp/announcements')
                    ? 'จัดการประกาศ'
                    : pathname?.startsWith('/admin/meters') || pathname?.startsWith('/dormrpp/meters')
                    ? '💧⚡ มิเตอร์'
                    : pathname?.startsWith('/announcements')
                    ? 'ประกาศ'
                    : 'ระบบจัดการหอพัก'}
                </h2>
              </div>

              {/* Right Side Actions - User Info and Logout */}
              {sessionName ? (
                <div className="flex items-center gap-3 ml-auto">
                  {/* Desktop User Info */}
                  <div className="hidden lg:flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 ring-2 ring-white shadow-sm">
                        <span className="text-xs font-semibold text-teal-800">
                          {sessionName.charAt(0) || 'U'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-[150px] truncate text-sm font-medium text-slate-900">
                          {sessionName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {roleStatusLabel}
                        </p>
                      </div>
                    </div>
                    <LogoutButton />
                  </div>

                  {/* Mobile User Info */}
                  <div className="lg:hidden flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 ring-2 ring-white shadow-sm">
                      <span className="text-xs font-semibold text-teal-800">
                        {sessionName.charAt(0) || 'U'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-[100px] truncate text-xs font-medium text-slate-900">
                        {sessionName}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {roleStatusLabel}
                      </p>
                    </div>
                    <LogoutButton />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 ml-auto">
                  <Link
                    href="/login"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
                  >
                    เข้าสู่ระบบ
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="relative z-10 flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

