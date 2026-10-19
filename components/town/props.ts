// Props for the Branch Town scene: people, office furniture, vehicles, trees, street furniture. All procedural.
import * as THREE from 'three'
import { bx, rb, cyl, sph, cap, mesh, slab, std, glow, glass, woodTex, texMat, carpetTex, mat } from './kit'

const SKIN = [0xe0b48f, 0xc68d65, 0xa8714a, 0x8d5a3b]

/** Human facing +z, standing on y=0 (seated: hips at ~0.48, legs forward). */
export function human(o: { shirt: number; pants?: number; skin?: number; hair?: number; seated?: boolean; female?: boolean; tie?: number }): THREE.Group {
  const g = new THREE.Group()
  const skin = std(o.skin ?? SKIN[0], 0.7), shirt = std(o.shirt, 0.7), pants = std(o.pants ?? 0x1f2430, 0.8), hair = std(o.hair ?? 0x1a1410, 0.9)
  const seated = !!o.seated
  const hip = seated ? 0.5 : 0.9
  g.add(mesh(rb(0.42, 0.62, 0.25, 0.1), shirt, 0, hip + 0.36, 0))
  g.add(mesh(rb(0.4, 0.2, 0.26, 0.08), pants, 0, hip + 0.02, 0))
  if (o.tie !== undefined) g.add(mesh(bx(0.06, 0.34, 0.01), std(o.tie, 0.6), 0, hip + 0.42, 0.13))
  g.add(mesh(cyl(0.05, 0.06, 0.1, 10), skin, 0, hip + 0.7, 0))
  g.add(mesh(sph(0.115, 24, 18), skin, 0, hip + 0.86, 0))
  const cp = mesh(sph(0.122, 24, 14, ), hair, 0, hip + 0.89, -0.015); cp.scale.set(1, 0.85, 1.02); g.add(cp)
  if (o.female) { const bun = mesh(sph(0.07, 16, 10), hair, 0, hip + 0.9, -0.12); g.add(bun) }
  for (const s of [-1, 1]) {
    const arm = mesh(cap(0.05, 0.42), shirt, s * 0.27, hip + 0.4, seated ? 0.1 : 0); if (seated) arm.rotation.x = -0.9; g.add(arm)
    if (seated) { const th = mesh(cap(0.085, 0.34), pants, s * 0.1, hip - 0.04, 0.2); th.rotation.x = Math.PI / 2; g.add(th); const sh = mesh(cap(0.07, 0.34), pants, s * 0.1, hip - 0.28, 0.4); g.add(sh); g.add(mesh(rb(0.1, 0.07, 0.24, 0.03), std(0x15151a, 0.5), s * 0.1, 0.05, 0.46)) }
    else { g.add(mesh(cap(0.08, 0.62), pants, s * 0.1, hip - 0.4, 0)); g.add(mesh(rb(0.1, 0.07, 0.24, 0.03), std(0x15151a, 0.5), s * 0.1, 0.04, 0.06)) }
  }
  return g
}

export function sofa(w = 2.2, color = 0x374151): THREE.Group {
  const g = new THREE.Group(); const m = std(color, 0.75)
  g.add(mesh(rb(w, 0.28, 0.9, 0.06), std(0x1b1b1f, 0.5), 0, 0.2, 0))
  g.add(mesh(rb(w, 0.5, 0.2, 0.08), m, 0, 0.7, -0.34))
  for (const s of [-1, 1]) g.add(mesh(rb(0.2, 0.46, 0.82, 0.07), m, s * (w / 2 - 0.1), 0.5, 0))
  const n = Math.max(2, Math.round(w / 0.75)), cw = (w - 0.4) / n
  for (let i = 0; i < n; i++) g.add(mesh(rb(cw - 0.02, 0.2, 0.62, 0.07), m, -((w - 0.4) / 2) + cw * (i + 0.5), 0.46, 0.06))
  return g
}

export function plant(h = 1.2, potColor = 0xe8e2d8): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(cyl(0.2, 0.15, 0.4, 24), std(potColor, 0.4), 0, 0.2, 0))
  g.add(mesh(cyl(0.18, 0.18, 0.02, 20), std(0x3a2a1c, 1), 0, 0.4, 0))
  const lm = std(0x2f7d3b, 0.55), lm2 = std(0x3f9a4a, 0.55)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, tall = h * (0.55 + (i % 4) * 0.12)
    const leaf = mesh(sph(0.11, 12, 8), i % 2 ? lm : lm2, Math.cos(a) * 0.17, 0.4 + tall * 0.55, Math.sin(a) * 0.17)
    leaf.scale.set(1, tall * 4.2, 0.35); leaf.rotation.y = -a; leaf.rotation.z = Math.cos(a) * 0.35; leaf.rotation.x = Math.sin(a) * 0.35; g.add(leaf)
  }
  return g
}

