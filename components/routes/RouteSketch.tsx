'use client'
import { useMemo } from 'react'

// "Today at a glance": a small schematic of the day, drawn like a journey that climbs from the bottom (Start) up through
// stop 1, 2, 3 ... It is not a map and not to scale. Stops are spaced evenly so every name stays readable; the only
// geography kept is the compass arrow on each leg (north is up) and the km between stops.

export type SketchStop = {
  id: string; n: number; label: string; lat: number; lng: number; done: boolean; absent?: boolean; legKm?: number | null
}

const W = 360, STEP = 88, TOP = 48, BOTTOM = 62, LEFT = 96, RIGHT = 264

// Direction of travel in degrees, 0 = north (up), 90 = east
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180)
  return (Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI
}

const short = (s: string, n = 15) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const chipW = (s: string) => Math.round(s.length * 7.1 + 22)

export default function RouteSketch({ start, startLabel, stops, nextId, onPick, bare }: {
  start: { lat: number; lng: number } | null
  startLabel: string
  stops: SketchStop[]
  nextId?: string
  onPick?: (id: string) => void
  bare?: boolean // no own card or heading (the page has one)
}) {
  const g = useMemo(() => {
    // node 0 is the start (when known), then the stops; they zig-zag upwards, the start sits at the bottom
    const nodes = [...(start ? [{ lat: start.lat, lng: start.lng }] : []), ...stops.map(s => ({ lat: s.lat, lng: s.lng }))]
    const H = TOP + BOTTOM + (nodes.length - 1) * STEP
    const pos = nodes.map((_, i) => ({ x: i % 2 === 0 ? LEFT : RIGHT, y: H - BOTTOM - i * STEP }))
    return { nodes, pos, H, offset: start ? 1 : 0 }
  }, [start, stops])

  if (stops.length === 0) return null
  const { H } = g
  const nextIdx = stops.findIndex(s => s.id === nextId)
  const done = stops.filter(s => s.done).length

  return (
    <div className={`mx-auto w-full overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#20204a] to-[#2b2461] p-4 text-white ${bare ? '' : 'max-w-[520px] rounded-[1.75rem] shadow-panel'}`}>
      {!bare && (
      <div className="mb-1 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Today at a glance</p>
          <p className="mt-0.5 text-lg font-bold leading-tight">{done} of {stops.length} done</p>
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-all" style={{ width: `${(done / stops.length) * 100}%` }} />
        </div>
      </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[420px]" role="img" aria-label="Sketch of today's visits, from the start at the bottom upwards">
        <defs>
          <style>{`
            .rs-flow { animation: rs-flow 1.1s linear infinite }
            .rs-pulse { transform-box: fill-box; transform-origin: center; animation: rs-pulse 2s ease-in-out infinite }
            @keyframes rs-flow { to { stroke-dashoffset: -16 } }
            @keyframes rs-pulse { 0%,100% { transform: scale(1); opacity: .95 } 50% { transform: scale(1.22); opacity: .35 } }
            @media (prefers-reduced-motion: reduce) { .rs-flow, .rs-pulse { animation: none } }
          `}</style>
          <filter id="rs-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" /></filter>
          <filter id="rs-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity=".35" /></filter>
          <marker id="rs-head" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M1 1 L9 5 L1 9 z" fill="#fff" fillOpacity=".8" /></marker>
          <marker id="rs-head-next" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 L9 5 L1 9 z" fill="#f0b429" /></marker>
          <marker id="rs-head-done" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 L9 5 L1 9 z" fill="#4ade80" /></marker>
        </defs>

        {/* legs, drawn from the lower node up to the higher one */}
        {g.nodes.slice(1).map((node, j) => {
          const i = j + 1
          const from = g.pos[i - 1], to = g.pos[i]
          const k = i - g.offset
          if (k < 0) return null
          const s = stops[k]
          const isDone = s.done
          const isNextLeg = k === nextIdx
          const y1 = from.y - 24, y2 = to.y + 26
          const mid = (y1 + y2) / 2
          const d = `M${from.x} ${y1} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${y2}`
          const colour = isDone ? '#4ade80' : isNextLeg ? '#f0b429' : '#ffffff'
          const ang = bearing(g.nodes[i - 1], node)
          const km = s.legKm != null ? `${s.legKm} km` : ''
          const w = km ? 74 : 30
          const mx = (from.x + to.x) / 2, my = (y1 + y2) / 2
          return (
            <g key={`leg-${s.id}`}>
              {(isDone || isNextLeg) && <path d={d} fill="none" stroke={colour} strokeWidth="7" strokeOpacity=".35" filter="url(#rs-glow)" />}
              <path d={d} fill="none" stroke={colour} strokeOpacity={isDone || isNextLeg ? 1 : 0.5} strokeWidth={isDone ? 3.4 : 3} strokeLinecap="round"
                strokeDasharray={isDone ? undefined : '8 8'} className={isNextLeg ? 'rs-flow' : undefined}
                markerEnd={`url(#${isDone ? 'rs-head-done' : isNextLeg ? 'rs-head-next' : 'rs-head'})`} />
              <g transform={`translate(${mx},${my})`}>
                <rect x={-w / 2} y="-12" width={w} height="24" rx="12" fill="#14143a" fillOpacity=".92" stroke={colour} strokeOpacity={isDone || isNextLeg ? 0.8 : 0.28} />
                <g transform={`translate(${km ? -w / 2 + 16 : 0},0) rotate(${ang})`}><path d="M0 -6.5 L4.8 5.5 L0 2.8 L-4.8 5.5 z" fill={colour} /></g>
                {km && <text x={-w / 2 + 29} y="4" fontSize="11" fontWeight="700" fill="#fff">{km}</text>}
              </g>
            </g>
          )
        })}

        {/* stops */}
        {stops.map((s, k) => {
          const p = g.pos[k + g.offset]
          const isNext = k === nextIdx
          const left = p.x < W / 2
          const label = short(s.label)
          const w = chipW(label)
          const tone = s.done ? (s.absent ? '#f87171' : '#4ade80') : isNext ? '#f0b429' : '#ffffff'
          return (
            <g key={s.id} transform={`translate(${p.x},${p.y})`} className={onPick ? 'cursor-pointer' : undefined} onClick={() => onPick?.(s.id)}>
              {isNext && <circle r="27" fill="none" stroke="#f0b429" strokeWidth="3" className="rs-pulse" />}
              <circle r="21" fill={tone} fillOpacity=".18" />
              <circle r="17" fill={s.done ? tone : '#fff'} filter="url(#rs-shadow)" />
              <text y="5.8" textAnchor="middle" fontSize="16" fontWeight="800" fill={s.done ? '#10102a' : '#1a1a2e'}>{s.done ? (s.absent ? '!' : '✓') : s.n}</text>
              <g transform={`translate(${left ? 30 : -30 - w},${isNext ? -21 : -13})`}>
                <rect width={w} height="26" rx="13" fill="#fff" fillOpacity={isNext ? 0.16 : 0.1} stroke={tone} strokeOpacity={isNext ? 0.85 : 0.25} />
                <text x={w / 2} y="17.5" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#fff">{label}</text>
              </g>
              {isNext && <text x={left ? 36 : -36} y="22" textAnchor={left ? 'start' : 'end'} fontSize="10.5" fontWeight="800" letterSpacing="1.6" fill="#f0b429">NEXT STOP</text>}
            </g>
          )
        })}

        {/* start, at the bottom */}
        {start && (() => {
          const p = g.pos[0], left = p.x < W / 2, w = chipW(startLabel)
          return (
            <g transform={`translate(${p.x},${p.y})`}>
              <rect x="-21" y="-21" width="42" height="42" rx="14" fill="#fff" fillOpacity=".12" />
              <rect x="-17" y="-17" width="34" height="34" rx="11" fill="#fff" filter="url(#rs-shadow)" />
              <path d="M-8 2.5 L0 -8 L8 2.5 M-5.5 1 V8.5 H5.5 V1" fill="none" stroke="#1a1a2e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <g transform={`translate(${left ? 30 : -30 - w},-13)`}>
                <rect width={w} height="26" rx="13" fill="#fff" fillOpacity=".1" stroke="#fff" strokeOpacity=".3" />
                <text x={w / 2} y="17.5" textAnchor="middle" fontSize="12.5" fontWeight="800" letterSpacing=".8" fill="#fff">{startLabel}</text>
              </g>
            </g>
          )
        })()}
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-white/60">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white" />To visit</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f0b429]" />Next</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />Done</span>
        </span>
        <span>Not a map · arrows show direction, north is up</span>
      </div>
    </div>
  )
}
