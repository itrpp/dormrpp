// app/admin/page.tsx - Admin dashboard
import { query } from '@/lib/db';
import { getDashboardBuildingResolution } from '@/lib/auth/server-building-scope';
import {
  shouldShowDashboardBuildingPicker,
  type AdminBuildingScope,
} from '@/lib/auth/building-scope';
import { getAllRoomsOccupancy } from '@/lib/repositories/room-occupancy';
import DashboardCharts from './DashboardCharts';
import DashboardBuildingPicker from './DashboardBuildingPicker';

export const dynamic = 'force-dynamic';

/** เงื่อนไขกรอง building_id บนตาราง rooms (ไม่มี alias) */
function roomsBuildingWhere(
  allowedBuildingIds: number[] | undefined,
): { sql: string; params: number[] } {
  if (allowedBuildingIds === undefined) {
    return { sql: '', params: [] };
  }
  if (allowedBuildingIds.length === 0) {
    return { sql: ' AND 1=0', params: [] };
  }
  if (allowedBuildingIds.length === 1) {
    return { sql: ' AND building_id = ?', params: [allowedBuildingIds[0]!] };
  }
  const ph = allowedBuildingIds.map(() => '?').join(',');
  return {
    sql: ` AND building_id IN (${ph})`,
    params: [...allowedBuildingIds],
  };
}

/** เงื่อนไขกรอง r.building_id หลัง JOIN rooms r */
function roomsAliasBuildingWhere(
  allowedBuildingIds: number[] | undefined,
): { sql: string; params: number[] } {
  if (allowedBuildingIds === undefined) {
    return { sql: '', params: [] };
  }
  if (allowedBuildingIds.length === 0) {
    return { sql: ' AND 1=0', params: [] };
  }
  if (allowedBuildingIds.length === 1) {
    return { sql: ' AND r.building_id = ?', params: [allowedBuildingIds[0]!] };
  }
  const ph = allowedBuildingIds.map(() => '?').join(',');
  return { sql: ` AND r.building_id IN (${ph})`, params: [...allowedBuildingIds] };
}

interface DashboardStats {
  // ห้องพัก
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  maintenanceRooms: number;
  
  // ผู้เช่า
  totalTenants: number;
  newTenantsThisMonth: number;
  leftTenantsThisMonth: number;
  currentTenants: number;
  
  // อื่นๆ
  totalBuildings: number;
  totalRoomTypes: number;
  occupancyRate: number;
  
  // การเงิน
  revenueThisMonth: number;
  totalRevenue: number;
  expensesThisMonth: number;
  totalExpenses: number;
  profitThisMonth: number;
  totalProfit: number;
}

