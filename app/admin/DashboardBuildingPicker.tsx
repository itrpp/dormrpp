'use client';

import { useRouter, usePathname } from 'next/navigation';

export type DashboardBuildingOption = {
  building_id: number;
  name_th: string;
};

type Props = {
  buildings: DashboardBuildingOption[];
  /** null = เลือก "ทุกอาคาร" / รวมเขต */
  selectedBuildingId: number | null;
  allLabel: string;
};

export default function DashboardBuildingPicker({
  buildings,
  selectedBuildingId,
  allLabel,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const value = selectedBuildingId == null ? '' : String(selectedBuildingId);

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-600 whitespace-nowrap shrink-0">เลือกอาคาร</span>
      <select
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 bg-white min-w-[12rem] max-w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') {
            router.push(pathname);
          } else {
            router.push(`${pathname}?building_id=${encodeURIComponent(v)}`);
          }
        }}
      >
        <option value="">{allLabel}</option>
        {buildings.map((b) => (
          <option key={b.building_id} value={b.building_id}>
            {b.name_th}
          </option>
        ))}
      </select>
    </label>
  );
}
