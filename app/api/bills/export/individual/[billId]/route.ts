// app/api/bills/export/individual/[billId]/route.ts
// API สำหรับ export บิลรายคน (Excel) ตามแบบราชการ
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { query } from '@/lib/db';
import { getMonthNameThai } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

// GET /api/bills/export/individual/[billId]
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
        b.maintenance_fee,
        b.electric_amount,
        b.water_amount,
        b.subtotal_amount,
        b.total_amount,
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

    // สร้างเลขที่บิล: B-YYYY-MM-XXXXX (ใช้ bill_id)
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

    // สร้าง Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('ใบแจ้งค่าใช้จ่าย');

    // ตั้งค่าความกว้างคอลัมน์
    worksheet.columns = [
      { width: 15 }, // A
      { width: 40 }, // B
      { width: 15 }, // C
      { width: 15 }, // D
      { width: 15 }, // E
      { width: 15 }, // F
      { width: 15 }, // G
    ];

    // ส่วนที่ 1: Header
    worksheet.mergeCells('A1:G1');
    const headerCell = worksheet.getCell('A1');
    headerCell.value = 'ใบแจ้งค่าใช้จ่ายหอพัก';
    headerCell.font = { size: 18, bold: true };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:G2');
    const hospitalCell = worksheet.getCell('A2');
    hospitalCell.value = 'โรงพยาบาลราชพิพัฒน์';
    hospitalCell.font = { size: 16, bold: true };
    hospitalCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // เส้นคั่น
    worksheet.mergeCells('A3:G3');
    const lineCell = worksheet.getCell('A3');
    lineCell.value = '-----------------------------------------------';
    lineCell.alignment = { horizontal: 'center' };

    // ข้อมูลด้านขวาบน
    worksheet.getCell('E4').value = `เลขที่บิล : ${billNumber}`;
    worksheet.getCell('E4').font = { size: 11 };
    worksheet.getCell('E5').value = `วันที่ออกบิล : ${formatDateThai(bill.billing_date)}`;
    worksheet.getCell('E5').font = { size: 11 };
    worksheet.getCell('E6').value = `กำหนดชำระ : ${formatDateThai(bill.due_date)}`;
    worksheet.getCell('E6').font = { size: 11 };

    // ส่วนที่ 2: ข้อมูลผู้เช่า
    worksheet.mergeCells('A8:G8');
    const tenantHeaderCell = worksheet.getCell('A8');
    tenantHeaderCell.value = 'ข้อมูลผู้เข้าพัก';
    tenantHeaderCell.font = { size: 14, bold: true };
    tenantHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    worksheet.mergeCells('A9:G9');
    const tenantLineCell = worksheet.getCell('A9');
    tenantLineCell.value = '-----------------------------------------------';

    worksheet.getCell('A10').value = 'ชื่อ–สกุล';
    worksheet.getCell('A10').font = { bold: true };
    worksheet.getCell('B10').value = `: ${bill.first_name || ''} ${bill.last_name || ''}`;

    worksheet.getCell('A11').value = 'เลขที่ห้อง';
    worksheet.getCell('A11').font = { bold: true };
    worksheet.getCell('B11').value = `: ${bill.room_number || '-'}`;
    worksheet.getCell('C11').value = `ชั้น : ${bill.floor_no || '-'}`;

    worksheet.getCell('A12').value = 'อาคาร';
    worksheet.getCell('A12').font = { bold: true };
    worksheet.getCell('B12').value = `: ${bill.building_name || '-'}`;

    worksheet.getCell('A13').value = 'รอบบิล';
    worksheet.getCell('A13').font = { bold: true };
    worksheet.getCell('B13').value = `: เดือน${getMonthNameThai(bill.billing_month)} ${bill.billing_year}`;

    worksheet.getCell('A14').value = 'สถานะสัญญา';
    worksheet.getCell('A14').font = { bold: true };
    const contractStatus = bill.contract_status === 'active' ? 'Active' : bill.contract_status || '-';
    worksheet.getCell('B14').value = `: ${contractStatus}`;

    // ส่วนที่ 3: ตารางค่าใช้จ่าย
    // ตารางที่ 1: ค่าดูแล/ค่าคงที่
    worksheet.mergeCells('A16:G16');
    const table1Header = worksheet.getCell('A16');
    table1Header.value = 'ตารางที่ 1 : ค่าดูแล / ค่าคงที่';
    table1Header.font = { size: 12, bold: true };
    table1Header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' },
    };

    const table1HeaderRow = worksheet.addRow(['รายการ', 'จำนวนเงิน (บาท)']);
    table1HeaderRow.font = { bold: true };
    table1HeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    table1HeaderRow.getCell(1).alignment = { horizontal: 'left' };
    table1HeaderRow.getCell(2).alignment = { horizontal: 'right' };

    const maintenanceRow = worksheet.addRow(['ค่าดูแลและบำรุงรักษาหอพัก', bill.maintenance_fee || 0]);
    maintenanceRow.getCell(2).numFmt = '#,##0.00';
    maintenanceRow.getCell(2).alignment = { horizontal: 'right' };

    const otherFixedRow = worksheet.addRow(['ค่าใช้จ่ายคงที่อื่น', 0]);
    otherFixedRow.getCell(2).numFmt = '#,##0.00';
    otherFixedRow.getCell(2).alignment = { horizontal: 'right' };

    const discountRow = worksheet.addRow(['ส่วนลด', 0]);
    discountRow.getCell(2).numFmt = '#,##0.00';
    discountRow.getCell(2).alignment = { horizontal: 'right' };

    // ตารางที่ 2: ค่าสาธารณูปโภค
    worksheet.mergeCells('A22:G22');
    const table2Header = worksheet.getCell('A22');
    table2Header.value = 'ตารางที่ 2 : ค่าสาธารณูปโภค (อ้างอิงมิเตอร์)';
    table2Header.font = { size: 12, bold: true };
    table2Header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' },
    };

    // ค่าไฟฟ้า
    worksheet.mergeCells('A23:G23');
    const electricHeader = worksheet.getCell('A23');
    electricHeader.value = '🔌 ค่าไฟฟ้า';
    electricHeader.font = { size: 11, bold: true };

    const electricTableHeader = worksheet.addRow(['เริ่มต้น', 'สิ้นสุด', 'หน่วยใช้', 'อัตรา', 'เป็นเงิน']);
    electricTableHeader.font = { bold: true };
    electricTableHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    electricTableHeader.eachCell((cell) => {
      cell.alignment = { horizontal: 'center' };
    });

    if (electricReading) {
      const usage = electricReading.meter_end - electricReading.meter_start;
      const electricRow = worksheet.addRow([
        electricReading.meter_start || 0,
        electricReading.meter_end || 0,
        usage,
        electricReading.rate_per_unit || 0,
        bill.electric_amount || 0,
      ]);
      electricRow.getCell(1).numFmt = '#,##0';
      electricRow.getCell(2).numFmt = '#,##0';
      electricRow.getCell(3).numFmt = '#,##0';
      electricRow.getCell(4).numFmt = '#,##0.00';
      electricRow.getCell(5).numFmt = '#,##0.00';
      electricRow.eachCell((cell) => {
        cell.alignment = { horizontal: 'right' };
      });
    } else {
      const electricRow = worksheet.addRow([0, 0, 0, 0, bill.electric_amount || 0]);
      electricRow.getCell(5).numFmt = '#,##0.00';
      electricRow.getCell(5).alignment = { horizontal: 'right' };
    }

    // ค่าน้ำ
    worksheet.mergeCells('A26:G26');
    const waterHeader = worksheet.getCell('A26');
    waterHeader.value = '🚿 ค่าน้ำประปา';
    waterHeader.font = { size: 11, bold: true };

    const waterTableHeader = worksheet.addRow(['เริ่มต้น', 'สิ้นสุด', 'หน่วยใช้', 'อัตรา', 'เป็นเงิน']);
    waterTableHeader.font = { bold: true };
    waterTableHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    waterTableHeader.eachCell((cell) => {
      cell.alignment = { horizontal: 'center' };
    });

    if (waterReading) {
      const usage = waterReading.meter_end - waterReading.meter_start;
      const waterRow = worksheet.addRow([
        waterReading.meter_start || 0,
        waterReading.meter_end || 0,
        usage,
        waterReading.rate_per_unit || 0,
        bill.water_amount || 0,
      ]);
      waterRow.getCell(1).numFmt = '#,##0';
      waterRow.getCell(2).numFmt = '#,##0';
      waterRow.getCell(3).numFmt = '#,##0';
      waterRow.getCell(4).numFmt = '#,##0.00';
      waterRow.getCell(5).numFmt = '#,##0.00';
      waterRow.eachCell((cell) => {
        cell.alignment = { horizontal: 'right' };
      });
    } else {
      const waterRow = worksheet.addRow([0, 0, 0, 0, bill.water_amount || 0]);
      waterRow.getCell(5).numFmt = '#,##0.00';
      waterRow.getCell(5).alignment = { horizontal: 'right' };
    }

    // หมายเหตุ
    worksheet.mergeCells('A30:G30');
    const noteCell = worksheet.getCell('A30');
    noteCell.value = '📝 หมายเหตุ: ค่าไฟ/น้ำเป็นการใช้งานร่วมของห้อง ระบบออกบิล "ซ้ำต่อผู้เช่า" ตามระเบียบหอพัก';
    noteCell.font = { size: 10, italic: true };
    noteCell.alignment = { horizontal: 'left', wrapText: true };

    // ส่วนที่ 4: สรุปยอด
    worksheet.mergeCells('A32:G32');
    const summaryLine1 = worksheet.getCell('A32');
    summaryLine1.value = '-----------------------------------------------';

    worksheet.mergeCells('A33:C33');
    worksheet.getCell('A33').value = 'รวมค่าสาธารณูปโภค';
    worksheet.getCell('A33').font = { bold: true };
    worksheet.getCell('D33').value = (bill.electric_amount || 0) + (bill.water_amount || 0);
    worksheet.getCell('D33').numFmt = '#,##0.00';
    worksheet.getCell('D33').font = { bold: true };
    worksheet.getCell('E33').value = 'บาท';
    worksheet.getCell('D33').alignment = { horizontal: 'right' };

    worksheet.mergeCells('A34:C34');
    worksheet.getCell('A34').value = 'ค่าดูแล/บำรุงรักษา';
    worksheet.getCell('A34').font = { bold: true };
    worksheet.getCell('D34').value = bill.maintenance_fee || 0;
    worksheet.getCell('D34').numFmt = '#,##0.00';
    worksheet.getCell('D34').font = { bold: true };
    worksheet.getCell('E34').value = 'บาท';
    worksheet.getCell('D34').alignment = { horizontal: 'right' };

    worksheet.mergeCells('A35:G35');
    const summaryLine2 = worksheet.getCell('A35');
    summaryLine2.value = '-----------------------------------------------';

    worksheet.mergeCells('A36:C36');
    worksheet.getCell('A36').value = 'ยอดชำระทั้งสิ้น';
    worksheet.getCell('A36').font = { size: 14, bold: true };
    worksheet.getCell('D36').value = bill.total_amount || 0;
    worksheet.getCell('D36').numFmt = '#,##0.00';
    worksheet.getCell('D36').font = { size: 14, bold: true };
    worksheet.getCell('E36').value = 'บาท';
    worksheet.getCell('D36').alignment = { horizontal: 'right' };

    worksheet.mergeCells('A37:G37');
    const summaryLine3 = worksheet.getCell('A37');
    summaryLine3.value = '-----------------------------------------------';

    // ส่วนที่ 5: สถานะ & ช่องลงนาม
    worksheet.mergeCells('A39:C39');
    worksheet.getCell('A39').value = 'สถานะบิล';
    worksheet.getCell('A39').font = { bold: true };
    const statusText = bill.status === 'paid' ? 'ชำระแล้ว' : bill.status === 'sent' ? 'ส่งแล้ว' : 'รอชำระ';
    worksheet.getCell('D39').value = `: ${statusText}`;

    worksheet.mergeCells('A41:C41');
    worksheet.getCell('A41').value = 'ผู้จัดทำ ..................................................';

    worksheet.mergeCells('A42:C42');
    worksheet.getCell('A42').value = 'หัวหน้าฝ่าย ................................................';

    // ส่วนที่ 6: Footer
    worksheet.mergeCells('A44:G44');
    const footerHeader = worksheet.getCell('A44');
    footerHeader.value = 'หมายเหตุ';
    footerHeader.font = { size: 11, bold: true };

    worksheet.mergeCells('A45:G45');
    const footerNote1 = worksheet.getCell('A45');
    footerNote1.value = '- กรุณาชำระภายในกำหนด หากเกินกำหนดอาจมีค่าปรับ';
    footerNote1.font = { size: 10 };

    worksheet.mergeCells('A46:G46');
    const footerNote2 = worksheet.getCell('A46');
    footerNote2.value = '- เอกสารนี้ออกโดยระบบหอพักโรงพยาบาลราชพิพัฒน์';
    footerNote2.font = { size: 10 };

    // เพิ่มเส้นขอบให้ตาราง
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
      });
    });

    // สร้าง buffer
    const excelBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(excelBuffer) 
      ? excelBuffer 
      : Buffer.from(excelBuffer as ArrayBuffer);

    // ส่ง response
    const filename = `บิล_${billNumber}_${bill.first_name}_${bill.last_name}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating individual bill Excel:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Excel' },
      { status: 500 }
    );
  }
}

