// app/admin/utility-readings/page.tsx
import { getResolvedAllowedBuildingIdsForServerUser } from '@/lib/auth/server-building-scope';
import UtilityReadingsClient from './UtilityReadingsClient';

export const dynamic = 'force-dynamic';

export default async function UtilityReadingsPage() {
  const visibleBuildingIds =
    await getResolvedAllowedBuildingIdsForServerUser();
  return (
    <UtilityReadingsClient visibleBuildingIds={visibleBuildingIds} />
  );
}

