// app/admin/rooms/page.tsx - List & manage rooms
import { getAllRooms } from '@/lib/repositories/rooms';
import { getResolvedAllowedBuildingIdsForServerUser } from '@/lib/auth/server-building-scope';
import AdminRoomsClient from './AdminRoomsClient';

export default async function AdminRoomsPage() {
  const allowedBuildingIds =
    await getResolvedAllowedBuildingIdsForServerUser();
  const rooms = await getAllRooms(undefined, allowedBuildingIds);

  return <AdminRoomsClient initialRooms={rooms} />;
}

