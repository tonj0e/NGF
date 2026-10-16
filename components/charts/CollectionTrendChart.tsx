'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useMemo } from 'react';
import { formatCurrency as currency } from '@/lib/utils';

const COLORS = {
  primary: '#6366f1',
  primaryLight: '#a855f7',
  gray: '#9ca3af',
  grayBorder: '#eef0f3',
  textMuted: '#9ca3af',
};

interface CollectionTrendChartProps {
  data: Record<string, number>;
}

export function CollectionTrendChart({ data }: CollectionTrendChartProps) {
  const entries = useMemo(() => 
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, value]) => ({
      date: date.slice(5),
      fullDate: date,
      value: value || 0,
    })), [data]);

  if (!entries.length) return <div className="h-64 flex items-center justify-center text-gray-400">No data</div>;

  const maxValue = Math.max(...entries.map(e => e.value), 1);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={entries} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="collectionArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.primary} stopOpacity="0.25" />
              <stop offset="100%" stopColor={COLORS.primary} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="collectionLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLORS.primary} />
              <stop offset="100%" stopColor={COLORS.primaryLight} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grayBorder} vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: COLORS.textMuted, dy: 4 }}
            interval={0}
            tickCount={entries.length}
            dy={-4}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: COLORS.textMuted, dx: -8 }}
            tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #eef0f3',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
              padding: '12px 16px',
            }}
            labelFormatter={(date) => entries.find(e => e.date === date)?.fullDate || date}
            formatter={(value: any) => [`₹${Number(value || 0).toLocaleString('en-IN')}`, 'Collected']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="url(#collectionLine)"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#collectionArea)"
            dot={false}
            activeDot={{ r: 6, strokeWidth: 2, stroke: COLORS.primary, fill: '#fff' }}
            isAnimationActive={true}
            animationBegin={300}
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}