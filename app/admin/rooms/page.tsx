// app/admin/rooms/page.tsx - List & manage rooms
import { getAllRooms } from '@/lib/repositories/rooms';
import AdminRoomsClient from './AdminRoomsClient';

export default async function AdminRoomsPage() {
  const rooms = await getAllRooms();

  return <AdminRoomsClient initialRooms={rooms} />;
}