async function getDashboardStats(
  allowedBuildingIds?: number[],
): Promise<DashboardStats> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  try {
    const roomBf = roomsBuildingWhere(allowedBuildingIds);

    // 1. สถิติห้องพัก - ใช้ข้อมูล occupancy เพื่อคำนวณสถานะตามจำนวนผู้เข้าพักจริง
    let totalRooms = 0;
    let availableRooms = 0;
    let occupiedRooms = 0;
    let maintenanceRooms = 0;
    
    try {
      // ดึงข้อมูลห้อง (กรองอาคารเมื่อผู้ใช้จำกัดขอบเขต)
      const allRooms = await query<{ room_id: number; status: string }>(
        `SELECT room_id, status 
       FROM rooms 
         WHERE COALESCE(is_deleted, 0) = 0${roomBf.sql}`,
        roomBf.params,
    );
    
      totalRooms = allRooms.length;
      
      const occFilter =
        allowedBuildingIds === undefined
          ? undefined
          : allowedBuildingIds.length === 0
            ? ([] as number[])
            : allowedBuildingIds.length === 1
              ? allowedBuildingIds[0]
              : [...allowedBuildingIds];

      const occupancies = await getAllRoomsOccupancy(occFilter);
      const occupancyMap = new Map<number, { current_occupants: number }>();
      occupancies.forEach((occ) => {
        if (occ && occ.room_id) {
          occupancyMap.set(occ.room_id, { current_occupants: occ.current_occupants || 0 });
        }
      });
      
      // นับสถานะตามจำนวนผู้เข้าพักจริง (เหมือน logic ในหน้าห้องพัก)
      for (const room of allRooms) {
        const occupancy = occupancyMap.get(room.room_id);
        const currentOccupants = occupancy?.current_occupants || 0;
        
        // กำหนดสถานะตามจำนวนผู้เข้าพัก
        if (room.status === 'maintenance') {
          maintenanceRooms++;
        } else if (currentOccupants > 0) {
          occupiedRooms++;
        } else {
          availableRooms++;
        }
      }
    } catch (error: any) {
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
      } else {
        throw error;
      }
    }

    // 2. สถิติผู้เช่า
    // ผู้เช่า pending รอเข้าพัก — เมื่อจำกัดอาคาร นับเฉพาะที่มีสัญญาผูกห้องในอาคารนั้น
    let totalTenants = 0;
    try {
      const rbf = roomsAliasBuildingWhere(allowedBuildingIds);
      const pendingSql =
        allowedBuildingIds === undefined
          ? `SELECT COUNT(*) as count 
         FROM tenants 
         WHERE COALESCE(status, 'inactive') = 'pending' 
         AND COALESCE(is_deleted, 0) = 0`
          : `SELECT COUNT(DISTINCT t.tenant_id) as count 
         FROM tenants t
         INNER JOIN contracts c ON c.tenant_id = t.tenant_id
         INNER JOIN rooms r ON c.room_id = r.room_id
         WHERE COALESCE(t.status, 'inactive') = 'pending' 
         AND COALESCE(t.is_deleted, 0) = 0${rbf.sql}`;
      const pendingParams =
        allowedBuildingIds === undefined ? [] : rbf.params;
      const [totalTenantsResult] = await query<{ count: number }>(
        pendingSql,
        pendingParams,
      );
      totalTenants = totalTenantsResult?.count || 0;
    } catch (error: any) {
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
      } else {
        throw error;
      }
    }

    // ผู้เช่าใหม่เดือนนี้ (จาก contracts.start_date)
    // Reset: ตั้งค่าเป็น 0 ชั่วคราว
    let newTenantsThisMonth = 0;
    // try {
    //   const [newTenantsResult] = await query<{ count: number }>(
    //     `SELECT COUNT(DISTINCT c.tenant_id) as count 
    //      FROM contracts c 
    //      WHERE YEAR(c.start_date) = ? AND MONTH(c.start_date) = ?`,
    //     [currentYear, currentMonth]
    //   );
    //   newTenantsThisMonth = newTenantsResult?.count || 0;
    // } catch (error: any) {
    //   // Fallback: ถ้าไม่มีตาราง contracts หรือ Too many connections
    //   if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
    //     // Silent fallback - ไม่ log เพื่อลด log noise
    //   } else {
    //     // Log เฉพาะ error อื่นๆ ที่ไม่ใช่ connection error
    //   }
    // }

    // ผู้เช่าออกเดือนนี้ (จาก contracts.end_date)
    // Reset: ตั้งค่าเป็น 0 ชั่วคราว
    let leftTenantsThisMonth = 0;
    // try {
    //   const [leftTenantsResult] = await query<{ count: number }>(
    //     `SELECT COUNT(DISTINCT c.tenant_id) as count 
    //      FROM contracts c 
    //      WHERE YEAR(c.end_date) = ? AND MONTH(c.end_date) = ? AND c.end_date IS NOT NULL`,
    //     [currentYear, currentMonth]
    //   );
    //   leftTenantsThisMonth = leftTenantsResult?.count || 0;
    // } catch (error: any) {
    //   // Fallback: ถ้าไม่มีตาราง contracts หรือ Too many connections
    //   if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
    //     // Silent fallback - ไม่ log เพื่อลด log noise
    //   } else {
    //     // Log เฉพาะ error อื่นๆ ที่ไม่ใช่ connection error
    //   }
    // }

    // ผู้เช่าปัจจุบัน (contracts.status = 'active')
    let currentTenants = 0;
    try {
      const cbf = roomsAliasBuildingWhere(allowedBuildingIds);
      const currentSql =
        allowedBuildingIds === undefined
          ? `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         WHERE c.status = 'active'`
          : `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         INNER JOIN rooms r ON c.room_id = r.room_id
         WHERE c.status = 'active'${cbf.sql}`;
      const [currentTenantsResult] = await query<{ count: number }>(
        currentSql,
        allowedBuildingIds === undefined ? [] : cbf.params,
      );
      currentTenants = currentTenantsResult?.count || 0;
    } catch (error: any) {
      // Fallback: ถ้าไม่มีตาราง contracts หรือ Too many connections ใช้จำนวนผู้เช่าทั้งหมดแทน
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
      } else {
        // Log เฉพาะ error อื่นๆ ที่ไม่ใช่ connection error
      }
      currentTenants = totalTenants;
    }

    // 3. สถิติอื่นๆ
    let totalBuildings = 0;
    try {
      if (allowedBuildingIds !== undefined) {
        totalBuildings = allowedBuildingIds.length;
      } else {
        const [totalBuildingsRow] = await query<{ count: number }>(
          'SELECT COUNT(*) as count FROM buildings',
        );
        totalBuildings = totalBuildingsRow?.count || 0;
      }
    } catch (error: any) {
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
      } else {
        throw error;
      }
    }

    // ตาราง room_types ไม่มีใน schema ใหม่แล้ว
    const totalRoomTypes = 0;

    // อัตราการเข้าพัก (occupied rooms / total rooms * 100)
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    // 4. สถิติการเงิน
    // หมายเหตุ: เดิมใช้คอลัมน์ total_amount / maintenance_fee จากตาราง bills แต่คอลัมน์เหล่านี้ถูกลบออกแล้ว
    // เพื่อหลีกเลี่ยง SQL error และไม่ดึงข้อมูลผิด schema ตอนนี้จะปิดการดึงข้อมูลการเงินจริง และตั้งค่าเป็น 0 ชั่วคราว
    let revenueThisMonth = 0;
    let totalRevenue = 0;
    let expensesThisMonth = 0;
    let totalExpenses = 0;
    
    // TODO: ถ้าต้องการสถิติการเงินจริง ให้คำนวณจาก bill_utility_readings + utility_rates เหมือนหน้า Bills / Export
    // ปัจจุบันตั้งค่าเป็น 0 เพื่อไม่ให้เกิด SQL error จากคอลัมน์ที่ถูกลบออกแล้ว
    revenueThisMonth = 0;
    totalRevenue = 0;
    expensesThisMonth = 0;
    totalExpenses = 0;

    // กำไรเดือนนี้
    const profitThisMonth = revenueThisMonth - expensesThisMonth;

    // กำไรรวม
    const totalProfit = totalRevenue - totalExpenses;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      maintenanceRooms,
      totalTenants,
      newTenantsThisMonth,
      leftTenantsThisMonth,
      currentTenants,
      totalBuildings,
      totalRoomTypes,
      occupancyRate,
      revenueThisMonth,
      totalRevenue,
      expensesThisMonth,
      totalExpenses,
      profitThisMonth,
      totalProfit,
    };
  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    // Fallback สำหรับกรณีที่ตารางหรือคอลัมน์ไม่มี
    return {
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      maintenanceRooms: 0,
      totalTenants: 0,
      newTenantsThisMonth: 0,
      leftTenantsThisMonth: 0,
      currentTenants: 0,
      totalBuildings: 0,
      totalRoomTypes: 0,
      occupancyRate: 0,
      revenueThisMonth: 0,
      totalRevenue: 0,
      expensesThisMonth: 0,
      totalExpenses: 0,
      profitThisMonth: 0,
      totalProfit: 0,
    };
  }
}

