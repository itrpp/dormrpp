// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getAppRolesForSessionUser, type AppRoleCode } from '@/lib/auth/app-roles';
import { getAdminBuildingScopeFromAppRoles } from '@/lib/auth/building-scope';

const HOSPITAL = 'โรงพยาบาลราชพิพัฒน์';

async function fetchBuildingNamesOrdered(buildingIds?: number[]): Promise<string[]> {
  if (buildingIds !== undefined && buildingIds.length === 0) {
    return [];
  }
  const sql =
    buildingIds !== undefined
      ? `SELECT name_th FROM buildings WHERE building_id IN (${buildingIds.map(() => '?').join(',')}) ORDER BY building_id`
      : 'SELECT name_th FROM buildings ORDER BY building_id';
  const rows = await query<{ name_th: string | null }>(sql, buildingIds ?? []);
  return rows.map((r) => r.name_th?.trim()).filter((n): n is string => Boolean(n));
}

export async function generateMetadata(): Promise<Metadata> {
  const icons = {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.ico', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  };

  const session = await getSession();
  if (!session?.username) {
    const names = await fetchBuildingNamesOrdered();
    const label = names.length > 0 ? names.join(' · ') : 'หอพัก';
    return {
      title: `${label} - ${HOSPITAL}`,
      description: `ระบบจัดการหอพัก ${HOSPITAL}`,
      icons,
    };
  }

  const roles = await getAppRolesForSessionUser(session).catch(() => [] as AppRoleCode[]);
  if (roles.includes('ADMIN')) {
    return {
      title: 'หอพัก',
      description: `ระบบจัดการหอพัก ${HOSPITAL}`,
      icons,
    };
  }

  const scope = getAdminBuildingScopeFromAppRoles(roles);
  const names =
    scope.kind === 'all'
      ? await fetchBuildingNamesOrdered()
      : await fetchBuildingNamesOrdered(scope.buildingIds);
  const label = names.length > 0 ? names.join(' · ') : 'หอพัก';
  return {
    title: `${label} - ${HOSPITAL}`,
    description: `ระบบจัดการหอพัก ${HOSPITAL}`,
    icons,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}

