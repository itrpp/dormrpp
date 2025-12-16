// app/api/rooms/[roomId]/details/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getRoomById } from '@/lib/repositories/rooms';
import { getAllTenants } from '@/lib/repositories/tenants';

type Params = {
  params: {
    roomId: string;
  };
};

export async function GET(req: Request, { params }: Params) {
  try {
    const roomId = Number(params.roomId);

    if (isNaN(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID' },
        { status: 400 }
      );
    }

    // ดึงข้อมูลห้อง
    const room = await getRoomById(roomId);

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // ดึงข้อมูลผู้เข้าพัก (active contracts)
    let tenants: any[] = [];
    try {
      tenants = await getAllTenants(roomId);
    } catch (error: any) {
      // ถ้าไม่มี contracts table หรือ error อื่นๆ ให้ tenants เป็น array ว่าง
      console.warn('Cannot fetch tenants for room:', error.message);
    }

    // ดึงข้อมูลบิลล่าสุด (ถ้ามี)
    let recentBills: any[] = [];
    try {
      const now = new Date();
      const buddhistYear = now.getFullYear() + 543;
      const currentMonth = now.getMonth() + 1;

      recentBills = await query(
        `SELECT b.bill_id, b.billing_year, b.billing_month, 
                b.total_amount, b.status, b.due_date
         FROM bills b
         WHERE b.room_id = ?
         ORDER BY b.billing_year DESC, b.billing_month DESC
         LIMIT 3`,
        [roomId]
      );
    } catch (error: any) {
      // ถ้าไม่มี bills table ให้ bills เป็น array ว่าง
      console.warn('Cannot fetch bills for room:', error.message);
    }

    return NextResponse.json({
      room,
      tenants,
      recentBills,
    });
  } catch (error: any) {
    console.error('Error fetching room details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch room details' },
      { status: 500 }
    );
  }
}

