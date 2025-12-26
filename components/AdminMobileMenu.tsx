// components/AdminMobileMenu.tsx - Mobile menu for admin layout
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getMenuItems } from '@/lib/menu-items';

interface MobileMenuProps {
  sessionName?: string;
  sessionRole?: string;
}

export default function AdminMobileMenu({ sessionName, sessionRole }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // ใช้เมนูจากไฟล์ shared
  const menuItems = getMenuItems(sessionRole);

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-expanded={isOpen}
        aria-label="Toggle menu"
      >
        <svg
          className={`h-6 w-6 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out sm:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Mobile Menu Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <img
                src="/logo.jpg"
                alt="หอพักรวงผึ้ง"
                className="h-8 w-8 object-cover rounded-full"
              />
              <span className="text-sm font-bold text-gray-800">เมนู</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mobile Menu Items */}
          <nav className="flex-1 overflow-y-auto py-4">
            {menuItems.map((item) => {
              const active = isActive(item.href);
              const className = `block px-4 py-3 text-base font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`;

              const MenuLink = item.external ? 'a' : Link;
              const linkProps = item.external
                ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
                : { href: item.href };

              return (
                <MenuLink
                  key={item.href}
                  {...linkProps}
                  className={className}
                  onClick={() => !item.external && setIsOpen(false)}
                >
                  {item.icon && <span className="mr-2">{item.icon}</span>}
                  {item.label}
                </MenuLink>
              );
            })}
          </nav>

          {/* Mobile Menu Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            {sessionName && (
              <p className="text-sm text-gray-600 mb-3">{sessionName}</p>
            )}
            <button
              onClick={async () => {
                setIsLoggingOut(true);
                try {
                  const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                  });
                  if (response.ok) {
                    router.push('/login');
                    router.refresh();
                  }
                } catch (error) {
                  console.error('Logout error:', error);
                } finally {
                  setIsLoggingOut(false);
                }
              }}
              disabled={isLoggingOut}
              className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
            >
              {isLoggingOut ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

