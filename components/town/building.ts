// Branch building (4 storeys) and neighbouring filler buildings. Local frame: front faces +z (front plane z = 8), origin at ground centre.
// Ground floor: lighting shops. 1st floor: empty. 2nd floor: NGF office (left) + empty (right). Top: terrace.
import * as THREE from 'three'
import { bx, rb, cyl, mesh, slab, std, glow, glass, texMat, plasterTex, concreteTex, signMat, mat, rng, hash } from './kit'
import { plant } from './props'
import { buildOffice, type OfficeRig } from './office'
import type { TownBranch } from './types'

export type Pulse = { m: THREE.MeshStandardMaterial; day: number; night: number }
export interface BranchBuilding {
  group: THREE.Group; office: OfficeRig; officeGroup: THREE.Group
  terrace: THREE.Group; outside: { pos: THREE.Vector3; target: THREE.Vector3 }; pulses: Pulse[]
}

export const FLOOR = [0, 4.4, 8.4, 12.4]
const W = 30, D = 16
const plasterMat = (hex: string, w: number, h: number) => mat(`pl${hex}|${w}|${h}`, () => texMat(plasterTex(hex, Math.max(1, w / 4), Math.max(1, h / 4)), 0.92))
const alu = () => std(0x30343b, 0.35, 0.8)
const wall = (w: number, h: number, d: number, hex: string, x: number, y0: number, z: number) => slab(w, h, d, plasterMat(hex, Math.max(w, d), h), x, y0, z)

function signBoard(lines: string[], w: number, h: number, bg: string, fg: string, accent = '', px = 1024): { m: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const sm = signMat(lines, bg, fg, px, Math.round(px * h / w), accent, 0.9)
  return { m: mesh(bx(w, h, 0.14), sm, 0, 0, 0), mat: sm }
}

/** Aluminium-framed window with frosted glass and a sun-shade (chajja). */
function windowUnit(w: number, h: number, frosted = true): THREE.Group {
  const g = new THREE.Group(); const fr = alu()
  g.add(mesh(bx(w, h, 0.06), frosted ? mat('wfrost', () => new THREE.MeshPhysicalMaterial({ color: 0x9fb4c4, roughness: 0.25, metalness: 0.1, envMapIntensity: 1.4, clearcoat: 1 })) : glass(0x6b8ba3, 0.5), 0, 0, 0, false))
  for (const [px, py, sw, sh] of [[0, h / 2, w, 0.07], [0, -h / 2, w, 0.07], [-w / 2, 0, 0.07, h], [w / 2, 0, 0.07, h], [0, 0, 0.05, h]] as const) g.add(mesh(bx(sw, sh, 0.1), fr, px, py, 0.02))
  g.add(mesh(bx(w + 0.5, 0.1, 0.55), std(0xcfc9ba, 0.9), 0, h / 2 + 0.2, 0.25))
  return g
}

