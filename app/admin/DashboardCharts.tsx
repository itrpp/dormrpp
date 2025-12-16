'use client';

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface RoomStatusData {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

interface MonthlyRevenueData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  [key: string]: string | number;
}

interface TenantFlowData {
  month: string;
  new: number;
  left: number;
  [key: string]: string | number;
}

interface OccupancyData {
  month: string;
  rate: number;
  [key: string]: string | number;
}

type Props = {
  roomStatusData: RoomStatusData[];
  monthlyRevenueData: MonthlyRevenueData[];
  tenantFlowData: TenantFlowData[];
  occupancyData: OccupancyData[];
};

const COLORS = ['#10b981', '#3b82f6', '#6b7280', '#ef4444'];

export default function DashboardCharts({
  roomStatusData,
  monthlyRevenueData,
  tenantFlowData,
  occupancyData,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* กราฟวงกลม: สถานะห้องพัก */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          สถานะห้องพัก
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={roomStatusData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {roomStatusData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* กราฟแท่ง: จำนวนผู้เช่าใหม่/ออกรายเดือน */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          จำนวนผู้เช่าใหม่/ออกรายเดือน (6 เดือนล่าสุด)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={tenantFlowData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="new" fill="#10b981" name="ผู้เช่าใหม่" />
            <Bar dataKey="left" fill="#ef4444" name="ผู้เช่าออก" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* กราฟเส้น: รายได้/ค่าใช้จ่าย/กำไรรายเดือน */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          รายได้/ค่าใช้จ่าย/กำไรรายเดือน (6 เดือนล่าสุด)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyRevenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('th-TH', {
                  style: 'currency',
                  currency: 'THB',
                }).format(value)
              }
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              strokeWidth={2}
              name="รายได้"
            />
            <Line
              type="monotone"
              dataKey="expenses"
              stroke="#ef4444"
              strokeWidth={2}
              name="ค่าใช้จ่าย"
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="#3b82f6"
              strokeWidth={2}
              name="กำไร"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* กราฟพื้นที่: อัตราการเข้าพักรายเดือน */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          อัตราการเข้าพักรายเดือน (6 เดือนล่าสุด)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={occupancyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis domain={[0, 100]} />
            <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
            <Legend />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
              name="อัตราการเข้าพัก (%)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

