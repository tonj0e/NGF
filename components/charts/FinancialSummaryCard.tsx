'use client';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { useReducedMotion } from '@/components/ReducedMotionProvider';
import { useState, useEffect } from 'react';

interface FinancialSummaryCardProps {
  title: string;
  value: number;
  subtitle?: string;
  trend?: { value: number; label: string } | null;
  icon: React.ReactNode;
  color: string;
  index?: number;
}

export function FinancialSummaryCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  color,
  index = 0,
}: FinancialSummaryCardProps) {
  const reduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(0);
  const targetValue = value;

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
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (targetValue - startValue) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetValue, reduced]);

  const isPositive = trend && trend.value >= 0;
  const formattedDisplayValue = formatCurrency(displayValue);

  return (
    <motion.div
      className="rounded-[1.5rem] border border-white/70 bg-white p-4 md:p-5 lg:p-6 shadow-panel hover:shadow-panel-hover min-h-[120px] md:min-h-[140px] lg:min-h-[160px] flex flex-col"
      initial={reduced ? undefined : { opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -4, scale: 1.02, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
          <motion.span
            className="mt-1 md:mt-2 text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 truncate block"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formattedDisplayValue}
          </motion.span>
          {trend && (
            <motion.div
              className="mt-2 md:mt-3 flex items-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <span className={`flex items-center gap-1.5 text-[10px] md:text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06.02L10 8.832l-3.71 3.938a.75.75 0 01-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                  </svg>
                )}
                {Math.abs(trend.value)}%
              </span>
              <span className="text-[10px] md:text-xs text-gray-400">{trend.label}</span>
            </motion.div>
          )}
          {subtitle && !trend && (
            <p className="mt-2 md:mt-3 text-[10px] md:text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        <motion.div
          className={`p-3 md:p-4 rounded-2xl bg-gradient-to-br ${color} text-white shrink-0`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3, type: 'spring', stiffness: 260, damping: 20 }}
        >
          {icon}
        </motion.div>
      </div>
    </motion.div>
  );
}