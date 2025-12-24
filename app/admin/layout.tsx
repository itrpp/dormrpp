// app/admin/layout.tsx - Admin layout with sidebar navigation
import { ReactNode } from 'react';
import { getSession } from '@/lib/auth/session';
import AdminLayoutClient from '@/components/AdminLayout';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <AdminLayoutClient sessionName={session?.name}>
        {children}
    </AdminLayoutClient>
  );
}

