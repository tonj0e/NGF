// The NGF branch office (third floor, left section). Origin = floor level, centre of the section.
// Interior x in [-6.5, 6.5], z in [-7.7, 7.5] (front glass at z = 7.6, facing +z). Layout from the door:
// waiting sofas left/right with plants, cash counter, glass section (accountants + assistant manager), manager's cabin on the right.
import * as THREE from 'three'
import { bx, rb, cyl, mesh, slab, std, glow, glass, texMat, tileTex, woodTex, plasterTex, signMat, labelSprite, mat } from './kit'
import { human, sofa, plant, officeChair, deskSet, carpet } from './props'
import type { TownBranch, OfficeViewKey } from './types'

export interface OfficeRig {
  group: THREE.Group
  ceiling: THREE.Object3D
  labels: THREE.Group
  views: Record<Exclude<OfficeViewKey, 'outside'>, { pos: THREE.Vector3; target: THREE.Vector3 }>
  cams: THREE.Object3D[]
  glowMats: THREE.MeshStandardMaterial[]
  lights: THREE.PointLight[]
}

const ROLE_LABEL: Record<string, string> = { manager: 'Manager', assistant_manager: 'Assistant Manager', accountant: 'Accountant', cashier: 'Cashier' }
const SKIN = [0xe0b48f, 0xc68d65, 0xa8714a, 0x8d5a3b]