// ฟังก์ชันดึงข้อมูลสำหรับกราฟ (ลดจำนวน query ให้เหลือเฉพาะ aggregate สำคัญ)
async function getChartData(allowedBuildingIds?: number[]) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // เตรียมช่วง 6 เดือนล่าสุด (สำหรับทุกกราฟที่อิงเดือน)
  const monthNames = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];

  const monthRange: {
    adYear: number;
    beYear: number;
    month: number;
    label: string;
  }[] = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - 1 - i, 1);
    const adYear = date.getFullYear();
    const beYear = adYear + 543;
    const month = date.getMonth() + 1;
    const label = `${monthNames[month - 1]} ${beYear}`;
    monthRange.push({ adYear, beYear, month, label });
  }

  // -----------------------------
  // 1) สถานะห้องพัก (1 query)
  // -----------------------------
  let roomStatusData = [
    { name: 'ว่าง', value: 0, color: '#10b981' },
    { name: 'มีผู้อาศัย', value: 0, color: '#3b82f6' },
    { name: 'ซ่อมบำรุง', value: 0, color: '#6b7280' },
  ];

  try {
    if (allowedBuildingIds === undefined) {
      const roomStatusCounts = await query<{ status: string; count: number }>(
        `SELECT status, COUNT(*) as count 
       FROM rooms 
       WHERE COALESCE(is_deleted, 0) = 0
       GROUP BY status`,
      );

      roomStatusData = [
        {
          name: 'ว่าง',
          value: roomStatusCounts.find((r) => r.status === 'available')?.count || 0,
          color: '#10b981',
        },
        {
          name: 'มีผู้อาศัย',
          value: roomStatusCounts.find((r) => r.status === 'occupied')?.count || 0,
          color: '#3b82f6',
        },
        {
          name: 'ซ่อมบำรุง',
          value: roomStatusCounts.find((r) => r.status === 'maintenance')?.count || 0,
          color: '#6b7280',
        },
      ];
    } else {
      const roomBf = roomsBuildingWhere(allowedBuildingIds);
      const allRooms = await query<{ room_id: number; status: string }>(
        `SELECT room_id, status FROM rooms WHERE COALESCE(is_deleted, 0) = 0${roomBf.sql}`,
        roomBf.params,
      );
      const occFilter =
        allowedBuildingIds.length === 0
          ? ([] as number[])
          : allowedBuildingIds.length === 1
            ? allowedBuildingIds[0]
            : [...allowedBuildingIds];
      const occupancies = await getAllRoomsOccupancy(occFilter);
      const occupancyMap = new Map<number, number>();
      occupancies.forEach((occ) => {
        if (occ?.room_id) {
          occupancyMap.set(occ.room_id, occ.current_occupants || 0);
        }
      });
      let vAvail = 0;
      let vOcc = 0;
      let vMaint = 0;
      for (const room of allRooms) {
        const co = occupancyMap.get(room.room_id) || 0;
        if (room.status === 'maintenance') {
          vMaint++;
        } else if (co > 0) {
          vOcc++;
        } else {
          vAvail++;
        }
      }
      roomStatusData = [
        { name: 'ว่าง', value: vAvail, color: '#10b981' },
        { name: 'มีผู้อาศัย', value: vOcc, color: '#3b82f6' },
        { name: 'ซ่อมบำรุง', value: vMaint, color: '#6b7280' },
      ];
    }
  } catch (error: any) {
    if (!(error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections'))) {
      console.error('Error fetching room status data:', error);
    }
  }

  // -----------------------------
  // 2) รายได้รายเดือน
  // หมายเหตุ: คอลัมน์ total_amount ถูกถอดออกจากตาราง bills แล้ว
  // ตอนนี้จะไม่ query DB เพื่อหลีกเลี่ยง SQL error และแสดงกราฟด้วยค่า 0 ชั่วคราว
  // ถ้าต้องการใช้จริง ให้คำนวณจาก bill_utility_readings + utility_rates เหมือนหน้า Bills/Export
  // -----------------------------
  const monthlyRevenueData: Array<{ month: string; revenue: number }> = [];

  if (monthRange.length > 0) {
    for (const m of monthRange) {
      monthlyRevenueData.push({
        month: m.label,
        revenue: 0,
      });
    }
  }

  // -----------------------------
  // 3) ผู้เช่าใหม่/ออก (2 queries รวมทุกเดือน)
  // -----------------------------
  const tenantFlowData: Array<{ month: string; new: number; left: number }> = [];

  try {
    if (monthRange.length > 0) {
      const rangeStart = new Date(
        monthRange[0]!.adYear,
        monthRange[0]!.month - 1,
        1
      );
      const rangeEnd = new Date(
        monthRange[monthRange.length - 1]!.adYear,
        monthRange[monthRange.length - 1]!.month,
        0
      );

      const flowBf = roomsAliasBuildingWhere(allowedBuildingIds);
      const newRows = await query<{
        y: number;
        m: number;
        count: number;
      }>(
        allowedBuildingIds === undefined
          ? `
        SELECT 
          YEAR(c.start_date) AS y,
          MONTH(c.start_date) AS m,
          COUNT(DISTINCT c.tenant_id) AS count
        FROM contracts c
        WHERE c.start_date IS NOT NULL
          AND c.start_date BETWEEN ? AND ?
        GROUP BY YEAR(c.start_date), MONTH(c.start_date)
        `
          : `
        SELECT 
          YEAR(c.start_date) AS y,
          MONTH(c.start_date) AS m,
          COUNT(DISTINCT c.tenant_id) AS count
        FROM contracts c
        INNER JOIN rooms r ON c.room_id = r.room_id
        WHERE c.start_date IS NOT NULL
          AND c.start_date BETWEEN ? AND ?${flowBf.sql}
        GROUP BY YEAR(c.start_date), MONTH(c.start_date)
        `,
        allowedBuildingIds === undefined
          ? [rangeStart, rangeEnd]
          : [rangeStart, rangeEnd, ...flowBf.params],
      );

      const leftRows = await query<{
        y: number;
        m: number;
        count: number;
      }>(
        allowedBuildingIds === undefined
          ? `
        SELECT 
          YEAR(c.end_date) AS y,
          MONTH(c.end_date) AS m,
          COUNT(DISTINCT c.tenant_id) AS count
        FROM contracts c
        WHERE c.end_date IS NOT NULL
          AND c.end_date BETWEEN ? AND ?
        GROUP BY YEAR(c.end_date), MONTH(c.end_date)
        `
          : `
        SELECT 
          YEAR(c.end_date) AS y,
          MONTH(c.end_date) AS m,
          COUNT(DISTINCT c.tenant_id) AS count
        FROM contracts c
        INNER JOIN rooms r ON c.room_id = r.room_id
        WHERE c.end_date IS NOT NULL
          AND c.end_date BETWEEN ? AND ?${flowBf.sql}
        GROUP BY YEAR(c.end_date), MONTH(c.end_date)
        `,
        allowedBuildingIds === undefined
          ? [rangeStart, rangeEnd]
          : [rangeStart, rangeEnd, ...flowBf.params],
      );

      const newMap = new Map<string, number>();
      newRows.forEach((r) => {
        newMap.set(`${r.y}-${r.m}`, r.count || 0);
      });

      const leftMap = new Map<string, number>();
      leftRows.forEach((r) => {
        leftMap.set(`${r.y}-${r.m}`, r.count || 0);
      });

      for (const m of monthRange) {
        const key = `${m.adYear}-${m.month}`;
        tenantFlowData.push({
          month: `${monthNames[m.month - 1]} ${m.adYear + 543}`,
          new: newMap.get(key) ?? 0,
          left: leftMap.get(key) ?? 0,
        });
      }
    }
  } catch (error: any) {
    if (!(error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections'))) {
      console.error('Error aggregating tenant flow:', error);
    }
  }

  // -----------------------------
  // 4) อัตราการเข้าพักรายเดือน (ใช้ค่าปัจจุบัน ทำซ้ำ 6 เดือน)
  // -----------------------------
  const occupancyData: Array<{ month: string; rate: number }> = [];

  let baseRate = 0;
  try {
    if (allowedBuildingIds === undefined) {
      const [totalRoomsResult, occupiedRoomsResult] = await Promise.all([
        query<{ count: number }>(
          'SELECT COUNT(*) as count FROM rooms WHERE COALESCE(is_deleted, 0) = 0',
        ),
        query<{ count: number }>(
          "SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied' AND COALESCE(is_deleted, 0) = 0",
        ),
      ]);

      const totalRooms = totalRoomsResult[0]?.count || 0;
      const occupiedRooms = occupiedRoomsResult[0]?.count || 0;
      baseRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
    } else {
      const roomBf = roomsBuildingWhere(allowedBuildingIds);
      const allRooms = await query<{ room_id: number; status: string }>(
        `SELECT room_id, status FROM rooms WHERE COALESCE(is_deleted, 0) = 0${roomBf.sql}`,
        roomBf.params,
      );
      const occFilter =
        allowedBuildingIds.length === 0
          ? ([] as number[])
          : allowedBuildingIds.length === 1
            ? allowedBuildingIds[0]
            : [...allowedBuildingIds];
      const occupancies = await getAllRoomsOccupancy(occFilter);
      const occupancyMap = new Map<number, number>();
      occupancies.forEach((occ) => {
        if (occ?.room_id) {
          occupancyMap.set(occ.room_id, occ.current_occupants || 0);
        }
      });
      let occCount = 0;
      const totalR = allRooms.length;
      for (const room of allRooms) {
        const co = occupancyMap.get(room.room_id) || 0;
        if (room.status !== 'maintenance' && co > 0) {
          occCount++;
        }
      }
      baseRate = totalR > 0 ? (occCount / totalR) * 100 : 0;
    }
  } catch (error: any) {
    if (!(error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections'))) {
      console.error('Error calculating base occupancy:', error);
    }
  }

  for (const m of monthRange) {
    occupancyData.push({
      month: `${monthNames[m.month - 1]} ${m.adYear + 543}`,
      rate: Number(baseRate.toFixed(2)),
    });
  }

  return {
    roomStatusData,
    monthlyRevenueData,
    tenantFlowData,
    occupancyData,
  };
}

// ฟังก์ชันสำหรับจัดรูปแบบตัวเลข
function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num);
}

