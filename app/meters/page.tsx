// app/meters/page.tsx - Redirect to /admin/meters
import { redirect } from 'next/navigation';

export default function MetersPage() {
  redirect('/admin/meters');
}