/** Ground-floor lighting shop interior: lit display wall and pendant lights, seen through the glass shopfront. */
function lightShop(x: number, w: number, seed: number, pulses: Pulse[]): THREE.Group {
  const g = new THREE.Group(); g.position.set(x, 0, 0); const r = rng(seed)
  g.add(mesh(bx(w - 0.4, 0.04, 8), std(0xe8dfd0, 0.35, 0.05, { envMapIntensity: 0.8 }), 0, 0.12, 3.4, false))
  const back = mesh(bx(w - 0.4, 3.6, 0.2), std(0xf2ede4, 0.8), 0, 2.0, -0.6); g.add(back)
  const warm = std(0xffe3a8, 0.5, 0, { emissive: 0xffd488, emissiveIntensity: 0.5 }) as THREE.MeshStandardMaterial; pulses.push({ m: warm, day: 0.5, night: 1.6 })
  for (let row = 0; row < 3; row++) { g.add(mesh(bx(w - 0.8, 0.05, 0.5), std(0xcfc7b8, 0.5), 0, 0.7 + row * 1.0, -0.3)); for (let i = 0; i < 9; i++) g.add(mesh(rb(0.45, 0.4, 0.3, 0.1), warm, -w / 2 + 1 + i * (w - 2) / 8, 0.95 + row * 1.0, -0.3, false)) }
  const cord = std(0x222226, 0.6)
  for (let i = 0; i < 12; i++) {
    const px = -w / 2 + 1 + r() * (w - 2), pz = 1 + r() * 5, len = 0.8 + r() * 1.6
    g.add(mesh(cyl(0.008, 0.008, len, 6), cord, px, 4.1 - len / 2, pz, false)); g.add(mesh(new THREE.SphereGeometry(0.16 + r() * 0.1, 16, 12), warm, px, 4.1 - len, pz, false))
  }
  for (let k = 0; k < 2; k++) {
    const cx = -w / 4 + k * (w / 2), cz = 2.4 + k * 1.5
    g.add(mesh(cyl(0.012, 0.012, 1.1, 6), cord, cx, 3.55, cz, false)); g.add(mesh(cyl(0.45, 0.45, 0.04, 20), std(0xc9a85b, 0.3, 0.9), cx, 3.0, cz))
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(mesh(new THREE.SphereGeometry(0.09, 12, 8), warm, cx + Math.cos(a) * 0.45, 3.1, cz + Math.sin(a) * 0.45, false)) }
  }
  g.add(mesh(bx(2.4, 0.9, 0.7), std(0x6b4a2f, 0.5), -w / 4, 0.57, 3.5)); g.add(mesh(bx(2.4, 0.9, 0.7), std(0x6b4a2f, 0.5), w / 4, 0.57, 3.5))
  return g
}

