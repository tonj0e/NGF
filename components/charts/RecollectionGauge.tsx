'use client';
import { useEffect, useState } from 'react';
import { motion, animate } from 'framer-motion';

const COLORS = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  primary: '#6366f1',
  grayBorder: '#eef0f3',
};

interface RecollectionGaugeProps {
  value: number;
  collected: number;
  pending: number;
}

export function RecollectionGauge({ value, collected, pending }: RecollectionGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  // Same cut-offs as the meter bands: red 0-30, orange 30-70, green 70-100
  const isGreen = clampedValue >= 70;
  const isOrange = clampedValue >= 30 && clampedValue < 70;
  const statusColor = isGreen ? COLORS.success : isOrange ? COLORS.warning : COLORS.danger;
  const statusText = clampedValue >= 90 ? 'Excellent recovery — keep it up' : isGreen ? 'Good recovery — keep it up' : isOrange ? 'Fair, some dues pending' : 'Recovery needs attention';

  // CIBIL-style meter: coloured bands, a needle that swings to the value, readout under the hub
  const CX = 100, CY = 100, R = 78, STROKE = 14
  const GAP = 1.2 // degrees between bands
  const pt = (pct: number, r = R) => {
    const a = Math.PI * (1 - pct / 100) // 0% = left, 100% = right
    return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
  }
  const band = (from: number, to: number) => {
    const g = (GAP / 180) * 100 / 2
    const [x1, y1] = pt(from + (from === 0 ? 0 : g))
    const [x2, y2] = pt(to - (to === 100 ? 0 : g))
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`
  }
  const BANDS = [
    { from: 0, to: 30, color: COLORS.danger },
    { from: 30, to: 70, color: COLORS.warning },
    { from: 70, to: 100, color: COLORS.success },
  ]
  const needleAngle = (clampedValue - 50) * 1.8 // degrees from straight up
  const [angle, setAngle] = useState(-90) // starts at 0 and swings to the value
  useEffect(() => {
    const controls = animate(-90, needleAngle, {
      type: 'spring', stiffness: 60, damping: 11, delay: 0.3,
      onUpdate: v => setAngle(v),
    })
    return () => controls.stop()
  }, [needleAngle])

  return (
    <div className="flex flex-col">
      <motion.div
        className="flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <svg
          viewBox="0 0 200 164"
          className="w-full max-w-[270px]"
          role="img"
          aria-label={`Recollection rate ${clampedValue} percent`}
        >
          {BANDS.map(b => (
            <path key={b.from} d={band(b.from, b.to)} fill="none" stroke={b.color} strokeWidth={STROKE} strokeLinecap="butt" opacity={0.95} />
          ))}
          <text x={CX - R} y={CY + 16} textAnchor="middle" fontSize="8" fill="#9ca3af">0</text>
          <text x={CX + R} y={CY + 16} textAnchor="middle" fontSize="8" fill="#9ca3af">100</text>

          <g transform={`rotate(${angle} ${CX} ${CY})`}>
            <polygon points={`${CX - 4},${CY} ${CX + 4},${CY} ${CX},${CY - (R - 8)}`} fill="#1f2937" />
          </g>
          <circle cx={CX} cy={CY} r="8" fill="#ffffff" stroke="#1f2937" strokeWidth="3" />

          <text x={CX} y={CY + 34} textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#6b7280">
            Recollection Rate
          </text>
          <text x={CX} y={CY + 54} textAnchor="middle" fontSize="20" fontWeight="700" fill={statusColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {clampedValue}%
          </text>
        </svg>
      </motion.div>

      <motion.div
        className="mt-3 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.3 }}
      >
        <p className={`text-sm font-medium ${isGreen ? 'text-green-600' : isOrange ? 'text-amber-600' : 'text-red-600'}`}>
          {statusText}
        </p>
      </motion.div>
      
      <motion.div className="mt-3 border-t border-gray-100 pt-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
        <motion.div className="grid grid-cols-2 gap-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, staggerChildren: 0.1 }}>
          <motion.div className="text-center p-3 rounded-xl bg-green-50">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Collected</p>
            <p className="mt-1 text-lg font-bold text-green-600">{collected.toLocaleString('en-IN')}</p>
          </motion.div>
          <motion.div className="text-center p-3 rounded-xl bg-red-50">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Pending</p>
            <p className="mt-1 text-lg font-bold text-red-600">{pending.toLocaleString('en-IN')}</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}