'use client';

import { useState, useEffect } from 'react';
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Desktop */}
      <aside className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-30 bg-white border-r border-gray-200 transition-all duration-300 ${
        sidebarCollapsed ? 'lg:w-16' : 'lg:w-64'
      }`}>
        {/* Logo Section */}
        <div className={`flex items-center gap-3 px-4 py-4 border-b border-gray-200 ${
          sidebarCollapsed ? 'justify-center' : ''
        }`}>
          <img
            src="/logo.jpg"
            alt="หอพักรวงผึ้ง"
            className="h-10 w-10 object-cover rounded-full flex-shrink-0"
          />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">
                ระบบจัดการหอพัก
              </h1>
              <p className="text-xs text-gray-500 truncate">
                โรงพยาบาลราชพิพัฒน์
              </p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="ml-auto p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
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
        <nav className="flex-1 overflow-y-auto py-4">
          <div className={`space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-2'}`}>
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
                  className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                    sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                  } ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100'
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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Mobile Sidebar Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <img
                src="/logo.jpg"
                alt="หอพักรวงผึ้ง"
                className="h-10 w-10 object-cover rounded-full"
              />
              <div>
                <h1 className="text-sm font-bold text-gray-900">ระบบจัดการหอพัก</h1>
                <p className="text-xs text-gray-500">โรงพยาบาลราชพิพัฒน์</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mobile Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <div className="px-2 space-y-1">
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
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-gray-700 hover:bg-gray-100'
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
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
      }`}>
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Desktop Title - Dynamic based on pathname */}
              <div className="hidden lg:block">
                <h2 className="text-lg font-semibold text-gray-900">
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
                <h2 className="text-base font-semibold text-gray-900">
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
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-xs font-medium text-blue-700">
                          {sessionName.charAt(0) || 'U'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                          {sessionName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {sessionRoleLabel || 'ผู้ใช้งานระบบ'}
                        </p>
                      </div>
                    </div>
                    <LogoutButton />
                  </div>

                  {/* Mobile User Info */}
                  <div className="lg:hidden flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-xs font-medium text-blue-700">
                        {sessionName.charAt(0) || 'U'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate max-w-[100px]">
                        {sessionName}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {sessionRoleLabel || 'ผู้ใช้งานระบบ'}
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
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