export function officeChair(color = 0x20242c): THREE.Group {
  const g = new THREE.Group(); const m = std(color, 0.6)
  g.add(mesh(cyl(0.04, 0.04, 0.4, 10), std(0x777b83, 0.3, 0.8), 0, 0.25, 0))
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = mesh(bx(0.3, 0.025, 0.04), std(0x777b83, 0.3, 0.8), Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15); leg.rotation.y = -a; g.add(leg) }
  g.add(mesh(rb(0.5, 0.09, 0.5, 0.04), m, 0, 0.48, 0))
  g.add(mesh(rb(0.46, 0.55, 0.08, 0.04), m, 0, 0.82, -0.23))
  return g
}

export function deskSet(w = 1.5, d = 0.75, o: { wood?: string; monitors?: number } = {}): THREE.Group {
  const g = new THREE.Group(); const top = texMat(woodTex(Math.max(1, w), 1, o.wood ?? '#9a6a40'), 0.5)
  g.add(mesh(bx(w, 0.045, d), top, 0, 0.76, 0))
  for (const s of [-1, 1]) g.add(mesh(bx(0.04, 0.74, d - 0.1), std(0x2b2f38, 0.5), s * (w / 2 - 0.04), 0.37, 0))
  g.add(mesh(bx(w - 0.1, 0.5, 0.03), std(0x2b2f38, 0.5), 0, 0.5, -d / 2 + 0.08))
  const n = o.monitors ?? 1
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0.1 : -0.35 + i * 0.7
    g.add(mesh(rb(0.54, 0.32, 0.03, 0.012), std(0x101114, 0.3), x, 1.06, -0.15))
    g.add(mesh(bx(0.5, 0.28, 0.005), glow(0x2a6df0, 0.5), x, 1.06, -0.13))
    g.add(mesh(cyl(0.015, 0.015, 0.14, 8), std(0x333, 0.4, 0.6), x, 0.86, -0.15)); g.add(mesh(bx(0.18, 0.01, 0.14), std(0x333, 0.4, 0.6), x, 0.8, -0.14))
  }
  g.add(mesh(rb(0.42, 0.015, 0.14, 0.006), std(0x1b1c20, 0.5), 0.05, 0.795, 0.15))
  return g
}

export function palm(h = 7, seed = 1): THREE.Group {
  const g = new THREE.Group()
  const lean = 0.5 + (seed % 5) * 0.12
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.35, h * 0.5, 0), new THREE.Vector3(lean, h, 0)])
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.2, 10), std(0x7a6b58, 0.95)); trunk.castShadow = true; g.add(trunk)
  const frondM = mat('frond', () => new THREE.MeshStandardMaterial({ color: 0x3c7d34, roughness: 0.7, side: THREE.DoubleSide }))
  const top = new THREE.Vector3(lean, h, 0)
  for (let i = 0; i < 11; i++) {
    const geo = new THREE.PlaneGeometry(0.75, 4.4, 1, 8); const p = geo.attributes.position
    for (let k = 0; k < p.count; k++) { const t = Math.min(1, Math.max(0, (p.getY(k) + 2.2) / 4.4)); p.setZ(k, -Math.pow(t, 1.8) * 2.0); p.setX(k, p.getX(k) * (1 - t * 0.85)) }
    geo.translate(0, 2.2, 0); geo.computeVertexNormals()
    const f = new THREE.Mesh(geo, frondM); f.castShadow = true; f.position.copy(top); f.rotation.order = 'YXZ'; f.rotation.y = (i / 11) * Math.PI * 2 + seed; f.rotation.x = -0.55 - (i % 3) * 0.18; g.add(f)
  }
  for (let i = 0; i < 5; i++) g.add(mesh(sph(0.16, 10, 8), std(0x5a7a2a, 0.8), top.x + Math.cos(i * 1.3) * 0.22, h - 0.25, Math.sin(i * 1.3) * 0.22))
  return g
}

export function tree(h = 6, seed = 1): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(cyl(0.18, 0.28, h * 0.5, 10), std(0x5b4636, 0.95), 0, h * 0.25, 0))
  const cols = [0x3f7a35, 0x4b8a3e, 0x356b2e]
  for (let i = 0; i < 6; i++) {
    const r = h * (0.2 + ((seed + i) % 3) * 0.04)
    const b = mesh(new THREE.IcosahedronGeometry(r, 2), std(cols[(seed + i) % 3], 0.8), Math.cos(i * 1.1 + seed) * h * 0.18, h * (0.62 + (i % 3) * 0.1), Math.sin(i * 1.1 + seed) * h * 0.18)
    g.add(b)
  }
  return g
}

export function streetLight(): THREE.Group {
  const g = new THREE.Group(); const m = std(0x5d636d, 0.4, 0.7)
  g.add(mesh(cyl(0.07, 0.11, 8, 10), m, 0, 4, 0)); const arm = mesh(bx(2.2, 0.08, 0.08), m, 1.0, 8, 0); g.add(arm)
  g.add(mesh(rb(0.7, 0.1, 0.28, 0.04), m, 2.0, 7.98, 0)); const lamp = mesh(bx(0.55, 0.02, 0.2), glow(0xfff2c6, 0), 2.0, 7.92, 0, false); lamp.name = 'lamp'; g.add(lamp)
  return g
}

