'use client'
import { Banknote, Smartphone, Landmark, CircleDollarSign } from 'lucide-react'

export type DiagramLine = { name: string; payCode?: string; amount: number; hidden?: boolean }

function currency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

const ROW = 56
const GAP = 8
const W = 56

const TONE: Record<string, { stroke: string; node: string; chip: string }> = {
  Verified:   { stroke: '#16a34a', node: 'border-green-200 bg-green-50',   chip: 'bg-green-100 text-green-700' },
  Overridden: { stroke: '#7c3aed', node: 'border-violet-200 bg-violet-50', chip: 'bg-violet-100 text-violet-700' },
  Flagged:    { stroke: '#d97706', node: 'border-amber-300 bg-amber-50',   chip: 'bg-amber-100 text-amber-800' },
}

function ModeIcon({ mode }: { mode: string }) {
  const cls = 'h-4 w-4'
  if (mode === 'UPI') return <Smartphone className={cls} />
  if (mode === 'Bank') return <Landmark className={cls} />
  if (mode === 'Cash') return <Banknote className={cls} />
  return <CircleDollarSign className={cls} />
}

// One payment on the left, the customers it covers on the right, joined by curves.
export default function PaymentDiagram({ utr, mode, total, status, lines }: {
  utr: string; mode: string; total: number; status: string; lines: DiagramLine[]
}) {
  const tone = TONE[status] || TONE.Verified
  const n = Math.max(lines.length, 1)
  const H = n * ROW + (n - 1) * GAP
  const mid = H / 2
  return (
    <div className="flex items-center">
      <div className={`w-[38%] max-w-[190px] shrink-0 rounded-2xl border p-3 ${tone.node}`}>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1a2e]">
          <ModeIcon mode={mode} /> {mode === 'UPI' ? 'UPI payment' : mode}
        </div>
        <p className="mt-1 text-lg font-bold leading-none text-[#1a1a2e]">{currency(total)}</p>
        {utr ? (
          <p className="mt-1.5 break-all font-mono text-[10px] leading-tight text-[#4b5563]">UTR {utr}</p>
        ) : (
          <p className="mt-1.5 text-[10px] text-[#697586]">No UTR</p>
        )}
        {lines.length > 1 && <p className="mt-1 text-[10px] font-semibold text-[#697586]">Split across {lines.length} customers</p>}
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
        {lines.map((_, i) => {
          const y = i * (ROW + GAP) + ROW / 2
          return (
            <path key={i} d={`M0 ${mid} C ${W / 2} ${mid}, ${W / 2} ${y}, ${W} ${y}`} fill="none" stroke={tone.stroke}
              strokeWidth={2.5} strokeLinecap="round" strokeDasharray={status === 'Flagged' ? '5 4' : undefined} />
          )
        })}
        <circle cx={0} cy={mid} r={3} fill={tone.stroke} />
        {lines.map((_, i) => <circle key={i} cx={W} cy={i * (ROW + GAP) + ROW / 2} r={3} fill={tone.stroke} />)}
      </svg>

      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: GAP }}>
        {lines.map((l, i) => (
          <div key={i} style={{ height: ROW }}
            className={`flex items-center gap-2 rounded-2xl border px-3 ${l.hidden ? 'border-dashed border-[#d1d5db] bg-[#f9fafb]' : 'border-[#e5e7eb] bg-white'}`}>
            <div className="min-w-0 flex-1">
              <p className={`line-clamp-2 break-words text-[13px] font-semibold leading-tight ${l.hidden ? 'text-[#697586]' : 'text-[#1a1a2e]'}`}>{l.name || 'Customer'}</p>
              <p className="mt-0.5 text-xs text-[#697586]">
                {l.payCode ? <span className="font-mono">#{l.payCode} · </span> : null}<span className="font-bold text-[#1a1a2e]">{currency(l.amount)}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
