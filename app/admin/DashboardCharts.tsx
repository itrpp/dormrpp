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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* กราฟวงกลม: สถานะห้องพัก */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
        <h3 className="text-sm font-semibold mb-2 text-gray-800 flex items-center gap-1.5">
          <span className="text-base">📊</span>
          <span>สถานะห้องพัก</span>
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={roomStatusData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              outerRadius={60}
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
        <h3 className="text-sm font-semibold mb-2 text-gray-800 flex items-center gap-1.5">
          <span className="text-base">👥</span>
          <span>จำนวนผู้เช่าใหม่/ออกรายเดือน</span>
        </h3>
        <p className="text-[10px] text-gray-500 mb-2">6 เดือนล่าสุด</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={tenantFlowData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '11px'
              }} 
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="new" fill="#10b981" name="ผู้เช่าใหม่" radius={[3, 3, 0, 0]} />
            <Bar dataKey="left" fill="#ef4444" name="ผู้เช่าออก" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* กราฟเส้น: รายได้รายเดือน */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
        <h3 className="text-sm font-semibold mb-2 text-gray-800 flex items-center gap-1.5">
          <span className="text-base">💰</span>
          <span>รายได้รายเดือน</span>
        </h3>
        <p className="text-[10px] text-gray-500 mb-2">6 เดือนล่าสุด</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthlyRevenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('th-TH', {
                  style: 'currency',
                  currency: 'THB',
                }).format(value)
              }
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '11px'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 3 }}
              name="รายได้"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* กราฟพื้นที่: อัตราการเข้าพักรายเดือน */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
        <h3 className="text-sm font-semibold mb-2 text-gray-800 flex items-center gap-1.5">
          <span className="text-base">📈</span>
          <span>อัตราการเข้าพักรายเดือน</span>
        </h3>
        <p className="text-[10px] text-gray-500 mb-2">6 เดือนล่าสุด</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={occupancyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip 
              formatter={(value: number) => `${value.toFixed(2)}%`}
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '11px'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.4}
              name="อัตราการเข้าพัก (%)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

