'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface PublicLayoutProps {
  children: React.ReactNode;
  session?: { name?: string; role?: string } | null;
}

export default function PublicLayout({ children, session }: PublicLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    { href: '/', label: 'หน้าหลัก', icon: '🏠' },
    { href: '/meters', label: 'มิเตอร์น้ำ-ไฟ', icon: '💧⚡' },
    { href: '/announcements', label: 'ประกาศ', icon: '📢' },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-30 bg-white border-r border-gray-200">
        {/* Logo Section */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200">
          <img
            src="/logo.jpg"
            alt="หอพักรวงผึ้ง"
            className="h-10 w-10 object-cover rounded-full flex-shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate">
              หอพักรวงผึ้ง
            </h1>
            <p className="text-xs text-gray-500 truncate">
              โรงพยาบาลราชพิพัฒน์
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="px-2 space-y-1">
            {menuItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {item.icon && <span className="text-lg">{item.icon}</span>}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Section */}
        {session && (
          <div className="px-4 py-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-xs font-medium text-blue-700">
                  {session.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 truncate">
                  {session.name}
                </p>
                <Link
                  href="/admin"
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  หน้าผู้ดูแล
                </Link>
              </div>
            </div>
          </div>
        )}
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
                <h1 className="text-sm font-bold text-gray-900">หอพักรวงผึ้ง</h1>
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
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{item.icon || '📄'}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Mobile User Section */}
          {session && (
            <div className="px-4 py-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-xs font-medium text-blue-700">
                    {session.name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {session.name}
                  </p>
                  <Link
                    href="/admin"
                    className="text-xs text-blue-600 hover:text-blue-700"
                    onClick={() => setSidebarOpen(false)}
                  >
                    หน้าผู้ดูแล
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64">
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
            {pathname === '/' ? 'หน้าหลัก' : 
             pathname?.startsWith('/meters') ? '💧⚡ มิเตอร์น้ำและไฟฟ้า' :
             pathname?.startsWith('/announcements') ? '📢 ประกาศ' :
             'หอพักรวงผึ้ง'}
          </h2>
        </div>

              {/* Right Side Actions */}
              <div className="flex items-center gap-3 ml-auto">
                {session ? (
                  <>
                    <span className="hidden sm:inline text-sm text-gray-600">
                      {session.name}
                    </span>
                    <Link
                      href="/admin"
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
                    >
                      หน้าผู้ดูแล
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
                  >
                    เข้าสู่ระบบ
                  </Link>
                )}
              </div>
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

