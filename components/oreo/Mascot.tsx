'use client'
// Oreo's face: a round chocolate cookie with a cream ring. The orb around it shows what Oreo is doing.
export type OreoState = 'idle' | 'listening' | 'thinking' | 'speaking'

export function OreoFace({ size = 56, state = 'idle' }: { size?: number; state?: OreoState }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Oreo">
      <defs>
        <radialGradient id="ore-c" cx="40%" cy="35%" r="75%"><stop offset="0%" stopColor="#4a3326" /><stop offset="100%" stopColor="#1f140d" /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#ore-c)" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#f4ead7" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" opacity=".8" />
      <g className={state === 'thinking' ? 'ore-blink' : ''}>
        <ellipse cx="37" cy="44" rx="5" ry={state === 'thinking' ? 1.5 : 6.5} fill="#f4ead7" />
        <ellipse cx="63" cy="44" rx="5" ry={state === 'thinking' ? 1.5 : 6.5} fill="#f4ead7" />
      </g>
      {state === 'speaking'
        ? <ellipse cx="50" cy="66" rx="9" ry="6" fill="#f4ead7" className="ore-talk" />
        : state === 'listening'
          ? <ellipse cx="50" cy="66" rx="5" ry="5" fill="#f4ead7" />
          : <path d="M38 63 Q50 74 62 63" stroke="#f4ead7" strokeWidth="4" fill="none" strokeLinecap="round" />}
    </svg>
  )
}

export function OreoStyles() {
  return (
    <style>{`
      @keyframes ore-pulse { 0% { transform: scale(1); opacity:.55 } 100% { transform: scale(1.35); opacity:0 } }
      @keyframes ore-spin { to { transform: rotate(360deg) } }
      @keyframes ore-talk { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(.45) } }
      @keyframes ore-blink { 0%,90%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
      @keyframes ore-dash { to { stroke-dashoffset: -24 } }
      .ore-talk { transform-origin: 50px 66px; animation: ore-talk .28s infinite }
      .ore-blink { transform-origin: 50px 44px; animation: ore-blink 4s infinite }
      .ore-flow { stroke-dasharray: 5 7; animation: ore-dash 1.4s linear infinite }
    `}</style>
  )
}

/** The big round button in the chat panel: tap to talk. */
export function OreoOrb({ state, onClick, label, size = 168 }: { state: OreoState; onClick: () => void; label: string; size?: number }) {
  const ring = state === 'listening' ? '#34d399' : state === 'speaking' ? '#60a5fa' : state === 'thinking' ? '#fbbf24' : '#64748b'
  return (
    <button onClick={onClick} aria-label={label} className="relative flex items-center justify-center rounded-full bg-[#0e1a17] shadow-xl outline-none" style={{ width: size, height: size }}>
      {(state === 'listening' || state === 'speaking') && <span className="absolute inset-0 rounded-full" style={{ border: `2px solid ${ring}`, animation: 'ore-pulse 1.6s ease-out infinite' }} />}
      <span className="absolute inset-2 rounded-full" style={{ border: `3px solid ${ring}33`, borderTopColor: ring, animation: state === 'thinking' ? 'ore-spin 1s linear infinite' : undefined }} />
      <OreoFace size={size * 0.52} state={state} />
    </button>
  )
}
