'use client'
import { useEffect, useState, useMemo } from 'react'
import { Session } from '@/types'
import { formatCurrency as currency } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CollectionTrendChart,
  LoanPortfolioChart,
  RecollectionGauge,
  AssetsBreakdownDonut,
  LiabilitiesBreakdownDonut,
  WaterfallChart,
  FinancialSummaryCard,
} from '@/components/charts'
import { MetricCard } from '@/components/ui/MetricCard'
import { PageTransition } from '@/components/PageTransition'
import { ReducedMotionProvider } from '@/components/ReducedMotionProvider'

const COLORS = {
  primary: '#6366f1',
  primaryLight: '#a855f7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  gray: '#9ca3af',
  grayLight: '#f4f5f7',
  grayBorder: '#eef0f3',
  textPrimary: '#1a1a2e',
  textSecondary: '#697586',
  textMuted: '#9ca3af',
}

const CHART_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'
]

function formatCompact(num: number): string {
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`
  return `₹${num}`
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

interface MetricCardData {
  label: string
  value: string | number
  subtitle?: string
  trend?: { value: number; label: string }
  icon?: React.ReactNode
  color?: string
  sparkline?: number[]
}

function TopMetricsRow({ metrics, className = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" }: { metrics: MetricCardData[]; className?: string }) {
  return (
    <motion.div
      className={`grid gap-3 sm:gap-4 ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ staggerChildren: 0.08, delayChildren: 0.1 }}
    >
      {metrics.map((m, i) => (
        <motion.div key={m.label} className="min-w-0 max-sm:last:odd:col-span-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <MetricCard
            title={m.label}
            value={m.value}
            subtitle={m.subtitle}
            trend={m.trend}
            icon={m.icon}
            color={m.color}
            sparkline={m.sparkline}
            index={i}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}

interface LeadFunnelChartProps {
  data: Record<string, number>
}

function LeadFunnelChart({ data }: LeadFunnelChartProps) {
  const entries = useMemo(() => 
    Object.entries(data)
      .filter(([, v]) => (v as number) > 0)
      .map(([name, value]) => ({ name, value: value as number }))
      .sort((a, b) => b.value - a.value), [data])

  if (!entries.length) return null

  const maxValue = Math.max(...entries.map(e => e.value))

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <motion.div key={entry.name} className="group" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08, duration: 0.3 }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-gray-700 truncate">{entry.name}</span>
            <span className="text-xs font-semibold text-gray-900 shrink-0">{entry.value}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full transition-all duration-500 ease-out"
              initial={{ width: 0 }}
              animate={{ width: `${(entry.value / maxValue) * 100}%` }}
              transition={{ delay: index * 0.1, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              style={{
                background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]} 0%, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]} 100%)`,
              }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  )
}

interface WeeklyPatternChartProps {
  weeklyData: Record<string, number>
}

function WeeklyPatternChart({ weeklyData }: WeeklyPatternChartProps) {
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  
  const dayTotals = useMemo(() => {
    const totals = dayOrder.map(() => 0)
    const counts = dayOrder.map(() => 0)
    
    Object.entries(weeklyData).forEach(([dateStr, value]) => {
      const date = new Date(dateStr + 'T00:00:00')
      const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1
      totals[dayIndex] += value || 0
      counts[dayIndex] += 1
    })
    
    return dayOrder.map((day, i) => ({
      day,
      total: totals[i],
      avg: counts[i] > 0 ? Math.round(totals[i] / counts[i]) : 0,
      count: counts[i],
    }))
  }, [weeklyData])

  const maxTotal = Math.max(...dayTotals.map(d => d.total), 1)

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Collection Pattern by Day</p>
      <motion.div className="flex items-end justify-around gap-2 h-48">
        {dayTotals.map((d, i) => (
          <motion.div key={d.day} className="flex flex-col items-center gap-1 flex-1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.4 }}>
            <motion.div
              className="w-full rounded-t-lg transition-all duration-300 hover:opacity-80"
              initial={{ height: 0, minHeight: '4px' }}
              animate={{ height: `${Math.max((d.total / maxTotal) * 100, 2)}%`, minHeight: '4px' }}
              transition={{ delay: i * 0.08, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              style={{
                background: `linear-gradient(180deg, ${CHART_COLORS[i]} 0%, ${CHART_COLORS[i]}dd 100%)`,
              }}
              title={`${d.day}: ${currency(d.total)} (avg ${currency(d.avg)})`}
            />
            <span className="text-xs text-gray-500 font-medium">{d.day}</span>
            <span className="text-[10px] text-gray-400">{d.total > 0 ? formatCompact(d.total) : '—'}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export default function Dashboard({ session }: { session: Session }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [proj, setProj] = useState<any>(null)
  const [financialAnalytics, setFinancialAnalytics] = useState<any>(null)
  const [financialLoading, setFinancialLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${session.token}` }, signal: ctrl.signal })
      .then(r => r.json()).then(r => { if (r.success) setData(r.data) })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setLoading(false) })
    if (session.role === 'Admin') {
      fetch('/api/projection', { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json()).then(r => { if (r.success) setProj(r.data) }).catch(() => {})
      fetch('/api/financial-analytics', { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.json()).then(r => { if (r.success) setFinancialAnalytics(r.data) })
        .catch(() => {})
        .finally(() => { setFinancialLoading(false) })
    } else {
      setFinancialLoading(false)
    }
  }, [session.token, session.role])

  const m = data?.metrics
  const isAdmin = session.role === 'Admin'
  const isGuarantor = session.role === 'Guarantor'

  const weeklyEntries = useMemo(() => 
    data?.weeklyCollections
      ? Object.entries(data.weeklyCollections as Record<string, number>)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-14)
          .map(([, v]) => v)
      : [], [data?.weeklyCollections])

  const monthCollected = useMemo(() => 
    data?.weeklyCollections
      ? Object.values(data.weeklyCollections as Record<string, number>).reduce((s, v) => s + v, 0)
      : 0, [data?.weeklyCollections])

  const prevMonthCollected = m?.prevMonthCollection || 0
  const monthChange = prevMonthCollected ? Math.round(((monthCollected - prevMonthCollected) / prevMonthCollected) * 100) : 0

  const activeLoansChange = m?.prevActiveLoans ? Math.round(((m.activeLoans - m.prevActiveLoans) / m.prevActiveLoans) * 100) : 0
  const overdueChange = m?.prevOverdueLoans ? Math.round(((m.overdueLoans - m.prevOverdueLoans) / m.prevOverdueLoans) * 100) : 0

  if (loading) return (
    <ReducedMotionProvider>
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-[1.5rem] border border-white/70 bg-white p-4 md:p-5 shadow-panel">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mt-2"></div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel h-80"></div>
          <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel h-80"></div>
          <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel h-80"></div>
        </div>
      </div>
    </ReducedMotionProvider>
  )
  if (!data) return <div className="flex h-40 items-center justify-center text-gray-400">Failed to load dashboard.</div>

  const adminMetricCards = [
    {
      label: 'Total Portfolio',
      value: currency(m.totalLoanAmount || 0),
      subtitle: `${m.activeLoans} active loans`,
      trend: { value: activeLoansChange, label: 'vs last period' },
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ),
      color: 'from-indigo-500 to-indigo-600',
      sparkline: weeklyEntries,
    },
    {
      label: 'Available Capital',
      value: currency(m.availableCapital || 0),
      subtitle: (m.availableCapital || 0) < 0 ? 'Overdrawn' : 'Ready to deploy',
      trend: m.prevAvailableCapital ? { value: Math.round(((m.availableCapital - m.prevAvailableCapital) / Math.abs(m.prevAvailableCapital || 1)) * 100), label: 'vs last period' } : undefined,
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: (m.availableCapital || 0) < 0 ? 'from-red-500 to-red-600' : 'from-emerald-500 to-emerald-600',
    },
    {
      label: 'This Week Due',
      value: currency(m.thisWeekCollection || 0),
      subtitle: 'Due this Saturday',
      trend: m.prevWeekCollection ? { value: Math.round(((m.thisWeekCollection - m.prevWeekCollection) / (m.prevWeekCollection || 1)) * 100), label: 'vs last week' } : undefined,
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      color: 'from-amber-500 to-amber-600',
    },
    {
      label: 'Month Collected',
      value: currency(monthCollected),
      subtitle: `${monthChange >= 0 ? '+' : ''}${monthChange}% vs last month`,
      trend: { value: monthChange, label: 'vs last month' },
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: 'from-green-500 to-green-600',
    },
    {
      label: 'Interest Earned',
      value: currency(m.totalInterest || 0),
      subtitle: 'Total interest income',
      trend: m.prevInterest ? { value: Math.round(((m.totalInterest - m.prevInterest) / (m.prevInterest || 1)) * 100), label: 'vs last period' } : undefined,
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: 'from-amber-500 to-orange-600',
    },
  ]

  const guarantorMetricCards = [
    {
      label: 'My Active Loans',
      value: m.activeLoans,
      subtitle: `${m.overdueLoans} overdue`,
      trend: { value: activeLoansChange, label: 'vs last period' },
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
        </svg>
      ),
      color: 'from-blue-500 to-blue-600',
    },
    {
      label: 'Pending Leads',
      value: m.pendingLeads,
      subtitle: 'Awaiting approval',
      trend: { value: 0, label: 'vs last period' },
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      label: 'Commission Earned',
      value: currency(m.commissionEarned || 0),
      subtitle: 'Total to date',
      trend: m.prevCommission ? { value: Math.round(((m.commissionEarned - m.prevCommission) / (m.prevCommission || 1)) * 100), label: 'vs last period' } : undefined,
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: 'from-emerald-500 to-emerald-600',
    },
  ]

  const agentMetricCards = [
    {
      label: 'Assigned Verifications',
      value: m.assignedVerifications || 0,
      subtitle: 'Pending field visit',
      trend: { value: 0, label: 'vs last period' },
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
      color: 'from-blue-500 to-blue-600',
    },
    {
      label: "Today's Due",
      value: m.todayDue || 0,
      subtitle: 'Collections due today',
      trend: { value: 0, label: 'vs last period' },
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      color: 'from-amber-500 to-amber-600',
    },
    {
      label: 'Collected This Week',
      value: currency(m.weekCollected || 0),
      subtitle: 'Weekly collection total',
      trend: m.prevWeekCollected ? { value: Math.round(((m.weekCollected - m.prevWeekCollected) / (m.prevWeekCollected || 1)) * 100), label: 'vs last week' } : undefined,
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: 'from-green-500 to-green-600',
    },
  ]

  const metricCards = isAdmin ? adminMetricCards : isGuarantor ? guarantorMetricCards : agentMetricCards

  return (
    <ReducedMotionProvider>
      <PageTransition>
        <div className="space-y-4">
          {/* Header with quick stats */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <p className="mt-1 text-sm text-gray-500">
                {isAdmin ? 'Admin overview' : isGuarantor ? 'Guarantor portal' : 'Agent dashboard'}
                {data.lastUpdated && ` • Updated ${new Date(data.lastUpdated).toLocaleTimeString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            </div>
          </motion.div>

          {/* Top Metric Cards - directly below header */}
          <TopMetricsRow metrics={metricCards} className="grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" />

          {/* Main Charts Grid */}
          <motion.div
            className="grid gap-4 sm:grid-cols-1 lg:grid-cols-12 min-w-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.1, delay: 0.1 }}
          >
            {/* Collection Trend - Large */}
            <motion.div className="lg:col-span-7 min-w-0 rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold">Collection Trend</p>
                  <p className="text-xs text-gray-500">Daily paid collections over 30 days</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl bg-indigo-50 text-indigo-600 px-3 py-1 text-xs font-medium">
                    Month: {currency(monthCollected)}
                  </span>
                </div>
              </div>
              <CollectionTrendChart data={data.weeklyCollections} />
            </motion.div>

            {/* Right Column - Portfolio & Recollection */}
            <motion.div className="lg:col-span-5 min-w-0 space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, staggerChildren: 0.1 }}>
              {/* Loan Portfolio Donut */}
              <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">Loan Portfolio</p>
                    <p className="text-xs text-gray-500">Active vs completed status</p>
                  </div>
                  <motion.span
                    className="text-2xl font-bold text-gray-900"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
                  >
                    {(m.activeLoans || 0) + (m.completedLoans || 0)}
                  </motion.span>
                </div>
                <LoanPortfolioChart
                  active={m.activeLoans || 0}
                  overdue={m.overdueLoans || 0}
                  completed={m.completedLoans || 0}
                />
              </motion.div>

              {/* Recollection Rate Gauge */}
              <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">Recollection Rate</p>
                    <p className="text-xs text-gray-500">Collected vs due this period</p>
                  </div>
                </div>
                <RecollectionGauge
                  value={m.recollectionRate ?? 0}
                  collected={m.collectedCount ?? 0}
                  pending={m.pendingCount ?? 0}
                />
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Second Row - Weekly Pattern & Lead Funnel */}
          <motion.div
            className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 min-w-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.1 }}
          >
            {/* Weekly Pattern */}
            <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <WeeklyPatternChart weeklyData={data.weeklyCollections} />
            </motion.div>

            {/* Lead Funnel */}
            {isAdmin && Object.keys(data.leadFunnel).length > 0 && (
              <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <div className="mb-4">
                  <p className="text-sm font-semibold">Lead Pipeline</p>
                  <p className="text-xs text-gray-500">Funnel view by status</p>
                </div>
                <LeadFunnelChart data={data.leadFunnel} />
              </motion.div>
            )}

            {/* Guarantor/Agent: Quick Actions */}
            {!isAdmin && (
              <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                <p className="text-sm font-semibold mb-4">Quick Actions</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button className="rounded-xl border border-gray-200 p-4 text-left hover:border-primary hover:bg-gray-50 transition-colors">
                    <p className="font-medium text-gray-900">Mark Attendance</p>
                    <p className="text-xs text-gray-500 mt-1">Check in for today</p>
                  </button>
                  <button className="rounded-xl border border-gray-200 p-4 text-left hover:border-primary hover:bg-gray-50 transition-colors">
                    <p className="font-medium text-gray-900">Log Collection</p>
                    <p className="text-xs text-gray-500 mt-1">Record payment received</p>
                  </button>
                  <button className="rounded-xl border border-gray-200 p-4 text-left hover:border-primary hover:bg-gray-50 transition-colors">
                    <p className="font-medium text-gray-900">Submit Verification</p>
                    <p className="text-xs text-gray-500 mt-1">Complete field visit</p>
                  </button>
                  <button className="rounded-xl border border-gray-200 p-4 text-left hover:border-primary hover:bg-gray-50 transition-colors">
                    <p className="font-medium text-gray-900">View Schedule</p>
                    <p className="text-xs text-gray-500 mt-1">Today's appointments</p>
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Admin: Projected Returns & Capital Details */}
          {isAdmin && proj && (
            <motion.div className="min-w-0 rounded-[1.75rem] border border-white/70 bg-white p-4 md:p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between flex-wrap gap-3 mb-5">
                <div>
                  <p className="text-sm font-semibold">Projected Returns (Compounding Model)</p>
                  <p className="text-xs text-gray-500">Re-lend all collections • on {currency(proj.inputs.capital)} available</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-green-600">{proj.yearReturnPct}%<span className="text-sm font-medium text-gray-500"> / year</span></p>
                  <p className="text-xs text-gray-500">{proj.totalLoans} loans • {currency(proj.totalProfit)} profit in 52 wks</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                      <th className="px-3 py-2 text-left">Period</th>
                      <th className="px-3 py-2 text-right">Return %</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                      <th className="px-3 py-2 text-right">Capital</th>
                      <th className="px-3 py-2 text-right">Loans</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {proj.periods.map((p: any) => (
                      <tr key={p.label} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{p.label}</td>
                        <td className="px-3 py-2 text-right font-semibold text-green-600">{p.returnPct}%</td>
                        <td className="px-3 py-2 text-right text-green-700">{currency(p.profit)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{currency(p.capital)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{p.loans}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] md:text-[11px] text-gray-500">Assumes full borrower demand & on-time collection — real returns lower with idle cash or defaults.</p>
            </motion.div>
          )}

          {/* Admin: Financial Analytics Section */}
          {isAdmin && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.1, delay: 0.3 }}
            >
              {/* Section Header */}
              <motion.div
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div>
                  <p className="text-lg font-semibold text-gray-900">Financial Analytics</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Balance sheet breakdown & movement analysis
                    {financialAnalytics?.dataAsOf && ` • As of ${new Date(financialAnalytics.dataAsOf).toLocaleDateString('en-IN')}`}
                  </p>
                </div>
                {financialLoading && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Loading...
                  </span>
                )}
              </motion.div>

              {/* Financial Summary Cards */}
              {!financialLoading && financialAnalytics?.hasAccountingData && financialAnalytics?.summary && (
                <motion.div
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ staggerChildren: 0.08 }}
                >
                  <FinancialSummaryCard
                    title="Total Assets"
                    value={financialAnalytics.summary.totalAssets}
                    subtitle="Assets = Liabilities + Equity"
                    trend={financialAnalytics.summary.assetsChange}
                    icon={
                      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    }
                    color="from-blue-500 to-blue-600"
                    index={0}
                  />
                  <FinancialSummaryCard
                    title="Total Liabilities"
                    value={financialAnalytics.summary.totalLiabilities}
                    subtitle="Outstanding obligations"
                    trend={financialAnalytics.summary.liabilitiesChange}
                    icon={
                      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="12" y1="9" x2="12" y2="15" />
                        <line x1="9" y1="12" x2="15" y2="12" />
                      </svg>
                    }
                    color="from-red-500 to-red-600"
                    index={1}
                  />
                </motion.div>
              )}

              {!financialLoading && financialAnalytics?.hasAccountingData && financialAnalytics?.summary && !financialAnalytics.summary.totalAssets && (
                <motion.div
                  className="rounded-[1.75rem] border border-white/70 bg-white p-8 shadow-panel text-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-3 text-gray-500">No financial data available yet</p>
                  <p className="mt-1 text-xs text-gray-400">Add capital records and loan data to view analytics</p>
                </motion.div>
              )}

              {!financialLoading && (!financialAnalytics?.hasAccountingData || !financialAnalytics) && (
                <motion.div
                  className="rounded-[1.75rem] border border-white/70 bg-white p-8 shadow-panel text-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-3 text-gray-500">Accounting data not configured</p>
                  <p className="mt-1 text-xs text-gray-400">Add capital investment records to enable financial analytics</p>
                </motion.div>
              )}

              {/* Assets & Liabilities Breakdown Donut Charts */}
              {!financialLoading && financialAnalytics?.hasAccountingData && financialAnalytics?.assetsBreakdown?.length > 0 && (
                <motion.div
                  className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ staggerChildren: 0.1 }}
                >
                  <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <div className="mb-4">
                      <p className="text-sm font-semibold">Total Assets Breakdown</p>
                      <p className="text-xs text-gray-500">Composition of assets by category</p>
                    </div>
                    <AssetsBreakdownDonut
                      data={financialAnalytics.assetsBreakdown}
                      total={financialAnalytics.summary.totalAssets}
                      title="Total Assets"
                    />
                  </motion.div>

                  <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                    <div className="mb-4">
                      <p className="text-sm font-semibold">Total Liabilities & Equity</p>
                      <p className="text-xs text-gray-500">Composition of liabilities and equity</p>
                    </div>
                    <LiabilitiesBreakdownDonut
                      data={financialAnalytics.liabilitiesBreakdown}
                      total={financialAnalytics.summary.totalLiabilities + financialAnalytics.summary.totalEquity}
                      title="Liabilities & Equity"
                    />
                  </motion.div>
                </motion.div>
              )}

              {/* Waterfall Charts - Movement Analysis */}
              {!financialLoading && financialAnalytics?.hasAccountingData && financialAnalytics?.assetsMovement?.length > 0 && (
                <motion.div
                  className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ staggerChildren: 0.1 }}
                >
                  <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel min-h-[380px]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <WaterfallChart
                      data={financialAnalytics.assetsMovement}
                      title="Assets Movement"
                      subtitle="Opening balance to closing assets"
                      height={320}
                      colors={{
                        increase: '#22c55e',
                        decrease: '#ef4444',
                        total: '#2563eb',
                      }}
                    />
                  </motion.div>

                  <motion.div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-panel min-h-[380px]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                    <WaterfallChart
                      data={financialAnalytics.liabilitiesMovement}
                      title="Liabilities & Equity Movement"
                      subtitle="Opening balance to closing liabilities & equity"
                      height={320}
                      colors={{
                        increase: '#22c55e',
                        decrease: '#ef4444',
                        total: '#dc2626',
                      }}
                    />
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Summary Cards Row */}
          <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 min-w-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ staggerChildren: 0.08 }}>
            {[
              { label: 'Active Customers', value: data.metrics.activeCustomers, icon: '👥', color: 'bg-blue-100 text-blue-600' },
              { label: 'Pending Leads', value: data.metrics.pendingLeads, icon: '📋', color: 'bg-indigo-100 text-indigo-600' },
              { label: 'Overdue Loans', value: data.metrics.overdueLoans, icon: '⚠️', color: 'bg-red-100 text-red-600' },
              { label: 'Renewal Eligible', value: data.metrics.renewalEligible, icon: '🔄', color: 'bg-green-100 text-green-600' },
            ].map(s => (
              <motion.div key={s.label} className="rounded-2xl bg-gray-50 p-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.3, type: 'spring', stiffness: 200, damping: 20 }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="mt-1 text-2xl md:text-3xl font-bold text-gray-900">{s.value}</p>
                  </div>
                  <span className={`p-3 rounded-2xl ${s.color} text-2xl`}>{s.icon}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </PageTransition>
    </ReducedMotionProvider>
  )
}