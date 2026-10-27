'use client'

// Animated NGF logo shown while the app opens after login: the letters N, G, F slide in one by one,
// then the red arrow draws itself up over them, then the name fades in. Pure CSS (see .ngf-splash in globals.css);
// people who ask their phone for reduced motion get the finished logo at once.
export default function SplashLogo({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={`ngf-splash ${overlay ? 'fixed inset-0 z-[100]' : 'h-screen'} flex flex-col items-center justify-center gap-6 bg-white`} role="status" aria-label="Loading NGF FINCORP">
      <svg viewBox="0 0 400 230" className="w-[78vw] max-w-[420px]" aria-hidden="true">
        <g fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif" fontWeight={900} fontSize={140}>
          <text className="ngf-l ngf-l1" x={10} y={150} fill="#d6141f" textLength={112} lengthAdjust="spacingAndGlyphs">N</text>
          <text className="ngf-l ngf-l2" x={132} y={150} fill="#0b2a6b" textLength={118} lengthAdjust="spacingAndGlyphs">G</text>
          <text className="ngf-l ngf-l3" x={262} y={150} fill="#d6141f" textLength={98} lengthAdjust="spacingAndGlyphs">F</text>
        </g>
        <path className="ngf-arrow" d="M18 158 C 120 170, 250 125, 330 50" fill="none" stroke="#d6141f" strokeWidth={9} strokeLinecap="round" pathLength={1} />
        <polygon className="ngf-head" points="349,26 340,63 313,38" fill="#d6141f" />
        <g fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif" fontWeight={900} fontSize={34} className="ngf-name">
          <text x={200} y={212} textAnchor="middle"><tspan fill="#d6141f">NGF </tspan><tspan fill="#0b2a6b">FINCORP</tspan></text>
        </g>
      </svg>
      <div className="ngf-bar h-1 w-40 overflow-hidden rounded-full bg-line"><span className="block h-full w-1/3 rounded-full bg-gold" /></div>
    </div>
  )
}