// ---------- vehicles (forward = +x, standing on y=0) ----------
const wheel = (r = 0.34, w = 0.24): THREE.Group => {
  const g = new THREE.Group()
  const t = mesh(cyl(r, r, w, 22), std(0x141416, 0.9), 0, 0, 0); t.rotation.x = Math.PI / 2; g.add(t)
  const h = mesh(cyl(r * 0.6, r * 0.6, w + 0.02, 14), std(0xb9bec6, 0.3, 0.8), 0, 0, 0); h.rotation.x = Math.PI / 2; g.add(h)
  return g
}
export function car(color: number): THREE.Group {
  const g = new THREE.Group(); const body = std(color, 0.35, 0.4, { envMapIntensity: 1.2 })
  g.add(mesh(rb(4.2, 0.62, 1.78, 0.22), body, 0, 0.62, 0))
  g.add(mesh(rb(2.3, 0.6, 1.6, 0.25), body, -0.2, 1.17, 0))
  const gl = mat('cargl', () => new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.6 }))
  g.add(mesh(rb(2.05, 0.42, 1.64, 0.16), gl, -0.18, 1.2, 0, false))
  g.add(mesh(rb(2.32, 0.07, 1.62, 0.03), body, -0.2, 1.5, 0))
  for (const sx of [-1.35, 1.35]) for (const sz of [-0.82, 0.82]) { const w = wheel(); w.position.set(sx, 0.34, sz); g.add(w) }
  for (const s of [-1, 1]) { g.add(mesh(bx(0.06, 0.12, 0.32), glow(0xfff6d6, 0.2), 2.1, 0.74, s * 0.6, false)); g.add(mesh(bx(0.05, 0.1, 0.3), glow(0xd01818, 0.3), -2.1, 0.76, s * 0.6, false)) }
  return g
}
export function autoRickshaw(): THREE.Group {
  const g = new THREE.Group(); const yellow = std(0xf2b81a, 0.4), black = std(0x15161a, 0.5)
  g.add(mesh(rb(2.2, 0.5, 1.2, 0.18), black, 0, 0.55, 0))
  g.add(mesh(rb(1.5, 1.0, 1.15, 0.18), yellow, -0.25, 1.15, 0))
  g.add(mesh(rb(1.58, 0.07, 1.22, 0.03), black, -0.25, 1.68, 0))
  g.add(mesh(rb(0.5, 0.75, 0.9, 0.12), yellow, 0.85, 0.95, 0))
  g.add(mesh(bx(0.03, 0.4, 0.8), glass(0x0c1218, 0.7), 1.1, 1.25, 0, false))
  for (const [x, z] of [[0.95, 0], [-0.8, -0.58], [-0.8, 0.58]] as const) { const w = wheel(0.28, 0.16); w.position.set(x, 0.28, z); g.add(w) }
  return g
}
export function bus(color = 0x1d4ed8): THREE.Group {
  const g = new THREE.Group(); const body = std(color, 0.4, 0.2), white = std(0xf3f4f6, 0.4)
  g.add(mesh(rb(10.2, 2.6, 2.5, 0.22), body, 0, 1.75, 0))
  g.add(mesh(bx(10.22, 0.7, 2.52), white, 0, 0.92, 0))
  g.add(mesh(rb(9.2, 0.85, 2.54, 0.1), glass(0x0b1118, 0.85), -0.1, 2.15, 0, false))
  g.add(mesh(rb(10.2, 0.14, 2.4, 0.06), white, 0, 3.1, 0))
  for (const sx of [-3.4, 3.4]) for (const sz of [-1.1, 1.1]) { const w = wheel(0.52, 0.34); w.position.set(sx, 0.52, sz); g.add(w) }
  for (const s of [-1, 1]) { g.add(mesh(bx(0.06, 0.18, 0.4), glow(0xfff6d6, 0.2), 5.12, 1.0, s * 0.8, false)); g.add(mesh(bx(0.06, 0.16, 0.34), glow(0xd01818, 0.3), -5.12, 1.0, s * 0.8, false)) }
  return g
}
export function lorry(color = 0xdc7a1c): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(rb(2.2, 2.0, 2.4, 0.2), std(color, 0.45), 3.3, 1.5, 0)); g.add(mesh(bx(0.05, 0.8, 2.0), glass(0x0b1118, 0.85), 4.42, 1.9, 0, false))
  g.add(mesh(bx(7.2, 0.3, 2.4), std(0x30343c, 0.6), -0.7, 0.65, 0)); g.add(mesh(rb(7.0, 2.4, 2.4, 0.08), std(0xdcdde0, 0.6), -0.8, 2.0, 0))
  for (const sx of [3.5, -1.0, -2.5]) for (const sz of [-1.05, 1.05]) { const w = wheel(0.5, 0.32); w.position.set(sx, 0.5, sz); g.add(w) }
  return g
}

export function carpet(w: number, d: number): THREE.Mesh { return mesh(bx(w, 0.012, d), texMat(carpetTex(w / 1.2, d / 1.2), 1), 0, 0.006, 0, false) }