export function buildOffice(b: TownBranch): OfficeRig {
  const g = new THREE.Group()
  const glowMats: THREE.MeshStandardMaterial[] = []
  const lights: THREE.PointLight[] = []
  const labels = new THREE.Group(); labels.visible = false; g.add(labels)
  const wallM = texMat(plasterTex('#f4f1ea', 3, 1), 0.92)
  const alu = std(0x2b2f36, 0.35, 0.8)

  // Floor, walls, ceiling
  g.add(mesh(bx(13, 0.05, 15.4), texMat(tileTex(8, 9.5), 0.18, 0.05, { envMapIntensity: 0.9 }), 0, 0.025, -0.1, false))
  g.add(slab(13.2, 3.4, 0.2, wallM, 0, 0, -7.8)); g.add(slab(0.2, 3.4, 15.4, wallM, -6.6, 0, -0.1)); g.add(slab(0.2, 3.4, 15.4, wallM, 6.6, 0, -0.1))
  const ceiling = new THREE.Group(); g.add(ceiling)
  ceiling.add(mesh(bx(13, 0.14, 15.4), std(0xfafafa, 0.9), 0, 3.37, -0.1))
  const panelM = glow(0xfff4dc, 1); glowMats.push(panelM)
  for (let x = -4.5; x <= 4.6; x += 3) for (let z = -6; z <= 6.1; z += 3) ceiling.add(mesh(bx(0.7, 0.03, 0.7), panelM, x, 3.28, z, false))
  const coveM = glow(0xffe2a8, 0.8); glowMats.push(coveM)
  ceiling.add(mesh(bx(12.6, 0.04, 0.1), coveM, 0, 3.26, -7.55, false)); ceiling.add(mesh(bx(12.6, 0.04, 0.1), coveM, 0, 3.26, 7.3, false))
  ;[-4.5, 4.5].forEach(x => { for (const z of [-3.5, 3.5]) { const l = new THREE.PointLight(0xfff0d6, 0, 14, 1.7); l.position.set(x, 3.0, z); g.add(l); lights.push(l) } })

  // Storefront (glass, aluminium mullions, double door at x=0)
  g.add(mesh(bx(13, 3.2, 0.04), glass(0xcfe3ee, 0.14), 0, 1.65, 7.6, false))
  for (let x = -6.5; x <= 6.5; x += 1.625) if (Math.abs(x) > 0.3) g.add(mesh(bx(0.06, 3.3, 0.09), alu, x, 1.65, 7.6))
  g.add(mesh(bx(13, 0.08, 0.1), alu, 0, 0.04, 7.6)); g.add(mesh(bx(13, 0.1, 0.1), alu, 0, 3.3, 7.6)); g.add(mesh(bx(13, 0.06, 0.1), alu, 0, 2.55, 7.6))
  for (const s of [-1, 1]) { g.add(mesh(bx(0.05, 2.5, 0.09), alu, s * 0.05 + s * 0.5, 1.28, 7.62)); g.add(mesh(cyl(0.015, 0.015, 0.6, 8), std(0xcfd3d9, 0.2, 0.9), s * 0.12, 1.1, 7.7)) }
  g.add(mesh(bx(0.05, 2.5, 0.09), alu, 0, 1.28, 7.62)); g.add(mesh(bx(1.9, 0.05, 0.09), alu, 0, 2.5, 7.62))
  const mat1 = signMat(['WELCOME TO NGF'], '#0f5132', '#ffffff', 512, 128, '', 0.15); const dm = mesh(bx(1.4, 0.015, 0.7), mat1, 0, 0.055, 6.95, false); g.add(dm)

  // ----- Waiting area: sofas left/right, tables, plants -----
  const wm = texMat(woodTex(1, 1, '#7b5232'), 0.45)
  for (const sx of [-4.1, 4.1]) { const c = carpet(2.9, 3.2); c.position.set(sx, 0.05, 5.3); g.add(c) }
  const sofaL = sofa(2.5, 0x2f3b4c); sofaL.position.set(-5.35, 0.05, 5.3); sofaL.rotation.y = Math.PI / 2; g.add(sofaL)
  const sofaR = sofa(2.5, 0x2f3b4c); sofaR.position.set(5.35, 0.05, 5.3); sofaR.rotation.y = -Math.PI / 2; g.add(sofaR)
  for (const s of [-1, 1]) {
    g.add(mesh(cyl(0.42, 0.42, 0.05, 28), glass(0xe8f1f5, 0.5), s * 3.7, 0.42, 5.3)); g.add(mesh(cyl(0.05, 0.05, 0.4, 10), std(0xb9a27a, 0.3, 0.8), s * 3.7, 0.22, 5.3)); g.add(mesh(cyl(0.28, 0.28, 0.02, 24), std(0xb9a27a, 0.3, 0.8), s * 3.7, 0.06, 5.3))
    const sp = plant(0.9); sp.position.set(s * 3.7, 0.44, 5.3); sp.scale.setScalar(0.4); g.add(sp)
    const t1 = plant(1.7); t1.position.set(s * 6.0, 0.05, 7.0); g.add(t1)
    const t2 = plant(1.2); t2.position.set(s * 1.55, 0.05, 6.9); g.add(t2)
    const t3 = plant(1.5, 0x3a3f46); t3.position.set(s * 6.0, 0.05, 3.3); g.add(t3)
  }
  const tvM = glow(0x3b82f6, 0.7); glowMats.push(tvM)
  g.add(mesh(rb(0.06, 0.75, 1.3, 0.02), std(0x0c0d10, 0.3), -6.45, 2.3, 3.2)); g.add(mesh(bx(0.01, 0.65, 1.2), tvM, -6.41, 2.3, 3.2, false))
  g.add(mesh(bx(0.01, 0.34, 1.6), signMat(['PLEASE WAIT FOR YOUR TOKEN'], '#0f5132', '#ffffff', 1024, 192, '', 0.25), -6.49, 1.55, 3.2, false))

  // ----- Cash counter (left-middle) -----
  const cx = -3.9, cz = 0.8
  g.add(mesh(rb(4.4, 1.0, 0.95, 0.03), std(0x0f6b3b, 0.45), cx, 0.55, cz))
  g.add(mesh(bx(4.6, 0.05, 1.08), std(0xf5f5f2, 0.25, 0, { envMapIntensity: 1 }), cx, 1.05, cz))
  g.add(mesh(bx(4.4, 0.04, 0.05), std(0xe7c75a, 0.25, 0.9), cx, 0.18, cz + 0.49))
  g.add(mesh(bx(4.4, 0.85, 0.03), glass(0xd5e8f0, 0.3), cx, 1.5, cz + 0.4, false))
  for (const x of [-1.5, 0, 1.5]) g.add(mesh(bx(0.04, 0.85, 0.04), alu, cx + x, 1.5, cz + 0.4))
  for (const x of [-0.75, 0.75]) g.add(mesh(bx(0.5, 0.12, 0.05), std(0x101114, 0.5), cx + x, 1.14, cz + 0.4))
  for (const x of [-1.2, 1.2]) { g.add(mesh(rb(0.5, 0.3, 0.03, 0.01), std(0x101114, 0.3), cx + x, 1.28, cz - 0.1)); g.add(mesh(bx(0.46, 0.26, 0.005), glow(0x2a6df0, 0.5), cx + x, 1.28, cz - 0.115)) }
  g.add(mesh(rb(0.4, 0.22, 0.3, 0.04), std(0x2a2d33, 0.5), cx + 0.2, 1.18, cz - 0.15))
  g.add(mesh(bx(1.9, 2.2, 0.06), std(0x3a3f47, 0.5, 0.6), -4.2, 1.2, -7.68, false)); { const vd = mesh(cyl(0.8, 0.8, 0.1, 40), std(0xaeb4bd, 0.25, 0.95), -4.2, 1.2, -7.58); vd.rotation.x = Math.PI / 2; g.add(vd) }
  g.add(mesh(bx(0.5, 0.06, 0.06), std(0x7d838d, 0.3, 0.9), -4.2, 1.2, -7.5))
  g.add(mesh(bx(1.6, 0.2, 0.03), signMat(['STRONG ROOM'], '#222831', '#ffffff', 512, 96, '', 0.1), -4.2, 2.45, -7.68, false))
  for (const x of [-5.2, -2.6]) { g.add(mesh(cyl(0.2, 0.2, 0.02, 20), std(0xc9ccd2, 0.2, 0.95), x, 0.06, 3.1)); g.add(mesh(cyl(0.025, 0.025, 0.95, 10), std(0xc9ccd2, 0.2, 0.95), x, 0.55, 3.1)); g.add(mesh(sph0(), std(0xc9ccd2, 0.2, 0.95), x, 1.04, 3.1)) }
  g.add(mesh(bx(2.6, 0.03, 0.03), std(0x0f6b3b, 0.7), -3.9, 0.9, 3.1)); g.add(mesh(bx(2.6, 0.012, 0.18), signMat(['WAIT HERE'], '#e5b800', '#222222', 256, 64, '', 0), -3.9, 0.053, 3.5, false))
  g.add(mesh(bx(4.6, 1.15, 0.05), std(0x0f6b3b, 0.5), cx, 1.3, -7.65, false))
  // wall logo
  g.add(mesh(bx(4.2, 0.55, 0.03), signMat(['NGF FINCORP'], '#0f5132', '#ffffff', 1024, 140, '#7bd389', 0.5), 0.7, 3.0, -7.66, false))
  g.add(mesh(bx(2.8, 0.45, 0.03), signMat([b.name.toUpperCase()], '#0b1220', '#ffffff', 768, 120, '', 0.3), -2.4, 2.65, -7.66, false))

  // ----- Glass section: accountants + assistant manager -----
  const frost = mat('frost', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.6, side: THREE.DoubleSide, depthWrite: false }))
  const pane = glass(0xcfe3ee, 0.2)
  const gs = { x0: -1.0, x1: 3.2, z0: -7.4, z1: 2.0 }
  const glassWall = (x: number, z: number, w: number, d: number) => {
    g.add(mesh(bx(w, 2.6, d), pane, x, 1.35, z, false)); g.add(mesh(bx(w, 0.35, d + 0.01), frost, x, 1.4, z, false))
    g.add(mesh(bx(w, 0.05, d + 0.04), alu, x, 2.65, z)); g.add(mesh(bx(w, 0.06, d + 0.04), alu, x, 0.06, z))
  }
  glassWall(gs.x0, (gs.z0 + gs.z1) / 2, 0.03, gs.z1 - gs.z0); glassWall(gs.x1, (gs.z0 + gs.z1) / 2, 0.03, gs.z1 - gs.z0)
  glassWall((gs.x0 + 0.1) / 2 - 0.15, gs.z1, 1.2, 0.03); glassWall((gs.x1 + 1.0) / 2 + 0.2, gs.z1, 2.2, 0.03)
  for (const [x, z] of [[gs.x0, gs.z1], [gs.x1, gs.z1], [0.1, gs.z1], [0.9, gs.z1]] as const) g.add(mesh(bx(0.06, 2.65, 0.06), alu, x, 1.33, z))
  g.add(mesh(bx(0.8, 0.012, 0.01), glow(0xff3b30, 0), 0.5, 2.7, gs.z1, false))

  // ----- Manager cabin (right) -----
  const mc = { x0: 3.6, x1: 6.45, z0: -7.4, z1: 2.0 }
  glassWall(mc.x0, (mc.z0 + mc.z1) / 2, 0.03, mc.z1 - mc.z0); glassWall((mc.x0 + 4.3) / 2 - 0.2 + 0.2, mc.z1, 1.35, 0.03); glassWall(mc.x1 - 0.7, mc.z1, 1.2, 0.03)
  for (const x of [mc.x0, 4.3, 5.3, mc.x1 - 0.1]) g.add(mesh(bx(0.06, 2.65, 0.06), alu, x, 1.33, mc.z1))
  g.add(mesh(bx(0.05, 2.9, 9.3), texMat(woodTex(2, 3, '#8a5a35'), 0.4), 6.4, 1.5, -2.7))
  g.add(mesh(rb(1.9, 0.05, 1.0, 0.01), std(0x9b6a41, 0.35), 5.0, 0.78, -3.0)); g.add(mesh(rb(1.8, 0.7, 0.9, 0.03), texMat(woodTex(2, 1, '#6c4425'), 0.45), 5.0, 0.4, -3.0))
  g.add(mesh(bx(0.34, 0.07, 0.05), signMat(['MANAGER'], '#d4af37', '#2b2b2b', 256, 64, '', 0.1), 5.0, 0.84, -2.55, false))
  g.add(mesh(rb(0.62, 0.34, 0.03, 0.01), std(0x101114, 0.3), 5.35, 1.0, -3.15)); g.add(mesh(bx(0.58, 0.3, 0.005), glow(0x2a6df0, 0.5), 5.35, 1.0, -3.17, false))
  { const ch = officeChair(0x3b2a20); ch.position.set(5.0, 0.05, -4.1); ch.scale.setScalar(1.15); g.add(ch) }
  for (const x of [4.5, 5.5]) { const ch = officeChair(0x23272f); ch.position.set(x, 0.05, -1.7); ch.rotation.y = Math.PI; g.add(ch) }
  g.add(mesh(bx(0.4, 2.3, 3.4), texMat(woodTex(1, 2, '#5a3920'), 0.5), 6.2, 1.2, -5.3))
  for (let i = 0; i < 24; i++) g.add(mesh(bx(0.3, 0.3 + (i % 3) * 0.04, 0.07), std([0x7a1f1f, 0x1f3a7a, 0x2a5a30, 0x777777][i % 4], 0.8), 6.0, 0.55 + Math.floor(i / 8) * 0.6, -6.7 + (i % 8) * 0.38))
  { const p = plant(1.3); p.position.set(4.0, 0.05, 1.4); g.add(p) }
  g.add(mesh(bx(0.03, 0.55, 0.8), std(0x2a2118, 0.5), 4.2, 2.0, -7.55, false)); g.add(mesh(bx(0.005, 0.45, 0.7), signMat(['CERTIFICATE'], '#f4efe0', '#555555', 256, 128, '', 0.05), 4.2, 2.0, -7.53, false))

  // ----- Staff (from the CRM) -----
  const byRole = (r: string) => b.staff.filter(s => s.roleInBranch === r)
  const nm = (p: { name: string }) => p.name.split(' ')[0]
  const mk = (role: string, i: number, seated: boolean, pos: THREE.Vector3, shirt: number, extra: { tie?: number; female?: boolean } = {}) => {
    const ppl = byRole(role)[i]
    if (!ppl) { if (i === 0) { const l = labelSprite(`${ROLE_LABEL[role]} · vacant`, { bg: 'rgba(100,116,139,0.85)' }); l.position.set(pos.x, 1.9, pos.z); labels.add(l) } return }
    const h = human({ shirt, seated, skin: SKIN[(ppl.userId.length + i) % 4], ...extra }); h.position.copy(pos); g.add(h); h.userData.pick = { kind: 'person', title: ppl.name, sub: ROLE_LABEL[role] }
    const l = labelSprite(`${nm(ppl)} · ${ROLE_LABEL[role]}`); l.position.set(pos.x, 1.95, pos.z); labels.add(l)
  }
  const work = (x: number, z: number, wood = '#9a6a40') => { const d = deskSet(1.5, 0.75, { wood }); d.position.set(x, 0.05, z); d.rotation.y = Math.PI; g.add(d); const ch = officeChair(); ch.position.set(x, 0.05, z - 0.95); g.add(ch) }
  mk('manager', 0, true, new THREE.Vector3(5.0, 0.05, -3.95), 0x16233f, { tie: 0x7a1f1f })
  work(1.1, -5.6, '#7b5232'); mk('assistant_manager', 0, true, new THREE.Vector3(1.1, 0.05, -6.5), 0x2563eb, { tie: 0x0f5132 })
  g.add(mesh(bx(0.34, 0.07, 0.05), signMat(['ASST MANAGER'], '#d4af37', '#2b2b2b', 256, 64, '', 0.1), 1.1, 0.88, -5.2, false))
  ;[[0.1, -1.2], [2.2, -1.2], [0.1, -3.4], [2.2, -3.4]].forEach(([x, z], i) => { if (i >= Math.max(2, byRole('accountant').length)) return; work(x, z); mk('accountant', i, true, new THREE.Vector3(x, 0.05, z - 0.92), 0x15803d, { female: i % 2 === 1 }) })
  ;[0, 1].forEach(i => { if (i >= Math.max(1, byRole('cashier').length)) return; const x = cx + (i ? 1.2 : -1.2); const ch = officeChair(0x0f6b3b); ch.position.set(x, 0.05, cz - 0.95); g.add(ch); mk('cashier', i, true, new THREE.Vector3(x, 0.05, cz - 0.92), 0x1f2937, { female: i === 1 }) })
  for (const x of [-0.6]) { g.add(mesh(rb(0.5, 1.3, 0.45, 0.02), std(0x7d848f, 0.5, 0.5), x, 0.7, -7.0)) }

  // ----- CCTV domes (future camera feeds) + viewpoints -----
  const cams: THREE.Object3D[] = []
  const camPos: Array<[Exclude<OfficeViewKey, 'outside'>, number, number, number]> = [['overview', 5.9, 3.05, 7.0], ['reception', 0.2, 3.1, -0.6], ['counter', -0.6, 3.1, 4.2], ['glass', -0.6, 3.1, 3.4], ['manager', 3.9, 3.1, 3.2]]
  camPos.forEach(([k, x, y, z]) => {
    const d = new THREE.Group(); d.position.set(x, y, z)
    d.add(mesh(cyl(0.09, 0.11, 0.06, 18), std(0xf1f3f5, 0.4), 0, 0.05, 0)); d.add(mesh(new THREE.SphereGeometry(0.09, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1a1d22, 0.1, 0.4), 0, 0.03, 0).rotateX(Math.PI))
    const led = mesh(bx(0.02, 0.02, 0.02), glow(0xff2a2a, 1.5), 0.07, 0.02, 0.05, false); led.name = 'led'; d.add(led)
    d.userData.pick = { kind: 'camera', view: k, title: `Camera · ${k}`, sub: 'Click to look through' }; g.add(d); cams.push(d)
  })
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const views: OfficeRig['views'] = {
    overview: { pos: V(6.2, 3.0, 7.2), target: V(-1.0, 0.5, -1.0) },
    reception: { pos: V(0.2, 2.95, -0.8), target: V(0, 0.8, 6.6) },
    counter: { pos: V(-0.4, 2.95, 4.6), target: V(-4.2, 0.9, 0.2) },
    glass: { pos: V(-0.6, 2.95, 3.6), target: V(1.4, 0.8, -3.8) },
    manager: { pos: V(4.0, 2.95, 3.4), target: V(5.1, 0.8, -3.6) },
    top: { pos: V(0, 15, 1.0), target: V(0, 0, 0.6) },
  }
  return { group: g, ceiling, labels, views, cams, glowMats, lights }
}

function sph0() { return new THREE.SphereGeometry(0.04, 12, 8) }
