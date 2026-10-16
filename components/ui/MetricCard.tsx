'use client';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useState, useEffect } from 'react';
import { useReducedMotion } from '@/components/ReducedMotionProvider';
import { formatCurrency } from '@/lib/utils';

const COLORS = {
  primary: '#6366f1',
  primaryLight: '#a855f7',
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  color?: string;
  sparkline?: number[];
  index?: number;
}

export function MetricCard({ 
  title, value, subtitle, trend, icon, color = COLORS.primary, sparkline, index = 0 
}: MetricCardProps) {
  const reduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(0);
  const targetValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
  const isCurrency = typeof value === 'string' && value.includes('₹');
  
  useEffect(() => {
    if (reduced || targetValue === 0) {
      setDisplayValue(targetValue);
      return;
    }
    const duration = 1200;
    const start = Date.now();
    const startValue = 0;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / 1200, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (targetValue - startValue) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetValue, reduced]);

  const isPositive = trend && trend.value >= 0;
  const formattedDisplayValue = isCurrency ? formatCurrency(displayValue) : displayValue.toLocaleString('en-IN');

  return (
    <motion.div
      className="h-full rounded-[1.25rem] sm:rounded-[1.5rem] border border-white/70 bg-white p-3 md:p-4 lg:p-5 shadow-panel hover:shadow-panel-hover min-h-[96px] md:min-h-[120px] lg:min-h-[148px] flex flex-col"
      initial={reduced ? undefined : { opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -4, scale: 1.02, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-0">
        <div className="min-w-0 w-full">
          <p className="text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
          <motion.span
            className="mt-0.5 md:mt-1 block text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 truncate"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formattedDisplayValue}
          </motion.span>
          {trend && (
            <motion.div
              className="mt-1.5 md:mt-2 flex items-center gap-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <span className={`flex items-center gap-1 text-[10px] md:text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? (
                  <svg className="h-3 w-3.5 md:h-3.5 md:w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                ) : (
                  <svg className="h-3 w-3.5 md:h-3.5 md:w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06.02L10 8.832l-3.71 3.938a.75.75 0 01-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" /></svg>
                )}
                {Math.abs(trend.value)}%
              </span>
              <span className="text-[10px] md:text-xs text-gray-400">{trend.label}</span>
            </motion.div>
          )}
        </div>
        <motion.div
          className={`p-2 md:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br ${color} text-white shrink-0 max-sm:[&>svg]:h-4 max-sm:[&>svg]:w-4`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3, type: 'spring', stiffness: 260, damping: 20 }}
        >
          {icon}
        </motion.div>
      </div>
      {sparkline && sparkline.length > 1 && (
        <motion.div className="mt-3 md:mt-4 h-10 md:h-12" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline.map((v, i) => ({ value: v, index: i }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`sparkline-${title || 'metric'}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#sparkline-${title})`}
                animationBegin={300}
                animationDuration={1000}
                isAnimationActive={!reduced}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </motion.div>
  )
}