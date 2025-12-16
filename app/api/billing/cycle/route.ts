// app/api/billing/cycle/route.ts
import { NextResponse } from 'next/server';
import { getOrCreateBillingCycle } from '@/lib/repositories/bills';

// GET /api/billing/cycle?year=2568&month=10
// POST /api/billing/cycle
// body: { year, month, start_date?, end_date?, due_date? }
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    const cycleId = await getOrCreateBillingCycle(Number(year), Number(month));
    return NextResponse.json({ cycle_id: cycleId });
  } catch (error: any) {
    console.error('Error getting billing cycle:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get billing cycle' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { year, month, start_date, end_date, due_date } = body;

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    const cycleId = await getOrCreateBillingCycle(
      Number(year),
      Number(month),
      start_date ? new Date(start_date) : undefined,
      end_date ? new Date(end_date) : undefined,
      due_date ? new Date(due_date) : undefined
    );

    return NextResponse.json({ cycle_id: cycleId }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating billing cycle:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create billing cycle' },
      { status: 500 }
    );
  }
}

