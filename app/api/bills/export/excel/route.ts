// app/api/bills/export/excel/route.ts
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { query } from '@/lib/db';
import { getMonthNameThai } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

// GET /api/bills/export/excel?year=2568&month=10
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

    // ดึงข้อมูลบิล
    const sql = `
      SELECT 
        b.bill_id,
        b.tenant_id,
        b.room_id,
        b.contract_id,
        b.cycle_id,
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
        c.status AS contract_status
      FROM bills b
      JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
      JOIN contracts c ON b.contract_id = c.contract_id
      JOIN tenants t ON c.tenant_id = t.tenant_id
      JOIN rooms r ON c.room_id = r.room_id
      JOIN buildings bu ON r.building_id = bu.building_id
      WHERE cy.billing_year = ? AND cy.billing_month = ?
      ORDER BY r.room_number, t.tenant_id
    `;

    const bills = await query<any>(sql, [Number(year), Number(month)]);

    if (!bills || bills.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลบิล' },
        { status: 404 }
      );
    }

    // ดึง utility readings
    const cycleIds = [...new Set(bills.map((b: any) => b.cycle_id))];
    const roomIds = [...new Set(bills.map((b: any) => b.room_id))];
    
    let utilityReadings: any[] = [];
    
    if (cycleIds.length > 0 && roomIds.length > 0) {
      utilityReadings = await query(
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
         WHERE bur.cycle_id IN (${cycleIds.map(() => '?').join(',')})
           AND bur.room_id IN (${roomIds.map(() => '?').join(',')})
         ORDER BY bur.room_id, bur.utility_type_id`,
        [...cycleIds, ...roomIds]
      );
    }

    // จัดกลุ่มข้อมูลตามห้องและผู้เช่า
    const groupedBills: Record<string, any> = {};

    bills.forEach((bill: any) => {
      const billKey = `${bill.tenant_id}_${bill.cycle_id}`;
      
      if (!groupedBills[billKey]) {
        const roomReadings = utilityReadings.filter(
          (ur: any) => ur.room_id === bill.room_id && ur.cycle_id === bill.cycle_id
        );

        // คำนวณ utility_readings พร้อม usage ที่รองรับ rollover
        const calculatedReadings = roomReadings.map((ur: any) => {
          // คำนวณหน่วยใช้ไฟฟ้า (รองรับมิเตอร์ 4 หลัก rollover)
          let usage: number;
          if (ur.utility_code === 'electric') {
            const meterStart = Number(ur.meter_start);
            const meterEnd = Number(ur.meter_end);
            const MOD = 10000; // มิเตอร์ไฟฟ้า 4 หลัก
            if (meterEnd >= meterStart) {
              usage = meterEnd - meterStart;
            } else {
              // กรณี rollover เช่น 9823 → 173
              usage = (MOD - meterStart) + meterEnd;
            }
          } else {
            // ค่าน้ำ: คำนวณแบบปกติ
            usage = ur.meter_end - ur.meter_start;
          }
          const rate = ur.rate_per_unit || 0;
          return {
            reading_id: ur.reading_id,
            utility_type: ur.utility_code,
            utility_name: ur.utility_name,
            meter_start: ur.meter_start,
            meter_end: ur.meter_end,
            usage: usage,
            rate_per_unit: rate,
          };
        });

        // นับจำนวนผู้เช่าในห้อง (active contracts ในรอบบิลนี้)
        const roomBills = bills.filter((b: any) => b.room_id === bill.room_id && b.cycle_id === bill.cycle_id);
        const uniqueTenants = new Set(roomBills.map((b: any) => b.tenant_id));
        const tenantCount = Math.max(uniqueTenants.size || 1, 1);

        // คำนวณจำนวนเงินจาก usage × rate_per_unit ÷ จำนวนผู้เช่า (รองรับ rollover)
        const electricReading = calculatedReadings.find((r: any) => r.utility_type === 'electric');
        const waterReading = calculatedReadings.find((r: any) => r.utility_type === 'water');
        
        // คำนวณยอดรวมของห้องก่อน (ยังไม่หาร)
        const totalElectricAmountForRoom =
          electricReading && electricReading.usage != null && electricReading.rate_per_unit != null
            ? Number(electricReading.usage) * Number(electricReading.rate_per_unit)
            : 0;
        
        const totalWaterAmountForRoom =
          waterReading && waterReading.usage != null && waterReading.rate_per_unit != null
            ? Number(waterReading.usage) * Number(waterReading.rate_per_unit)
            : 0;

        // หารด้วยจำนวนผู้เช่าในห้อง (แต่ละคนจ่ายส่วนแบ่งของค่าไฟ/น้ำ)
        const calculatedElectricAmount = totalElectricAmountForRoom / tenantCount;
        const calculatedWaterAmount = totalWaterAmountForRoom / tenantCount;

        // ค่าบำรุงรักษา: แต่ละคนจ่ายเต็มจำนวน (ไม่ต้องหาร)
        const maintenanceFee = 1000;
        // ยอดรวมทั้งสิ้นต่อคน = (ค่าไฟต่อคน) + (ค่าน้ำต่อคน) + ค่าบำรุงรักษา
        const calculatedTotalAmount = calculatedElectricAmount + calculatedWaterAmount + maintenanceFee;

        groupedBills[billKey] = {
          bill_id: bill.bill_id,
          tenant_id: bill.tenant_id,
          room_id: bill.room_id,
          contract_id: bill.contract_id,
          cycle_id: bill.cycle_id,
          room_number: bill.room_number || '',
          building_name: bill.building_name || '',
          billing_year: bill.billing_year,
          billing_month: bill.billing_month,
          billing_date: bill.billing_date,
          due_date: bill.due_date,
          maintenance_fee: maintenanceFee,
          electric_amount: calculatedElectricAmount,
          water_amount: calculatedWaterAmount,
          subtotal_amount: calculatedElectricAmount + calculatedWaterAmount,
          total_amount: calculatedTotalAmount,
          status: bill.status || 'draft',
          tenants: [],
          utility_readings: calculatedReadings,
        };
      }

      if (bill.tenant_id) {
        const existingTenant = groupedBills[billKey].tenants.find(
          (t: any) => t.tenant_id === bill.tenant_id
        );
        if (!existingTenant) {
          groupedBills[billKey].tenants.push({
            tenant_id: bill.tenant_id,
            first_name: bill.first_name || '',
            last_name: bill.last_name || '',
            email: bill.email || null,
            phone: bill.phone || null,
            move_in_date: bill.move_in_date,
            move_out_date: bill.move_out_date,
            contract_status: bill.contract_status,
          });
        }
      }
    });

    const billList = Object.values(groupedBills);

    // สร้าง Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`บิล ${getMonthNameThai(Number(month))} ${year}`);

    // ตั้งค่าความกว้างคอลัมน์ (ปรับให้พอดีกับ A4 หน้าเดียว)
    worksheet.columns = [
      { width: 6 },   // ลำดับ
      { width: 10 },  // เลขที่ห้อง
      { width: 18 }, // ชื่อ-สกุล
      { width: 9 }, // ค่าบำรุงรักษา
      { width: 8 }, // มิเตอร์ไฟฟ้าเริ่มต้น
      { width: 8 }, // มิเตอร์ไฟฟ้าสิ้นสุด
      { width: 8 }, // หน่วยใช้ไฟฟ้า
      { width: 8 }, // อัตราไฟฟ้า
      { width: 10 }, // ค่าไฟฟ้า
      { width: 8 }, // มิเตอร์น้ำเริ่มต้น
      { width: 8 }, // มิเตอร์น้ำสิ้นสุด
      { width: 8 }, // หน่วยใช้น้ำ
      { width: 8 }, // อัตราน้ำ
      { width: 10 }, // ค่าน้ำ
      { width: 10 }, // รวมทั้งสิ้น
      { width: 8 }, // สถานะ
    ];

    // ตั้งค่า Page Setup สำหรับ A4 แนวตั้ง - ให้พอดีหน้าเดียว
    // ใช้ fitToPage แทน scale เพื่อให้ Excel ปรับขนาดอัตโนมัติ
    worksheet.pageSetup = {
      paperSize: 9, // A4
      orientation: 'portrait', // แนวตั้ง
      fitToPage: true,
      fitToWidth: 1, // fit to 1 page wide
      fitToHeight: 0, // 0 = fit all rows (auto) - ให้ Excel คำนวณเอง
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.25,
        bottom: 0.25,
        header: 0.1,
        footer: 0.1,
      },
      horizontalCentered: true, // จัดกึ่งกลางแนวนอน
      verticalCentered: false, // ไม่จัดกึ่งกลางแนวตั้ง
    };

    // หัวตาราง (ลดขนาดฟอนต์เพื่อให้พอดีหน้าเดียว)
    worksheet.mergeCells('A1:P1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'โรงพยาบาลราชพิพัฒน์ - หอพักรวงผึ้ง';
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:P2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `รายงานบิลค่าใช้จ่าย รอบบิล ${getMonthNameThai(Number(month))} ${year}`;
    subtitleCell.font = { size: 12, bold: true };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // หัวตาราง
    const headerRow = worksheet.addRow([
      'ลำดับ',
      'เลขที่ห้อง',
      'ชื่อ-สกุล',
      'ค่าบำรุงรักษา',
      'มิเตอร์ไฟฟ้า\nเริ่มต้น',
      'มิเตอร์ไฟฟ้า\nสิ้นสุด',
      'หน่วยใช้ไฟฟ้า',
      'อัตราไฟฟ้า\n(บาท/หน่วย)',
      'ค่าไฟฟ้า',
      'มิเตอร์น้ำ\nเริ่มต้น',
      'มิเตอร์น้ำ\nสิ้นสุด',
      'หน่วยใช้น้ำ',
      'อัตราน้ำ\n(บาท/หน่วย)',
      'ค่าน้ำ',
      'รวมทั้งสิ้น',
      'สถานะ',
    ]);

    // จัดรูปแบบหัวตาราง (ลดขนาดฟอนต์ให้พอดีกับ A4 หน้าเดียว)
    headerRow.font = { bold: true, size: 8 };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.height = 30; // ตั้งค่าความสูงแถวให้พอดีกับ wrapText
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    headerRow.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // เพิ่มข้อมูล
    billList.forEach((bill: any, index: number) => {
      const tenant = bill.tenants[0] || {};
      const electricReading = bill.utility_readings.find((ur: any) => ur.utility_type === 'electric');
      const waterReading = bill.utility_readings.find((ur: any) => ur.utility_type === 'water');

      const row = worksheet.addRow([
        index + 1,
        `${bill.building_name} - ${bill.room_number}`,
        `${tenant.first_name || ''} ${tenant.last_name || ''}`,
        bill.maintenance_fee || 0,
        electricReading?.meter_start || 0,
        electricReading?.meter_end || 0,
        electricReading?.usage || 0,
        electricReading?.rate_per_unit || 0,
        bill.electric_amount || 0,
        waterReading?.meter_start || 0,
        waterReading?.meter_end || 0,
        waterReading?.usage || 0,
        waterReading?.rate_per_unit || 0,
        bill.water_amount || 0,
        bill.total_amount || 0,
        bill.status === 'paid' ? 'ชำระแล้ว' : bill.status === 'sent' ? 'ส่งแล้ว' : 'ร่าง',
      ]);

      // จัดรูปแบบตัวเลข
      row.getCell(4).numFmt = '#,##0.00'; // ค่าบำรุงรักษา
      row.getCell(5).numFmt = '#,##0'; // มิเตอร์ไฟฟ้าเริ่มต้น
      row.getCell(6).numFmt = '#,##0'; // มิเตอร์ไฟฟ้าสิ้นสุด
      row.getCell(7).numFmt = '#,##0'; // หน่วยใช้ไฟฟ้า
      row.getCell(8).numFmt = '#,##0.00'; // อัตราไฟฟ้า
      row.getCell(9).numFmt = '#,##0.00'; // ค่าไฟฟ้า
      row.getCell(10).numFmt = '#,##0'; // มิเตอร์น้ำเริ่มต้น
      row.getCell(11).numFmt = '#,##0'; // มิเตอร์น้ำสิ้นสุด
      row.getCell(12).numFmt = '#,##0'; // หน่วยใช้น้ำ
      row.getCell(13).numFmt = '#,##0.00'; // อัตราน้ำ
      row.getCell(14).numFmt = '#,##0.00'; // ค่าน้ำ
      row.getCell(15).numFmt = '#,##0.00'; // รวมทั้งสิ้น

      // จัดรูปแบบข้อความ (ลดขนาดฟอนต์ให้พอดีกับ A4 หน้าเดียว)
      row.font = { size: 8 };
      row.getCell(1).alignment = { horizontal: 'center' }; // ลำดับ
      row.getCell(2).alignment = { horizontal: 'left' }; // เลขที่ห้อง
      row.getCell(3).alignment = { horizontal: 'left' }; // ชื่อ-สกุล
      row.getCell(16).alignment = { horizontal: 'center' }; // สถานะ
      row.height = 15; // ตั้งค่าความสูงแถวให้เล็กลง

      // เส้นขอบ
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // แถวรวม
    const totalRow = worksheet.addRow([
      'รวม',
      '',
      '',
      `=SUM(D4:D${worksheet.rowCount})`,
      '',
      '',
      '',
      '',
      `=SUM(I4:I${worksheet.rowCount})`,
      '',
      '',
      '',
      '',
      `=SUM(N4:N${worksheet.rowCount})`,
      `=SUM(O4:O${worksheet.rowCount})`,
      '',
    ]);

    totalRow.font = { bold: true, size: 8 };
    totalRow.height = 15; // ตั้งค่าความสูงแถวรวม
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE0E0' },
    };
    totalRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      // แปลง cell.col เป็น number (ExcelJS cell.col อาจเป็น string หรือ number)
      const colNum: number = typeof cell.col === 'number' 
        ? cell.col 
        : (typeof cell.col === 'string' ? parseInt(cell.col, 10) : 0);
      if (!isNaN(colNum) && colNum >= 4 && colNum <= 15 && colNum !== 5 && colNum !== 6 && colNum !== 10 && colNum !== 11 && colNum !== 16) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
    });

    // ตั้งค่า Print Area ให้ครอบคลุมข้อมูลทั้งหมด
    const lastRow = worksheet.rowCount;
    worksheet.pageSetup.printArea = `A1:P${lastRow}`;

    // ตั้งค่าให้แสดง gridlines เมื่อพิมพ์
    worksheet.pageSetup.showGridLines = true;

    // สร้าง buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // ส่ง response
    const filename = `บิล_${year}_${month}_ทั้งหมด.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating Excel:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Excel' },
      { status: 500 }
    );
  }
}

