import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

// หน้า /my ไม่ต้องมี UI แยกแล้ว
// ถ้าเข้ามา ให้ redirect ไปที่ /my/bills โดยตรง
export default async function MyIndexPage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  redirect('/my/bills');
}

