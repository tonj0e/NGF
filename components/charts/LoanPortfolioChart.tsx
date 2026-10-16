'use client';
import { motion } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useMemo } from 'react';

const COLORS = {
  success: '#22c55e',
  danger: '#ef4444',
  primary: '#6366f1',
  gray: '#9ca3af',
};

interface LoanPortfolioChartProps {
  active: number;
  overdue: number;
  completed: number;
}

export function LoanPortfolioChart({ active, overdue, completed }: LoanPortfolioChartProps) {
  const onTrack = Math.max(0, active - overdue);
  const total = onTrack + overdue + completed;
  
  const data = useMemo(() => [
    { name: 'On Track', value: onTrack, color: COLORS.success },
    { name: 'Overdue', value: overdue, color: COLORS.danger },
    { name: 'Completed', value: completed, color: COLORS.primary },
  ].filter(d => d.value > 0), [onTrack, overdue, completed]);

  if (total === 0) return <div className="h-48 flex items-center justify-center text-gray-400">No data</div>;

  return (
    <div className="h-72 flex flex-col items-center relative">
      <motion.div
        className="relative flex-1 w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={4}
              dataKey="value"
              label={false}
              labelLine={false}
              startAngle={90}
              endAngle={450}
              isAnimationActive={true}
              animationDuration={1000}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </motion.div>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <p className="text-3xl font-bold text-gray-900">{total}</p>
        <p className="text-xs text-gray-500 mt-1">Total Loans</p>
      </motion.div>
      
      {/* Legend */}
      <motion.div
        className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, staggerChildren: 0.1 }}
      >
        {data.map((entry, index) => (
          <motion.div key={entry.name} className="flex items-center gap-1.5 text-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.1 }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-700 font-medium">{entry.name}</span>
            <span className="text-gray-500 font-semibold ml-1">{entry.value}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}