// app/api/bills/[billId]/route.ts
import { NextResponse } from 'next/server';
import { getBillById, updateBill, deleteBill } from '@/lib/repositories/bills';

// GET /api/bills/[billId]
export async function GET(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = Number(params.billId);
    const bill = await getBillById(billId);

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(bill);
  } catch (error) {
    console.error('Error fetching bill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill' },
      { status: 500 }
    );
  }
}

// PATCH /api/bills/[billId]
export async function PATCH(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = Number(params.billId);
    const body = await req.json();

    await updateBill(billId, {
      maintenance_fee: body.maintenance_fee !== undefined ? Number(body.maintenance_fee) : undefined,
      electric_amount: body.electric_amount !== undefined ? Number(body.electric_amount) : undefined,
      water_amount: body.water_amount !== undefined ? Number(body.water_amount) : undefined,
      subtotal_amount: body.subtotal_amount !== undefined ? Number(body.subtotal_amount) : undefined,
      total_amount: body.total_amount !== undefined ? Number(body.total_amount) : undefined,
      status: body.status,
    });

    return NextResponse.json({ message: 'Bill updated' });
  } catch (error) {
    console.error('Error updating bill:', error);
    return NextResponse.json(
      { error: 'Failed to update bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/bills/[billId]
export async function DELETE(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = Number(params.billId);
    await deleteBill(billId);

    return NextResponse.json({ message: 'Bill deleted' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    return NextResponse.json(
      { error: 'Failed to delete bill' },
      { status: 500 }
    );
  }
}

