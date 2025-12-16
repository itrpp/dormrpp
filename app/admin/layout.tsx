// app/admin/layout.tsx - Admin layout with navigation menu
import Link from 'next/link';
import { ReactNode } from 'react';
import { getSession } from '@/lib/auth/session';
import LogoutButton from '@/components/LogoutButton';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center gap-3">
                <Link href="/admin" className="flex items-center gap-3">
                  <img
                    src="/logo.jpg"
                    alt="Dormitory RPP Logo"
                    className="h-10 w-10 object-cover rounded-full"
                  />
                  <span className="text-xl font-bold text-gray-800">
                    ระบบจัดการหอพัก - ผู้ดูแล
                  </span>
                </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/admin"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  หน้าหลัก
                </Link>
                <Link
                  href="/admin/rooms"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  ห้องพัก
                </Link>
                <Link
                  href="/admin/tenants"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  ผู้เช่า
                </Link>
                <Link
                  href="/admin/utility-readings"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  บันทึกเลขมิเตอร์
                </Link>
                <Link
                  href="/admin/bills"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  บิลค่าใช้จ่าย
                </Link>
                <a
                  href="https://services.rpphosp.go.th/auth"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  การซ่อมบำรุง
                </a>
                <Link
                  href="/admin/announcements"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  ประกาศ
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {session && (
                <span className="text-sm text-gray-600">
                  {session.name}
                </span>
              )}
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

