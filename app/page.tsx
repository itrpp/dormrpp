// app/page.tsx - Landing page / login redirect
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function HomePage() {
  const session = await getSession();

  // ถ้ามี session ให้ redirect ตาม role
  if (session) {
    if (session.role === 'admin' || session.role === 'superUser') {
      redirect('/admin');
    } else {
      redirect('/my');
    }
  }

  // ถ้าไม่มี session ให้ redirect ไป login
  redirect('/login');
}

