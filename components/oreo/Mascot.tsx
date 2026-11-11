'use client'
// Oreo's look: a soft gradient orb with a spark in the middle. The spark changes with what Oreo is doing:
// idle (a dot slowly orbits a ring), listening (rings), thinking (the dot spins fast), speaking (moving bars).
export type OreoState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** The orb drawn around the point 0,0 with radius r (used inside the big graph and inside the small face). */
export function OrbGlyph({ r, state = 'idle' }: { r: number; state?: OreoState }) {
  const k = r * 0.42, w = r * 0.1
  return (
    <g>
      <defs>
        <linearGradient id="ore-orb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#22d3ee" /><stop offset="50%" stopColor="#6366f1" /><stop offset="100%" stopColor="#a855f7" /></linearGradient>
        <radialGradient id="ore-shine" cx="30%" cy="22%" r="55%"><stop offset="0%" stopColor="#fff" stopOpacity=".75" /><stop offset="100%" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle r={r} fill="url(#ore-orb)" />
      <circle r={r} fill="url(#ore-shine)" />
      {state === 'speaking'
        ? [-2, -1, 0, 1, 2].map(i => <rect key={i} x={i * w * 1.9 - w / 2} y={-k * 0.8} width={w} height={k * 1.6} rx={w / 2} fill="#fff" className="ore-eq" style={{ animationDelay: `${(i + 2) * 0.12}s` }} />)
        : (
          <>
            <circle r={r * 0.4} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth={w * 0.8} />
            <circle r={r * 0.13} fill="#fff" className={state === 'idle' ? 'ore-breathe' : ''} />
            <circle r={r * 0.4} fill="none" stroke="#fff" strokeWidth={w * 2.3} strokeLinecap="round" strokeDasharray={`0 ${r * 3}`} className={state === 'thinking' ? 'ore-orbit-fast' : 'ore-orbit'} />
          </>
        )}
      {state === 'listening' && <circle r={r * 0.7} fill="none" stroke="#fff" strokeWidth={w * 0.5} opacity=".7" className="ore-listen" />}
    </g>
  )
}

export function OreoFace({ size = 56, state = 'idle' }: { size?: number; state?: OreoState }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-label="Oreo"><OrbGlyph r={44} state={state} /></svg>
  )
}

export function OreoStyles() {
  return (
    <style>{`
      @keyframes ore-pulse { 0% { transform: scale(1); opacity:.55 } 100% { transform: scale(1.35); opacity:0 } }
      @keyframes ore-spin { to { transform: rotate(360deg) } }
      @keyframes ore-dash { to { stroke-dashoffset: -24 } }
      .ore-flow { stroke-dasharray: 5 7; animation: ore-dash 1.4s linear infinite }
      @keyframes ore-eq { 0%,100% { transform: scaleY(.25) } 50% { transform: scaleY(1) } }
      @keyframes ore-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.18) } }
      @keyframes ore-listen { 0% { transform: scale(.8); opacity:.8 } 100% { transform: scale(1.35); opacity:0 } }
      .ore-eq, .ore-breathe, .ore-orbit, .ore-orbit-fast, .ore-listen { transform-box: fill-box; transform-origin: center }
      .ore-eq { animation: ore-eq .9s ease-in-out infinite }
      .ore-breathe { animation: ore-breathe 3.2s ease-in-out infinite }
      .ore-orbit { animation: ore-spin 7s linear infinite }
      .ore-orbit-fast { animation: ore-spin 1s linear infinite }
      .ore-listen { animation: ore-listen 1.4s ease-out infinite }
    `}</style>
  )
}

/** The big round button in the chat panel: tap to talk. */
export function OreoOrb({ state, onClick, label, size = 168 }: { state: OreoState; onClick: () => void; label: string; size?: number }) {
  const ring = state === 'listening' ? '#10b981' : state === 'speaking' ? '#38bdf8' : state === 'thinking' ? '#f59e0b' : '#a5b4fc'
  return (
    <button onClick={onClick} aria-label={label} className="relative flex items-center justify-center rounded-full border border-line bg-white shadow-xl outline-none" style={{ width: size, height: size }}>
      {(state === 'listening' || state === 'speaking') && <span className="absolute inset-0 rounded-full" style={{ border: `2px solid ${ring}`, animation: 'ore-pulse 1.6s ease-out infinite' }} />}
      <span className="absolute inset-2 rounded-full" style={{ border: `3px solid ${ring}33`, borderTopColor: ring, animation: state === 'thinking' ? 'ore-spin 1s linear infinite' : undefined }} />
      <OreoFace size={size * 0.56} state={state} />
    </button>
  )
}
