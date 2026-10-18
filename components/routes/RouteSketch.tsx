'use client'
import { useMemo } from 'react'

// A small schematic of the day, like a metro line: the start, then stop 1, 2, 3 ... joined by arrows in visiting order.
// It is not a map and not to scale. Stops are spaced evenly so every name stays readable; the only geography kept is
// the compass arrow on each leg (which way the agent drives, north is up) and the km between stops.

export type SketchStop = {
  id: string; n: number; label: string; lat: number; lng: number; done: boolean; absent?: boolean; legKm?: number | null
}

const W = 360, STEP = 84, TOP = 40, LEFT = 86, RIGHT = 274

// Direction of travel in degrees, 0 = north, 90 = east
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180)
  return (Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI
}

const short = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export default function RouteSketch({ start, startLabel, stops, nextId, onPick }: {
  start: { lat: number; lng: number } | null
  startLabel: string
  stops: SketchStop[]
  nextId?: string
  onPick?: (id: string) => void
}) {
  const g = useMemo(() => {
    // node 0 is the start (when known), the rest are the stops; they zig-zag down the page
    const nodes = [...(start ? [{ kind: 'start' as const, lat: start.lat, lng: start.lng }] : []), ...stops.map(s => ({ kind: 'stop' as const, lat: s.lat, lng: s.lng }))]
    const pos = nodes.map((_, i) => ({ x: i % 2 === 0 ? LEFT : RIGHT, y: TOP + i * STEP }))
    return { nodes, pos, offset: start ? 1 : 0 }
  }, [start, stops])

  if (stops.length === 0) return null
  const H = TOP * 2 + (g.nodes.length - 1) * STEP

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-3 shadow-panel sm:p-4">
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#697586]">Today at a glance</p>
        <p className="text-[11px] text-[#9aa3b2]">Not a map · north is up</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[420px]" role="img" aria-label="Sketch of today's visits in order">
        <defs>
          <marker id="rs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 1 L9 5 L0 9 z" fill="#1a1a2e" />
          </marker>
          <marker id="rs-arrow-done" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 1 L9 5 L0 9 z" fill="#16a34a" />
          </marker>
        </defs>

        {/* legs */}
        {g.nodes.slice(1).map((node, j) => {
          const i = j + 1
          const from = g.pos[i - 1], to = g.pos[i]
          const stopIdx = i - g.offset            // index in `stops` of the node this leg leads to
          if (stopIdx < 0) return null
          const s = stops[stopIdx]
          const done = s.done
          const y1 = from.y + 18, y2 = to.y - 20
          const mid = (y1 + y2) / 2
          const d = `M${from.x} ${y1} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${y2}`
          const ang = bearing(g.nodes[i - 1], node)
          const mx = (from.x + to.x) / 2, my = (y1 + y2) / 2
          return (
            <g key={`leg-${s.id}`}>
              <path d={d} fill="none" stroke={done ? '#16a34a' : '#1a1a2e'} strokeWidth={done ? 3 : 2.2}
                strokeDasharray={done ? undefined : '6 5'} markerEnd={`url(#${done ? 'rs-arrow-done' : 'rs-arrow'})`} />
              <g transform={`translate(${mx},${my})`}>
                <rect x={s.legKm != null ? -33 : -13} y="-11" width={s.legKm != null ? 66 : 26} height="22" rx="11" fill="#fff" stroke={done ? '#bbf7d0' : '#e5e7eb'} />
                <g transform={`translate(${s.legKm != null ? -20 : 0},0) rotate(${ang})`}>
                  <path d="M0 -6 L4.5 5 L0 2.5 L-4.5 5 z" fill={done ? '#16a34a' : '#344054'} />
                </g>
                {s.legKm != null && <text x="-6" y="3.5" fontSize="10.5" fontWeight="700" fill="#344054">{s.legKm} km</text>}
              </g>
            </g>
          )
        })}

        {/* start */}
        {start && (
          <g transform={`translate(${g.pos[0].x},${g.pos[0].y})`}>
            <rect x="-17" y="-17" width="34" height="34" rx="10" fill="#fff" stroke="#1a1a2e" strokeWidth="2.2" />
            <path d="M-8 2 L0 -8 L8 2 M-5.5 0.5 V8 H5.5 V0.5" fill="none" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x={g.pos[0].x < W / 2 ? 26 : -26} y="4" textAnchor={g.pos[0].x < W / 2 ? 'start' : 'end'} fontSize="12" fontWeight="700" fill="#344054">{startLabel}</text>
          </g>
        )}

        {/* stops */}
        {stops.map((s, k) => {
          const p = g.pos[k + g.offset]
          const isNext = s.id === nextId
          const fill = s.done ? (s.absent ? '#dc2626' : '#16a34a') : '#1a1a2e'
          const left = p.x < W / 2
          return (
            <g key={s.id} transform={`translate(${p.x},${p.y})`} className={onPick ? 'cursor-pointer' : undefined} onClick={() => onPick?.(s.id)}>
              {isNext && (
                <circle r="22" fill="none" stroke="#f0b429" strokeWidth="3.5">
                  <animate attributeName="r" values="20;25;20" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;.4;1" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r="17" fill={fill} stroke="#fff" strokeWidth="2.5" />
              <text y="5.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">{s.done ? (s.absent ? '!' : '✓') : s.n}</text>
              <text x={left ? 30 : -30} y="4.5" textAnchor={left ? 'start' : 'end'} fontSize="12.5" fontWeight="700" fill="#1a1a2e">{short(s.label)}</text>
              {isNext && <text x={left ? 30 : -30} y="19" textAnchor={left ? 'start' : 'end'} fontSize="10.5" fontWeight="700" fill="#b7791f">NEXT</text>}
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-[#697586]">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#1a1a2e]" />To visit</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#f0b429]" />Next</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />Done</span>
        <span>▲ arrow = direction of travel</span>
      </div>
    </div>
  )
}
