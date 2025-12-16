// app/admin/page.tsx - Admin dashboard
import { query } from '@/lib/db';
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
    // 1. สถิติห้องพัก
    const [totalRoomsResult] = await query<{ count: number }>(
      'SELECT COUNT(*) as count FROM rooms'
    );
    const totalRooms = totalRoomsResult?.count || 0;

    const [availableRoomsResult] = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM rooms WHERE status = 'available'"
    );
    const availableRooms = availableRoomsResult?.count || 0;

    const [occupiedRoomsResult] = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied'"
    );
    const occupiedRooms = occupiedRoomsResult?.count || 0;

    const [maintenanceRoomsResult] = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM rooms WHERE status = 'maintenance'"
    );
    const maintenanceRooms = maintenanceRoomsResult?.count || 0;

    // 2. สถิติผู้เช่า
    const [totalTenantsResult] = await query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tenants'
    );
    const totalTenants = totalTenantsResult?.count || 0;

    // ผู้เช่าใหม่เดือนนี้ (จาก contracts.start_date)
    let newTenantsThisMonth = 0;
    try {
      const [newTenantsResult] = await query<{ count: number }>(
        `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         WHERE YEAR(c.start_date) = ? AND MONTH(c.start_date) = ?`,
        [currentYear, currentMonth]
      );
      newTenantsThisMonth = newTenantsResult?.count || 0;
    } catch (error: any) {
      // Fallback: ถ้าไม่มีตาราง contracts
      console.warn('Cannot query new tenants this month:', error.message);
    }

    // ผู้เช่าออกเดือนนี้ (จาก contracts.end_date)
    let leftTenantsThisMonth = 0;
    try {
      const [leftTenantsResult] = await query<{ count: number }>(
        `SELECT COUNT(DISTINCT c.tenant_id) as count 
         FROM contracts c 
         WHERE YEAR(c.end_date) = ? AND MONTH(c.end_date) = ? AND c.end_date IS NOT NULL`,
        [currentYear, currentMonth]
      );
      leftTenantsThisMonth = leftTenantsResult?.count || 0;
    } catch (error: any) {
      // Fallback: ถ้าไม่มีตาราง contracts
      console.warn('Cannot query left tenants this month:', error.message);
    }

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
      // Fallback: ถ้าไม่มีตาราง contracts ใช้จำนวนผู้เช่าทั้งหมดแทน
      console.warn('Cannot query current tenants:', error.message);
      currentTenants = totalTenants;
    }

    // 3. สถิติอื่นๆ
    const [totalBuildingsResult] = await query<{ count: number }>(
      'SELECT COUNT(*) as count FROM buildings'
    );
    const totalBuildings = totalBuildingsResult?.count || 0;

    // ตาราง room_types ไม่มีใน schema ใหม่แล้ว
    const totalRoomTypes = 0;

    // อัตราการเข้าพัก (occupied rooms / total rooms * 100)
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    // 4. สถิติการเงิน
    // รายได้เดือนนี้ (จาก bills.total_amount) - JOIN กับ billing_cycles
    const [revenueThisMonthResult] = await query<{ total: number }>(
      `SELECT COALESCE(SUM(b.total_amount), 0) as total 
       FROM bills b
       JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
       WHERE cy.billing_year = ? AND cy.billing_month = ?`,
      [buddhistYear, currentMonth]
    );
    const revenueThisMonth = revenueThisMonthResult?.total || 0;

    // รายได้รวม
    const [totalRevenueResult] = await query<{ total: number }>(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM bills'
    );
    const totalRevenue = totalRevenueResult?.total || 0;

    // ค่าใช้จ่ายเดือนนี้ (ใช้ maintenance_fee เป็นค่าใช้จ่าย) - JOIN กับ billing_cycles
    const [expensesThisMonthResult] = await query<{ total: number }>(
      `SELECT COALESCE(SUM(b.maintenance_fee), 0) as total 
       FROM bills b
       JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
       WHERE cy.billing_year = ? AND cy.billing_month = ?`,
      [buddhistYear, currentMonth]
    );
    const expensesThisMonth = expensesThisMonthResult?.total || 0;

    // ค่าใช้จ่ายรวม
    const [totalExpensesResult] = await query<{ total: number }>(
      'SELECT COALESCE(SUM(maintenance_fee), 0) as total FROM bills'
    );
    const totalExpenses = totalExpensesResult?.total || 0;

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
    const [available] = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM rooms WHERE status = 'available'"
    );
    const [occupied] = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied'"
    );
    const [maintenance] = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM rooms WHERE status = 'maintenance'"
    );

    roomStatusData = [
      { name: 'ว่าง', value: available?.count || 0, color: '#10b981' },
      { name: 'มีผู้อาศัย', value: occupied?.count || 0, color: '#3b82f6' },
      { name: 'ซ่อมบำรุง', value: maintenance?.count || 0, color: '#6b7280' },
    ];
  } catch (error) {
    console.error('Error fetching room status data:', error);
  }

  // ข้อมูลรายได้/ค่าใช้จ่าย/กำไรรายเดือน (6 เดือนล่าสุด)
  const monthlyRevenueData: Array<{
    month: string;
    revenue: number;
    expenses: number;
    profit: number;
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

    try {
      const [revenueResult] = await query<{ total: number }>(
        `SELECT COALESCE(SUM(b.total_amount), 0) as total 
         FROM bills b
         JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
         WHERE cy.billing_year = ? AND cy.billing_month = ?`,
        [buddhistYear, month]
      );
      const [expensesResult] = await query<{ total: number }>(
        `SELECT COALESCE(SUM(b.maintenance_fee), 0) as total 
         FROM bills b
         JOIN billing_cycles cy ON b.cycle_id = cy.cycle_id
         WHERE cy.billing_year = ? AND cy.billing_month = ?`,
        [buddhistYear, month]
      );

      const revenue = revenueResult?.total || 0;
      const expenses = expensesResult?.total || 0;
      const profit = revenue - expenses;

      monthlyRevenueData.push({
        month: `${monthName} ${buddhistYear}`,
        revenue,
        expenses,
        profit,
      });
    } catch (error) {
      monthlyRevenueData.push({
        month: `${monthName} ${buddhistYear}`,
        revenue: 0,
        expenses: 0,
        profit: 0,
      });
    }
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
    } catch (error) {
      // Fallback if contracts table doesn't exist
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
      const [totalRoomsResult] = await query<{ count: number }>(
        'SELECT COUNT(*) as count FROM rooms'
      );
      const [occupiedRoomsResult] = await query<{ count: number }>(
        "SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied'"
      );

      const totalRooms = totalRoomsResult?.count || 0;
      const occupiedRooms = occupiedRoomsResult?.count || 0;
      const rate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

      occupancyData.push({
        month: `${monthName} ${year + 543}`,
        rate: Number(rate.toFixed(2)),
      });
    } catch (error) {
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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">แดชบอร์ดผู้ดูแล</h1>

      {/* สถิติห้องพัก */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">สถิติห้องพัก</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ห้องพักทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.totalRooms)} <span className="text-sm font-normal">ห้อง</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ห้องว่าง</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.availableRooms)} <span className="text-sm font-normal">ห้อง</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ห้องมีผู้เช่า</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.occupiedRooms)} <span className="text-sm font-normal">ห้อง</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ห้องซ่อมบำรุง</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.maintenanceRooms)} <span className="text-sm font-normal">ห้อง</span>
            </p>
          </div>
        </div>
      </div>

      {/* สถิติผู้เช่า */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">สถิติผู้เช่า</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ผู้เช่าทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.totalTenants)} <span className="text-sm font-normal">คน</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ผู้เช่าใหม่เดือนนี้</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.newTenantsThisMonth)} <span className="text-sm font-normal">คน</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ผู้เช่าออกเดือนนี้</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.leftTenantsThisMonth)} <span className="text-sm font-normal">คน</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ผู้เช่าปัจจุบัน</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.currentTenants)} <span className="text-sm font-normal">คน</span>
            </p>
          </div>
        </div>
      </div>

      {/* สถิติอื่นๆ */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">สถิติอื่นๆ</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">อาคารทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.totalBuildings)} <span className="text-sm font-normal">อาคาร</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ประเภทห้อง</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.totalRoomTypes)} <span className="text-sm font-normal">ประเภท</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">อัตราการเข้าพัก</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.occupancyRate.toFixed(2)} <span className="text-sm font-normal">%</span>
            </p>
          </div>
        </div>
      </div>

      {/* สถิติการเงิน */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">สถิติการเงิน</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">รายได้เดือนนี้</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.revenueThisMonth)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">รายได้รวม</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalRevenue)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ค่าใช้จ่ายเดือนนี้</p>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.expensesThisMonth)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">ค่าใช้จ่ายรวม</p>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalExpenses)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">กำไรเดือนนี้</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(stats.profitThisMonth)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">กำไรรวม</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(stats.totalProfit)}
            </p>
          </div>
        </div>
      </div>

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

