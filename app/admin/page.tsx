// app/admin/page.tsx - Admin dashboard
import { query } from '@/lib/db';
import { getAllRoomsOccupancy } from '@/lib/repositories/room-occupancy';
import DashboardCharts from './DashboardCharts';

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

async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const buddhistYear = currentYear + 543; // แปลงเป็นปีพุทธศักราช
  const currentMonth = now.getMonth() + 1; // 1-12

  try {
    // 1. สถิติห้องพัก - ใช้ข้อมูล occupancy เพื่อคำนวณสถานะตามจำนวนผู้เข้าพักจริง
    let totalRooms = 0;
    let availableRooms = 0;
    let occupiedRooms = 0;
    let maintenanceRooms = 0;
    
    try {
      // ดึงข้อมูลห้องทั้งหมด
      const allRooms = await query<{ room_id: number; status: string }>(
        `SELECT room_id, status 
       FROM rooms 
         WHERE COALESCE(is_deleted, 0) = 0`
    );
    
      totalRooms = allRooms.length;
      
      // ดึงข้อมูล occupancy ของห้องทั้งหมด
      const occupancies = await getAllRoomsOccupancy();
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
    // ผู้เช่า pending รอเข้าพัก (นับเฉพาะที่มี status = 'pending')
    let totalTenants = 0;
    try {
      const [totalTenantsResult] = await query<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM tenants 
         WHERE COALESCE(status, 'inactive') = 'pending' 
         AND COALESCE(is_deleted, 0) = 0`
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
      const [currentTenantsResult] = await query<{ count: number }>(
        `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         WHERE c.status = 'active'`
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
      const [totalBuildingsRow] = await query<{ count: number }>(
        'SELECT COUNT(*) as count FROM buildings'
      );
      totalBuildings = totalBuildingsRow?.count || 0;
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

// ฟังก์ชันดึงข้อมูลสำหรับกราฟ
async function getChartData() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ข้อมูลสถานะห้องพัก
  let roomStatusData = [
    { name: 'ว่าง', value: 0, color: '#10b981' },
    { name: 'มีผู้อาศัย', value: 0, color: '#3b82f6' },
    { name: 'ซ่อมบำรุง', value: 0, color: '#6b7280' },
  ];

  try {
    // รวม query เป็นอันเดียว
    const roomStatusCounts = await query<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count 
       FROM rooms 
       WHERE COALESCE(is_deleted, 0) = 0
       GROUP BY status`
    );

    roomStatusData = [
      { name: 'ว่าง', value: roomStatusCounts.find(r => r.status === 'available')?.count || 0, color: '#10b981' },
      { name: 'มีผู้อาศัย', value: roomStatusCounts.find(r => r.status === 'occupied')?.count || 0, color: '#3b82f6' },
      { name: 'ซ่อมบำรุง', value: roomStatusCounts.find(r => r.status === 'maintenance')?.count || 0, color: '#6b7280' },
    ];
  } catch (error: any) {
    // ถ้าเป็น "Too many connections" ให้ใช้ค่า default (0) แทนการ log error
    if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
      // Silent fallback - ไม่ log เพื่อลด log noise
    } else {
    console.error('Error fetching room status data:', error);
    }
  }

  // ข้อมูลรายได้รายเดือน (6 เดือนล่าสุด)
  const monthlyRevenueData: Array<{
    month: string;
    revenue: number;
  }> = [];

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

  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - 1 - i, 1);
    const year = date.getFullYear();
    const buddhistYear = year + 543; // แปลงเป็นปีพุทธศักราช
    const month = date.getMonth() + 1;
    const monthName = monthNames[month - 1];

    let revenue = 0;

    try {
      // ดึง billing cycle สำหรับเดือนนี้
      const [cycle] = await query<{ cycle_id: number }>(
        `SELECT cycle_id FROM billing_cycles 
         WHERE billing_year = ? AND billing_month = ?`,
        [buddhistYear, month]
      );

      if (cycle?.cycle_id) {
        // ดึงบิลทั้งหมดในรอบบิลนี้
        const bills = await query<{ bill_id: number; room_id: number; tenant_id: number }>(
          `SELECT bill_id, room_id, tenant_id FROM bills WHERE cycle_id = ?`,
          [cycle.cycle_id]
        );

        // คำนวณรายได้จากแต่ละบิล
        for (const bill of bills) {
          // นับจำนวนผู้เช่าในห้อง (active contracts)
          const [tenantCountResult] = await query<{ count: number }>(
            `SELECT COUNT(*) as count FROM contracts 
             WHERE room_id = ? AND status = 'active'`,
            [bill.room_id]
          );
          const tenantCount = Math.max(tenantCountResult?.count || 1, 1);

          // ดึง utility readings สำหรับห้องนี้ในรอบบิลนี้ พร้อม rate_per_unit
          const readings = await query<{
            utility_type_id: number;
            utility_code: string;
            meter_start: number;
            meter_end: number;
            rate_per_unit: number;
          }>(
            `SELECT 
              bur.utility_type_id,
              ut.code AS utility_code,
              bur.meter_start,
              bur.meter_end,
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
             WHERE bur.room_id = ? AND bur.cycle_id = ?`,
            [bill.room_id, cycle.cycle_id]
          );

          // คำนวณยอดรวมของห้อง
          let totalElectricAmountForRoom = 0;
          let totalWaterAmountForRoom = 0;

          for (const reading of readings) {
            // ตรวจสอบว่าเป็นไฟฟ้าหรือน้ำจาก utility_code
            if (reading.utility_code === 'electric') {
              // ไฟฟ้า: รองรับ rollover
              const start = Number(reading.meter_start || 0);
              const end = Number(reading.meter_end || 0);
              const MOD = 10000;
              const usage = end >= start ? end - start : (MOD - start) + end;
              totalElectricAmountForRoom = usage * Number(reading.rate_per_unit || 0);
            } else if (reading.utility_code === 'water') {
              // น้ำ: คำนวณปกติ
              const usage = Number(reading.meter_end || 0) - Number(reading.meter_start || 0);
              totalWaterAmountForRoom = usage * Number(reading.rate_per_unit || 0);
            }
          }

          // หารด้วยจำนวนผู้เช่า (แต่ละคนจ่ายส่วนแบ่ง)
          const electricAmountPerPerson = totalElectricAmountForRoom / tenantCount;
          const waterAmountPerPerson = totalWaterAmountForRoom / tenantCount;
          const maintenanceFee = 1000; // แต่ละคนจ่ายเต็ม

          // ยอดรวมต่อคน
          const totalPerPerson = electricAmountPerPerson + waterAmountPerPerson + maintenanceFee;
          revenue += totalPerPerson;
        }
      }
    } catch (error: any) {
      // Fallback: ถ้ามี error ให้ตั้งค่าเป็น 0
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback
      } else {
        console.error('Error calculating revenue:', error);
      }
    }

    monthlyRevenueData.push({
      month: `${monthName} ${buddhistYear}`,
      revenue,
    });
  }

  // ข้อมูลจำนวนผู้เช่าใหม่/ออกรายเดือน (6 เดือนล่าสุด)
  const tenantFlowData: Array<{ month: string; new: number; left: number }> =
    [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - 1 - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = monthNames[month - 1];

    let newCount = 0;
    let leftCount = 0;

    try {
      const [newResult] = await query<{ count: number }>(
        `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         WHERE YEAR(c.start_date) = ? AND MONTH(c.start_date) = ?`,
        [year, month]
      );
      newCount = newResult?.count || 0;

      const [leftResult] = await query<{ count: number }>(
        `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         WHERE YEAR(c.end_date) = ? AND MONTH(c.end_date) = ? AND c.end_date IS NOT NULL`,
        [year, month]
      );
      leftCount = leftResult?.count || 0;
    } catch (error: any) {
      // Fallback if contracts table doesn't exist or Too many connections
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
      }
    }

    tenantFlowData.push({
      month: `${monthName} ${year + 543}`,
      new: newCount,
      left: leftCount,
    });
  }

  // ข้อมูลอัตราการเข้าพักรายเดือน (6 เดือนล่าสุด)
  const occupancyData: Array<{ month: string; rate: number }> = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - 1 - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = monthNames[month - 1];

    try {
      // รวม query เป็นอันเดียว
      const [totalRoomsResult, occupiedRoomsResult] = await Promise.all([
        query<{ count: number }>('SELECT COUNT(*) as count FROM rooms WHERE COALESCE(is_deleted, 0) = 0'),
        query<{ count: number }>("SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied' AND COALESCE(is_deleted, 0) = 0")
      ]);

      const totalRooms = totalRoomsResult[0]?.count || 0;
      const occupiedRooms = occupiedRoomsResult[0]?.count || 0;
      const rate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

      occupancyData.push({
        month: `${monthName} ${year + 543}`,
        rate: Number(rate.toFixed(2)),
      });
    } catch (error: any) {
      // ถ้าเป็น "Too many connections" ให้ใช้ค่า default (0)
      if (error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) {
        // Silent fallback - ไม่ log เพื่อลด log noise
      }
      occupancyData.push({
        month: `${monthName} ${year + 543}`,
        rate: 0,
      });
    }
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

export default async function AdminDashboard() {
  const stats = await getDashboardStats();
  const chartData = await getChartData();

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          ภาพรวมระบบจัดการหอพักรวงผึ้ง โรงพยาบาลราชพิพัฒน์
        </p>
      </div>

      {/* สถิติทั้งหมด */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
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

