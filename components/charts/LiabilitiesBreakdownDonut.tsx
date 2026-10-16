'use client';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';

interface LiabilityBreakdown {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

interface LiabilitiesBreakdownDonutProps {
  data: LiabilityBreakdown[];
  total: number;
  title?: string;
}

export function LiabilitiesBreakdownDonut({ data, total, title = 'Total Liabilities & Equity' }: LiabilitiesBreakdownDonutProps) {
  const chartData = useMemo(() =>
    data.filter((d) => d.amount > 0).map((entry, index) => ({
      name: entry.category,
      value: entry.amount,
      percentage: entry.percentage,
      color: entry.color,
      payload: entry,
    })),
    [data]
  );

  if (!chartData.length) {
    return (
      <div className="h-72 flex flex-col items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-2">No liability data available</p>
          <p className="text-xs text-gray-500">Configure accounting data to view breakdown</p>
        </div>
      </div>
    );
  }

  const totalFormatted = formatCurrency(total);

  return (
    <div className="h-72 flex flex-col relative">
      <motion.div
        className="relative flex-1 w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              label={false}
              labelLine={false}
              startAngle={90}
              endAngle={450}
              isAnimationActive={true}
              animationDuration={1000}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #eef0f3',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
                padding: '12px 16px',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => {
                const nameStr = String(name || '');
                const entry = chartData.find((d) => d.name === nameStr);
                return [
                  formatCurrency(value || 0),
                  `${entry?.payload?.category || nameStr} (${entry?.percentage?.toFixed(1) || '0'}%)`,
                ];
              }}
              labelFormatter={(name: any) => String(name || '')}
            />
          </PieChart>
        </ResponsiveContainer>
      </motion.div>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <p className="text-3xl font-bold text-gray-900">{totalFormatted}</p>
        <p className="text-xs text-gray-500 mt-1">{title}</p>
      </motion.div>

      <motion.div
        className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, staggerChildren: 0.08 }}
      >
        {chartData.map((entry, index) => (
          <motion.div key={entry.name} className="flex items-center gap-2 text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.08 }}>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-700 font-medium truncate max-w-[140px]">{entry.payload.category}</span>
            <span className="text-gray-500 font-semibold ml-1">{formatCurrency(entry.value)}</span>
            <span className="text-gray-400 text-xs">({entry.percentage.toFixed(1)}%)</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}