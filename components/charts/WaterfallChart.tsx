'use client';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Label } from 'recharts';
import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';

export interface WaterfallDataPoint {
  category: string;
  amount: number;
  cumulative: number;
  type: 'increase' | 'decrease' | 'total';
}

interface WaterfallChartProps {
  data: WaterfallDataPoint[];
  title: string;
  subtitle?: string;
  height?: number;
  colors?: {
    increase: string;
    decrease: string;
    total: string;
  };
}

const DEFAULT_COLORS = {
  increase: '#22c55e',
  decrease: '#ef4444',
  total: '#2563eb',
};

export function WaterfallChart({ data, title, subtitle, height = 320, colors = DEFAULT_COLORS }: WaterfallChartProps) {
  const chartData = useMemo(() => {
    if (!data.length) return [];
    return data.map((d, index) => ({
      ...d,
      index,
      isLast: index === data.length - 1,
      barColor: d.type === 'increase' ? colors.increase : d.type === 'decrease' ? colors.decrease : colors.total,
    }));
  }, [data, colors]);

  if (!chartData.length) {
    return (
      <div className={`h-[${height}px] flex flex-col items-center justify-center`}>
        <div className="text-center">
          <p className="text-gray-400 mb-2">No movement data available</p>
          <p className="text-xs text-gray-500">Configure accounting data to view waterfall chart</p>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...chartData.map((d) => Math.abs(d.cumulative)), 1);
  const minValue = Math.min(...chartData.map((d) => d.type === 'decrease' ? -Math.abs(d.amount) : 0), 0);

  const yDomainMin = minValue < 0 ? minValue * 1.2 : Math.min(0, minValue * 0.2);
  const yDomainMax = maxValue * 1.15;

  return (
    <div className="flex flex-col h-[calc(100%-2rem)] min-h-[320px]">
      <div className="mb-4">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 60, bottom: 20, left: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" horizontal={false} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af', dx: -8 }}
              tickFormatter={(value) => {
                if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
                if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
                if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
                return `₹${value}`;
              }}
              domain={[yDomainMin, yDomainMax]}
              interval={0}
              tickCount={5}
            />
            <YAxis
              type="category"
              dataKey="category"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#374151', fontWeight: 500 }}
              width={140}
              interval={0}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #eef0f3',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
                padding: '12px 16px',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(category: any) => String(category || '')}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => {
                const nameStr = String(name || '');
                const entry = chartData.find((d) => d.category === nameStr);
                if (!entry) return [formatCurrency(value || 0), 'Amount'];
                if (entry.type === 'total') {
                  return [formatCurrency(entry.cumulative), 'Cumulative Total'];
                }
                return [
                  entry.amount > 0 ? `+${formatCurrency(entry.amount)}` : formatCurrency(entry.amount),
                  entry.type === 'increase' ? 'Increase' : 'Decrease',
                ];
              }}
            />
            <Bar
              dataKey="cumulative"
              barSize={28}
              radius={[0, 4, 4, 0]}
              shape={({ x, y, width, height, radius, ...rest }) => {
                const payload = rest.payload as { category: string } | undefined;
                const entry = payload ? chartData.find((d) => d.category === payload.category) : null;
                if (!entry) return null;

                if (entry.type === 'total') {
                  const rx = Array.isArray(radius) ? (radius[0] ?? 0) : (radius ?? 0);
                  const ry = Array.isArray(radius) ? (radius[1] ?? 0) : (radius ?? 0);
                  return (
                    <motion.rect
                      key={entry.category}
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      rx={rx}
                      ry={ry}
                      fill={entry.barColor}
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: entry.index * 0.1, duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
                    />
                  );
                }

                const baseValue = entry.cumulative - entry.amount;
                const baseX = baseValue >= 0
                  ? (baseValue / yDomainMax) * (width / (1 - yDomainMin / yDomainMax))
                  : 0;

                const barWidth = Math.abs(entry.amount) / yDomainMax * (width / (1 - yDomainMin / yDomainMax));
                const rx = Array.isArray(radius) ? (radius[0] ?? 0) : (radius ?? 0);
                const ry = Array.isArray(radius) ? (radius[1] ?? 0) : (radius ?? 0);

                return (
                  <motion.rect
                    key={entry.category}
                    x={entry.amount >= 0 ? baseX : baseX - barWidth}
                    y={y}
                    width={barWidth}
                    height={height}
                    rx={rx}
                    ry={ry}
                    fill={entry.barColor}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: barWidth }}
                    transition={{ delay: entry.index * 0.1, duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
                  />
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.barColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="absolute bottom-2 right-4 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.increase }} />
            <span>Increase</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.decrease }} />
            <span>Decrease</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.total }} />
            <span>Total</span>
          </div>
        </div>
      </div>
    </div>
  );
}