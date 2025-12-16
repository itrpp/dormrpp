// app/api/buildings/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Building } from '@/types/db';

// GET /api/buildings
export async function GET(req: Request) {
  try {
    const buildings = await query<Building>(
      'SELECT building_id, name_th, name_en FROM buildings ORDER BY building_id'
    );
    return NextResponse.json(buildings);
  } catch (error: any) {
    console.error('Error fetching buildings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch buildings' },
      { status: 500 }
    );
  }
}