export function buildBranchBuilding(b: TownBranch): BranchBuilding {
  const g = new THREE.Group(); const pulses: Pulse[] = []; const hex = '#ece6d6'
  const pk = { kind: 'branch', id: b.branchId, title: b.name, sub: `${b.staff.length} staff · ${b.guarantors.length} guarantors` }
  g.userData.pick = pk

  // Shell: back/side walls, floor slabs, columns
  g.add(wall(W, FLOOR[3], 0.4, hex, 0, 0, -D / 2 + 0.2)); g.add(wall(0.4, FLOOR[3], D, hex, -W / 2 + 0.2, 0, 0)); g.add(wall(0.4, FLOOR[3], D, hex, W / 2 - 0.2, 0, 0))
  g.add(slab(W, 0.2, D, std(0x8f9296, 0.9), 0, 0, 0))
  for (const y of [FLOOR[1], FLOOR[2]]) g.add(slab(W, 0.32, D, texMat(concreteTex(6, 3), 0.9), 0, y - 0.32, 0))
  for (const x of [-14.6, -1.5, 1.5, 14.6]) g.add(wall(0.8, FLOOR[3], 0.9, hex, x, 0, 7.8))
  for (let f = 1; f <= 3; f++) g.add(slab(W + 0.2, 0.55, 0.34, std(0xdcd6c6, 0.85), 0, FLOOR[f] - 0.55, 8.0))
  for (const x of [-14.8, -1.6, 1.6, 14.8]) g.add(mesh(cyl(0.05, 0.05, 11.6, 8), std(0x777b83, 0.5, 0.5), x + (x < 0 ? 0.5 : -0.5), 6.2, 8.15))

  // ---------------- Ground floor: two lighting shops + stair lobby ----------------
  const shops = [{ x: -8.2, name: ['SREE LIGHTS', '& ELECTRICALS'], bg: '#7a1d1d' }, { x: 8.2, name: ['HOME GLOW', 'DECOR LIGHTING'], bg: '#0e3b5c' }]
  shops.forEach((s, i) => {
    const gw = 12.2
    g.add(mesh(bx(gw, 3.1, 0.05), glass(0xcfe3ee, 0.12), s.x, 1.75, 7.72, false))
    for (let k = 0; k <= 6; k++) g.add(mesh(bx(0.07, 3.2, 0.1), alu(), s.x - gw / 2 + k * gw / 6, 1.75, 7.74))
    g.add(mesh(bx(gw, 0.08, 0.12), alu(), s.x, 0.2, 7.74)); g.add(mesh(bx(gw, 0.08, 0.12), alu(), s.x, 3.3, 7.74))
    g.add(mesh(bx(gw, 0.5, 0.2), std(0x5a5f68, 0.5, 0.5), s.x, 3.62, 7.8))
    const sb = signBoard(s.name, gw, 0.9, s.bg, '#ffffff', '', 1280); sb.m.position.set(s.x, 3.98, 8.06); g.add(sb.m); pulses.push({ m: sb.mat, day: 0.5, night: 1.6 })
    g.add(lightShop(s.x, gw, hash(b.branchId) + i, pulses))
    g.add(mesh(bx(1.2, 2.2, 0.04), glass(0xe8f1f5, 0.18), s.x + (i ? -3 : 3), 1.3, 7.74, false))
  })
  g.add(mesh(bx(2.4, 3.0, 0.06), glass(0xcfe3ee, 0.22), 0, 1.7, 7.72, false)); g.add(mesh(bx(0.05, 3.0, 0.1), alu(), 0, 1.7, 7.76)); g.add(mesh(bx(2.4, 0.07, 0.1), alu(), 0, 3.25, 7.76))
  g.add(mesh(bx(0.9, 0.5, 0.05), signMat(['2nd FLOOR', 'NGF HQ'], '#0b3d2a', '#ffffff', 256, 128, '', 0.6), 2.5, 1.5, 7.99, false))

  // ---------------- 1st floor: empty, frosted windows, TO LET ----------------
  const empty = (xc: number, yBase: number, w: number) => {
    g.add(wall(w, 4.0, 0.3, hex, xc, yBase, 7.9))
    for (const dx of [-w / 4, w / 4]) { const u = windowUnit(w / 2 - 1.4, 2.0); u.position.set(xc + dx, yBase + 2.1, 8.0); g.add(u) }
    g.add(mesh(bx(4.8, 1.0, 0.03), signMat(['TO LET'], '#ffffff', '#c0201c', 512, 128, '#c0201c', 0.15), xc, yBase + 0.55, 9.33, false))
  }
  empty(-8.2, FLOOR[1], 12.4); empty(8.2, FLOOR[1], 12.4)
  g.add(wall(2.9, 4.0, 0.3, hex, 0, FLOOR[1], 7.9)); { const u = windowUnit(0.8, 3.0); u.position.set(0, FLOOR[1] + 2.0, 8.0); g.add(u) }

  // ---------------- 2nd floor: NGF office (left) + empty (right) ----------------
  empty(8.2, FLOOR[2], 12.4)
  g.add(wall(2.9, 4.0, 0.3, hex, 0, FLOOR[2], 7.9)); { const u = windowUnit(0.8, 3.0); u.position.set(0, FLOOR[2] + 2.0, 8.0); g.add(u) }
  const office = buildOffice(b); const og = office.group; og.position.set(-8.2, FLOOR[2], 0); g.add(og)
  const fasciaSign = signBoard([b.name.toUpperCase()], 9.6, 0.7, '#0f5132', '#ffffff', '#7bd389', 1536); fasciaSign.m.position.set(-8.2, FLOOR[2] + 3.72, 8.3); g.add(fasciaSign.m); pulses.push({ m: fasciaSign.mat, day: 0.6, night: 2.0 })
  const blade = new THREE.Group(); { const bm = signMat(['NGF', 'HQ'], '#0f5132', '#ffffff', 256, 512, '#7bd389', 0.9); pulses.push({ m: bm, day: 0.6, night: 2.0 })
    const bm2 = bm; const mats: THREE.Material[] = [bm2, bm2, std(0x0f5132, 0.5), std(0x0f5132, 0.5), std(0x0f5132, 0.5), std(0x0f5132, 0.5)]
    const bl = new THREE.Mesh(bx(0.14, 2.2, 0.9), mats); bl.castShadow = true; bl.position.set(-14.95, FLOOR[2] + 1.6, 8.9); blade.add(bl) }
  g.add(blade)

  // Balconies with glass railings (floors 1 and 2)
  for (const f of [1, 2]) {
    g.add(slab(W - 0.2, 0.22, 1.35, texMat(concreteTex(6, 1), 0.9), 0, FLOOR[f] - 0.22, 8.65))
    g.add(mesh(bx(W - 0.4, 1.0, 0.03), glass(0xdfeef5, 0.2), 0, FLOOR[f] + 0.5, 9.3, false)); g.add(mesh(bx(W - 0.4, 0.06, 0.08), std(0xc9ccd2, 0.2, 0.95), 0, FLOOR[f] + 1.02, 9.3))
    for (let x = -14.6; x <= 14.7; x += 3) g.add(mesh(bx(0.06, 1.0, 0.06), std(0xc9ccd2, 0.2, 0.95), x, FLOOR[f] + 0.5, 9.3))
  }

  // ---------------- Terrace ----------------
  const top = FLOOR[3]
  const terrace = new THREE.Group(); g.add(terrace)
  terrace.add(slab(W, 0.32, D, texMat(concreteTex(6, 3), 0.9), 0, top - 0.32, 0))
  terrace.add(slab(W, 1.1, 0.25, plasterMat(hex, W, 1.1), 0, top, 7.9)); terrace.add(slab(W, 1.1, 0.25, plasterMat(hex, W, 1.1), 0, top, -7.9)); terrace.add(slab(0.25, 1.1, D, plasterMat(hex, D, 1.1), -14.9, top, 0)); terrace.add(slab(0.25, 1.1, D, plasterMat(hex, D, 1.1), 14.9, top, 0))
  terrace.add(slab(W + 0.3, 0.1, 0.4, std(0xb9b3a4, 0.85), 0, top + 1.1, 7.9))
  terrace.add(slab(3.6, 2.6, 3.4, plasterMat(hex, 3.6, 2.6), 0, top, 2.0)); terrace.add(mesh(bx(0.9, 2.0, 0.04), std(0x5a3d26, 0.6), 0, top + 1.0, 3.72))
  for (const x of [-9.5, -6.8]) { terrace.add(mesh(cyl(1.0, 1.0, 1.6, 28), std(0x111214, 0.5), x, top + 1.95, -2.5)); terrace.add(slab(2.4, 1.0, 2.4, texMat(concreteTex(2, 1), 0.9), x, top, -2.5)) }
  for (const x of [6, 9, 12]) { terrace.add(mesh(rb(0.9, 0.7, 0.4, 0.05), std(0xe9ebee, 0.5), x, top + 0.55, -6.9)); terrace.add(mesh(cyl(0.28, 0.28, 0.04, 20), std(0x555a63, 0.4, 0.5), x, top + 0.58, -6.7)) }
  terrace.add(mesh(cyl(0.04, 0.04, 6, 8), std(0x777b83, 0.5, 0.5), 11, top + 3.3, 3)); for (const dy of [0, 0.7, 1.4]) terrace.add(mesh(bx(1.6 - dy * 0.4, 0.04, 0.04), std(0x777b83, 0.5, 0.5), 11, top + 4.4 + dy, 3))
  { const p1 = plant(1.2, 0x8a8d93); p1.position.set(-13, top, 5.5); terrace.add(p1) }

  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return { group: g, office, officeGroup: og, terrace, outside: { pos: new THREE.Vector3(-3.0, 19.5, 37), target: new THREE.Vector3(-8, 8.6, 8) }, pulses }
}