// ฟังก์ชันสำหรับจัดรูปแบบเงิน
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

async function getBuildingNamesSubtitle(
  allowedBuildingIds: number[] | undefined,
): Promise<string | null> {
  if (allowedBuildingIds === undefined || allowedBuildingIds.length === 0) {
    return null;
  }
  const ph = allowedBuildingIds.map(() => '?').join(',');
  const rows = await query<{ name_th: string | null }>(
    `SELECT name_th FROM buildings WHERE building_id IN (${ph}) ORDER BY building_id`,
    allowedBuildingIds,
  );
  const names = rows.map((r) => r.name_th).filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(' และ ') : null;
}

async function getBuildingsForDashboardPicker(scope: AdminBuildingScope) {
  const rows = await query<{ building_id: number; name_th: string | null }>(
    `SELECT building_id, name_th FROM buildings ORDER BY building_id`,
  );
  return rows
    .map((r) => ({
      building_id: r.building_id,
      name_th: r.name_th?.trim() || `อาคาร #${r.building_id}`,
    }))
    .filter((b) =>
      scope.kind === 'all' ? true : scope.buildingIds.includes(b.building_id),
    );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { building_id?: string };
}) {
  const raw = searchParams?.building_id;
  const parsedFromUrl =
    raw != null && raw !== '' && Number.isFinite(Number(raw))
      ? Number(raw)
      : null;

  const { scope, effectiveIds } =
    await getDashboardBuildingResolution(parsedFromUrl);

  const buildingsRows = await getBuildingsForDashboardPicker(scope);
  const showPicker = shouldShowDashboardBuildingPicker(scope);

  const pickerSelectedId =
    parsedFromUrl != null &&
    buildingsRows.some((b) => b.building_id === parsedFromUrl) &&
    effectiveIds !== undefined &&
    effectiveIds.length > 0 &&
    effectiveIds.includes(parsedFromUrl)
      ? parsedFromUrl
      : null;

  const allPickerLabel = scope.kind === 'all' ? 'ทุกอาคาร' : 'ทุกอาคารในเขตที่ดูแล';

  const [stats, chartData, scopedBuildingNames] = await Promise.all([
    getDashboardStats(effectiveIds),
    getChartData(effectiveIds),
    getBuildingNamesSubtitle(effectiveIds),
  ]);

  const dashboardSubtitle =
    effectiveIds !== undefined && effectiveIds.length === 0
      ? 'ไม่พบอาคารในเขตที่คุณดูแล'
      : scopedBuildingNames
        ? `ภาพรวมเฉพาะอาคารที่คุณดูแล — ${scopedBuildingNames}`
        : 'ภาพรวมระบบจัดการหอพัก โรงพยาบาลราชพิพัฒน์';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {dashboardSubtitle}
          </p>
        </div>
        {showPicker ? (
          <DashboardBuildingPicker
            buildings={buildingsRows}
            selectedBuildingId={pickerSelectedId}
            allLabel={allPickerLabel}
          />
        ) : null}
      </div>

      {/* สถิติทั้งหมด */}
      <div className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/70 to-slate-100/50 p-3 shadow-sm shadow-slate-200/40 ring-1 ring-slate-100/80 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9 gap-3">
      {/* สถิติห้องพัก */}
          <div>
            <p className="text-xs text-gray-600 mb-1">ห้องพักทั้งหมด</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatNumber(stats.totalRooms)} <span className="text-sm font-normal text-gray-500">ห้อง</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">ห้องว่าง</p>
            <p className="text-2xl font-bold text-green-600">
              {formatNumber(stats.availableRooms)} <span className="text-sm font-normal text-gray-500">ห้อง</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">ห้องมีผู้เช่า</p>
            <p className="text-2xl font-bold text-indigo-600">
              {formatNumber(stats.occupiedRooms)} <span className="text-sm font-normal text-gray-500">ห้อง</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">ห้องซ่อมบำรุง</p>
            <p className="text-2xl font-bold text-gray-600">
              {formatNumber(stats.maintenanceRooms)} <span className="text-sm font-normal text-gray-500">ห้อง</span>
            </p>
      </div>

      {/* สถิติผู้เช่า */}
          <div>
            <p className="text-xs text-gray-600 mb-1">pending รอเข้าพัก</p>
            <p className="text-2xl font-bold text-purple-600">
              {formatNumber(stats.totalTenants)} <span className="text-sm font-normal text-gray-500">คน</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">ผู้เช่าใหม่เดือนนี้</p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatNumber(stats.newTenantsThisMonth)} <span className="text-sm font-normal text-gray-500">คน</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">ผู้เช่าออกเดือนนี้</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatNumber(stats.leftTenantsThisMonth)} <span className="text-sm font-normal text-gray-500">คน</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">ผู้เช่าปัจจุบัน</p>
            <p className="text-2xl font-bold text-cyan-600">
              {formatNumber(stats.currentTenants)} <span className="text-sm font-normal text-gray-500">คน</span>
            </p>
      </div>

      {/* สถิติอื่นๆ */}
          <div>
            <p className="text-xs text-gray-600 mb-1">อัตราการเข้าพัก</p>
            <p className="text-2xl font-bold text-violet-600">
              {stats.occupancyRate.toFixed(1)} <span className="text-sm font-normal text-gray-500">%</span>
            </p>
          </div>
        </div>
      </div>

      {/* สถิติการเงิน - ซ่อนไว้ก่อน */}
      {/* <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <span>สถิติการเงิน</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-green-700 mb-2">รายได้เดือนนี้</p>
            <p className="text-xl font-bold text-green-900">
              {formatCurrency(stats.revenueThisMonth)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-teal-700 mb-2">รายได้รวม</p>
            <p className="text-xl font-bold text-teal-900">
              {formatCurrency(stats.totalRevenue)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-red-700 mb-2">ค่าใช้จ่ายเดือนนี้</p>
            <p className="text-xl font-bold text-red-900">
              {formatCurrency(stats.expensesThisMonth)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-4 border border-rose-200 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-rose-700 mb-2">ค่าใช้จ่ายรวม</p>
            <p className="text-xl font-bold text-rose-900">
              {formatCurrency(stats.totalExpenses)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-blue-700 mb-2">กำไรเดือนนี้</p>
            <p className="text-xl font-bold text-blue-900">
              {formatCurrency(stats.profitThisMonth)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200 hover:shadow-md transition-shadow">
            <p className="text-xs font-medium text-indigo-700 mb-2">กำไรรวม</p>
            <p className="text-xl font-bold text-indigo-900">
              {formatCurrency(stats.totalProfit)}
            </p>
          </div>
        </div>
      </div> */}

      {/* กราฟ */}
      <DashboardCharts
        roomStatusData={chartData.roomStatusData}
        monthlyRevenueData={chartData.monthlyRevenueData}
        tenantFlowData={chartData.tenantFlowData}
        occupancyData={chartData.occupancyData}
      />
    </div>
  );
}

