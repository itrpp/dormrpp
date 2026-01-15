// app/api/bills/[billId]/individual/route.ts
// API สำหรับดึงข้อมูลบิลรายคนสำหรับ preview
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getMonthNameThai } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

// GET /api/bills/[billId]/individual
export async function GET(
  req: Request,
  { params }: { params: { billId: string } }
) {
  try {
    const billId = parseInt(params.billId, 10);

    if (isNaN(billId)) {
      return NextResponse.json(
        { error: 'Invalid bill ID' },
        { status: 400 }
      );
    }

    // ดึงข้อมูลบิลรายคน
    const sql = `
      SELECT 
        b.bill_id,
        b.tenant_id,
        b.room_id,
        b.contract_id,
        b.cycle_id,
        1000 AS maintenance_fee,
        b.status,
        cy.billing_year,
        cy.billing_month,
        cy.start_date AS billing_date,
        cy.end_date,
        cy.due_date,
        r.room_number,
        r.floor_no,
        bu.building_id,
        bu.name_th AS building_name,
        t.tenant_id,
        t.first_name_th AS first_name,
        t.last_name_th AS last_name,
        t.email,
        t.phone,
        c.contract_id,
        c.start_date AS move_in_date,
        c.end_date AS move_out_date,
        c.status AS contract_status,
        (SELECT COUNT(*) FROM contracts c2 WHERE c2.room_id = r.room_id AND c2.status = 'active') AS tenant_count
      FROM bills b
      JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
      JOIN contracts c ON b.contract_id = c.contract_id
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings bu ON r.building_id = bu.building_id
      WHERE b.bill_id = ?
    `;

    const bills = await query<any>(sql, [billId]);

    if (!bills || bills.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลบิล' },
        { status: 404 }
      );
    }

    const bill = bills[0];

    // ดึง utility readings
    const utilityReadings = await query(
      `SELECT 
        bur.reading_id,
        bur.room_id,
        bur.cycle_id,
        bur.utility_type_id,
        bur.meter_start,
        bur.meter_end,
        ut.code AS utility_code,
        ut.name_th AS utility_name,
        COALESCE(
          (SELECT rate_per_unit 
           FROM utility_rates 
           WHERE utility_type_id = bur.utility_type_id
             AND effective_date <= COALESCE(bc.end_date, CURDATE())
           ORDER BY effective_date DESC 
           LIMIT 1),
          0
        ) AS rate_per_unit
       FROM bill_utility_readings bur
       JOIN utility_types ut ON bur.utility_type_id = ut.utility_type_id
       LEFT JOIN billing_cycles bc ON bur.cycle_id = bc.cycle_id
       WHERE bur.cycle_id = ? AND bur.room_id = ?
       ORDER BY bur.utility_type_id`,
      [bill.cycle_id, bill.room_id]
    );

    const electricReading = utilityReadings.find((ur: any) => ur.utility_code === 'electric');
    const waterReading = utilityReadings.find((ur: any) => ur.utility_code === 'water');

    // ดึงรูปภาพมิเตอร์ (ถ้ามี) เพื่อใช้ในหน้า preview
    let meterPhotos: any[] = [];
    try {
      meterPhotos = await query(
        `SELECT 
          photo_id,
          utility_type,
          photo_path,
          meter_value,
          reading_date
        FROM meter_photos
        WHERE room_id = ? 
          AND billing_year = ? 
          AND billing_month = ?
        ORDER BY utility_type, reading_date DESC`,
        [bill.room_id, bill.billing_year, bill.billing_month]
      );
    } catch (error: any) {
      console.warn('Error fetching meter photos:', error.message);
    }

    const electricPhoto = meterPhotos.find((p: any) => p.utility_type === 'electric');
    const waterPhoto = meterPhotos.find((p: any) => p.utility_type === 'water');

    // สร้างเลขที่บิล: B-YYYY-MM-XXXXX
    const adYear = bill.billing_year - 543;
    const billNumber = `B-${adYear}-${String(bill.billing_month).padStart(2, '0')}-${String(bill.bill_id).padStart(5, '0')}`;

    // ฟังก์ชันแปลงวันที่
    const formatDateThai = (dateStr: string | null): string => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear() + 543;
      const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      return `${day} ${monthNames[month - 1]} ${year}`;
    };

    // คำนวณยอดรวมเบื้องต้นจากค่าที่เก็บในตาราง bills (จะไม่ใช้ต่อใน summary ใหม่)
    const utilityTotal = Number(bill.electric_amount || 0) + Number(bill.water_amount || 0);
    const maintenanceFee = Number(bill.maintenance_fee || 0);
    const totalAmount = Number(bill.total_amount || 0);

    // สถานะบิล
    const statusText = bill.status === 'paid' ? 'ชำระแล้ว' : bill.status === 'sent' ? 'ส่งแล้ว' : 'รอชำระ';

    return NextResponse.json({
      bill: {
        bill_id: bill.bill_id,
        bill_number: billNumber,
        billing_date: formatDateThai(bill.billing_date),
        due_date: formatDateThai(bill.due_date),
        status: bill.status,
        status_text: statusText,
      },
      tenant: {
        first_name: bill.first_name || '',
        last_name: bill.last_name || '',
        room_number: bill.room_number || '-',
        floor_no: bill.floor_no || '-',
        building_name: bill.building_name || '-',
        billing_month: getMonthNameThai(bill.billing_month),
        billing_year: bill.billing_year,
        contract_status: bill.contract_status === 'active' ? 'Active' : bill.contract_status || '-',
        tenant_count: bill.tenant_count || 1,
      },
      charges: {
        maintenance_fee: Number(bill.maintenance_fee || 0),
        other_fixed: 0,
        discount: 0,
      },
      utilities: {
        electric: electricReading ? (() => {
          const start = Number(electricReading.meter_start || 0);
          const end = Number(electricReading.meter_end || 0);
          const MOD = 10000; // มิเตอร์ไฟฟ้า 4 หลัก
          const usage = end >= start 
            ? end - start 
            : (MOD - start) + end; // กรณี rollover เช่น 9823 → 173
          const rate = Number(electricReading.rate_per_unit || 0);
          const totalAmountForRoom = usage * rate; // ยอดรวมของห้อง
          const tenantCount = Math.max(bill.tenant_count || 1, 1);
          const amount = totalAmountForRoom / tenantCount; // หารด้วยจำนวนผู้เช่า (ยอดต่อคน)
          return {
            meter_start: electricReading.meter_start || 0,
            meter_end: electricReading.meter_end || 0,
            usage: usage,
            rate_per_unit: rate,
            amount: amount,
          };
        })() : null,
        water: waterReading ? (() => {
          const usage = (waterReading.meter_end || 0) - (waterReading.meter_start || 0);
          const rate = Number(waterReading.rate_per_unit || 0);
          const totalAmountForRoom = usage * rate; // ยอดรวมของห้อง
          const tenantCount = Math.max(bill.tenant_count || 1, 1);
          const amount = totalAmountForRoom / tenantCount; // หารด้วยจำนวนผู้เช่า (ยอดต่อคน)
          return {
            meter_start: waterReading.meter_start || 0,
            meter_end: waterReading.meter_end || 0,
            usage: usage,
            rate_per_unit: rate,
            amount: amount,
          };
        })() : null,
      },
      summary: {
        utility_total: (() => {
          // คำนวณ utility_total ต่อคนจาก amount ที่คำนวณจากมิเตอร์และ rate ÷ จำนวนผู้เช่า
          const tenantCount = Math.max(bill.tenant_count || 1, 1);
          const electricAmount = electricReading
            ? (() => {
                const start = Number(electricReading.meter_start || 0);
                const end = Number(electricReading.meter_end || 0);
                const MOD = 10000;
                const usage = end >= start ? end - start : (MOD - start) + end;
                const totalAmountForRoom = usage * Number(electricReading.rate_per_unit || 0);
                return totalAmountForRoom / tenantCount; // หารด้วยจำนวนผู้เช่า
              })()
            : 0;

          const waterAmount = waterReading
            ? (() => {
                const totalAmountForRoom = ((waterReading.meter_end || 0) - (waterReading.meter_start || 0)) *
                  Number(waterReading.rate_per_unit || 0);
                return totalAmountForRoom / tenantCount; // หารด้วยจำนวนผู้เช่า
              })()
            : 0;

          return Number(electricAmount) + Number(waterAmount);
        })(),
        maintenance_fee: Number(maintenanceFee), // ค่าบำรุงรักษาแต่ละคนจ่ายเต็ม (ไม่ต้องหาร)
        total_amount: (() => {
          // คำนวณ total_amount ต่อคน = (ค่าไฟต่อคน) + (ค่าน้ำต่อคน) + ค่าบำรุงรักษา
          const tenantCount = Math.max(bill.tenant_count || 1, 1);
          const utilityTotalFromReadings = (() => {
            const electricAmount = electricReading
              ? (() => {
                  const start = Number(electricReading.meter_start || 0);
                  const end = Number(electricReading.meter_end || 0);
                  const MOD = 10000;
                  const usage = end >= start ? end - start : (MOD - start) + end;
                  const totalAmountForRoom = usage * Number(electricReading.rate_per_unit || 0);
                  return totalAmountForRoom / tenantCount; // หารด้วยจำนวนผู้เช่า
                })()
              : 0;

            const waterAmount = waterReading
              ? (() => {
                  const totalAmountForRoom = ((waterReading.meter_end || 0) - (waterReading.meter_start || 0)) *
                    Number(waterReading.rate_per_unit || 0);
                  return totalAmountForRoom / tenantCount; // หารด้วยจำนวนผู้เช่า
                })()
              : 0;

            return Number(electricAmount) + Number(waterAmount);
          })();

          return Number(utilityTotalFromReadings) + Number(maintenanceFee);
        })(),
      },
      meter_photos: {
        electric: electricPhoto ? {
          photo_id: electricPhoto.photo_id,
          photo_url: `/api/meter-photos/${electricPhoto.photo_id}/download`,
        } : null,
        water: waterPhoto ? {
          photo_id: waterPhoto.photo_id,
          photo_url: `/api/meter-photos/${waterPhoto.photo_id}/download`,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching individual bill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch bill' },
      { status: 500 }
    );
  }
}