const SHOPS = ['PHARMACY', 'TEXTILES', 'BAKERY & SWEETS', 'MOBILE POINT', 'SUPERMARKET', 'STATIONERY', 'HARDWARE', 'FOOTWEAR', 'OPTICALS', 'GOLD & JEWELLERY', 'FURNITURE', 'LADIES CORNER']
export function buildFiller(seed: number): { group: THREE.Group; pulses: Pulse[] } {
  const r = rng(seed * 7919 + 13); const g = new THREE.Group(); const pulses: Pulse[] = []
  const floors = 3 + Math.floor(r() * 3), fh = 4.0, w = 24 + Math.floor(r() * 7), d = 14
  const palette = ['#e6dcc4', '#d9e1d6', '#e8d3c1', '#d4dce6', '#ece3d0', '#cfd6c9', '#e7cfc4']
  const hex = palette[Math.floor(r() * palette.length)]
  const H = floors * fh + 0.4
  g.add(wall(w, H, 0.4, hex, 0, 0, -d / 2 + 0.2)); g.add(wall(0.4, H, d, hex, -w / 2 + 0.2, 0, 0)); g.add(wall(0.4, H, d, hex, w / 2 - 0.2, 0, 0))
  g.add(wall(w, H, 0.4, hex, 0, 0, 7.8))
  g.add(slab(w + 0.2, 0.4, d + 0.2, texMat(concreteTex(4, 2), 0.9), 0, H, 0)); g.add(slab(w + 0.3, 0.9, 0.25, plasterMat(hex, w, 0.9), 0, H + 0.4, 7.95))
  for (let f = 1; f < floors; f++) {
    g.add(slab(w + 0.3, 0.28, 0.5, std(0xd7d1c2, 0.85), 0, f * fh + 0.4 - 0.28, 8.05))
    const n = Math.floor(w / 5)
    for (let i = 0; i < n; i++) { const u = windowUnit(2.2, 1.9, r() > 0.25); u.position.set(-w / 2 + (i + 0.5) * (w / n), f * fh + 2.0, 8.02); g.add(u) }
  }
  const sn = SHOPS[Math.floor(r() * SHOPS.length)], sn2 = SHOPS[Math.floor(r() * SHOPS.length)]
  const cols = ['#7a1d1d', '#0e3b5c', '#14532d', '#4a2c6b', '#8a4b0f', '#1f2937']
  ;[[-w / 4, sn], [w / 4, sn2]].forEach(([x, name], i) => {
    const gw = w / 2 - 1
    g.add(mesh(bx(gw, 2.9, 0.05), glass(0xcfe3ee, 0.14), x as number, 1.65, 7.72, false)); g.add(mesh(bx(gw, 0.07, 0.1), alu(), x as number, 3.15, 7.76)); g.add(mesh(bx(gw, 0.07, 0.1), alu(), x as number, 0.2, 7.76))
    for (let k = 0; k <= 4; k++) g.add(mesh(bx(0.06, 3.0, 0.1), alu(), (x as number) - gw / 2 + k * gw / 4, 1.65, 7.76))
    const sb = signBoard([name as string], gw, 0.8, cols[Math.floor(r() * cols.length)], '#ffffff', '', 1024); sb.m.position.set(x as number, 3.7, 8.05); g.add(sb.m); pulses.push({ m: sb.mat, day: 0.4, night: 1.5 })
    const inner = new THREE.MeshStandardMaterial({ color: 0xf3e6c4, emissive: 0xffd9a0, emissiveIntensity: 0.3 }); pulses.push({ m: inner, day: 0.3, night: 1.2 })
    g.add(mesh(bx(gw - 0.4, 0.04, 6), std(0xe3dccb, 0.4), x as number, 0.12, 4.5, false)); g.add(mesh(bx(gw - 0.4, 2.8, 0.1), inner, x as number, 1.6, 1.6, false))
    void i
  })
  g.add(slab(2.6, 1.0, 2.6, std(0x8f9296, 0.9), (r() - 0.5) * (w - 6), H + 0.4, -2)); g.add(mesh(cyl(0.9, 0.9, 1.4, 24), std(0x16181c, 0.5), (r() - 0.5) * (w - 8), H + 1.7, -3.5))
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return { group: g, pulses }
}
