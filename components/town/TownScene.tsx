'use client'

// 3D "Branch Town" (admin only). Each branch is an office in a small town. Click an office to open its roof and see the cabins.
// Guarantors and agents are out in the town. Motion is illustrative; only the LIVE ring reflects real agent tracking.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface TownPerson { userId: string; name: string; roleInBranch: string }
export interface TownGuarantor { guarantorId: string; name: string; code: string }
export interface TownBranch {
  branchId: string; name: string; status: string
  staff: TownPerson[]; guarantors: TownGuarantor[]
}
export interface TownHover { kind: 'branch' | 'person' | 'agent' | 'guarantor'; title: string; sub: string; x: number; y: number }

interface Props {
  branches: TownBranch[]
  liveAgentIds: Set<string>
  selectedId: string | null
  night: boolean
  resetKey: number
  onSelect: (branchId: string | null) => void
  onHover: (h: TownHover | null) => void
}

// Palette: black, white, green, blue
const C = {
  ground: 0xf8fafc, road: 0x1b1f2a, line: 0xf5f7fa, grass: 0xcfe9d6, tree: 0x1f9d55, trunk: 0x3b3b3b,
  white: 0xffffff, black: 0x10131a, blue: 0x1d4ed8, sky: 0x38bdf8, green: 0x16a34a, glass: 0xbfdbfe,
}
const ROLE_COLOR: Record<string, number> = {
  manager: 0x1d4ed8, assistant_manager: 0x38bdf8, accountant: 0x16a34a, cashier: 0x10131a,
}
const ROLE_LABEL: Record<string, string> = {
  manager: 'Manager', assistant_manager: 'Assistant Manager', accountant: 'Accountant', cashier: 'Cashier',
}
const SPACING = 40

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function rng(seed: number) { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh
}

function label(text: string, opts: { bg?: string; fg?: string; scale?: number } = {}): THREE.Sprite {
  const cv = document.createElement('canvas'); const ctx = cv.getContext('2d')!
  const font = '600 34px Inter, system-ui, sans-serif'
  ctx.font = font; const w = Math.ceil(ctx.measureText(text).width) + 44; cv.width = w; cv.height = 64
  ctx.font = font; ctx.fillStyle = opts.bg || 'rgba(16,19,26,0.82)'
  ctx.beginPath(); ctx.roundRect(0, 4, w, 56, 28); ctx.fill()
  ctx.fillStyle = opts.fg || '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 22, 33)
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  const s = opts.scale ?? 0.02; sp.scale.set(w * s, 64 * s, 1); sp.renderOrder = 10; return sp
}

function person(color: number, scale = 1) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.95, 12), mat(color)); body.position.y = 0.48; body.castShadow = true
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), mat(0xf1d5bf)); head.position.y = 1.2; head.castShadow = true
  g.add(body, head); g.scale.setScalar(scale); return g
}

function scooter(color: number) {
  const g = new THREE.Group()
  g.add(box(1.5, 0.35, 0.5, mat(C.black), 0, 0.3, 0))
  const wm = mat(0x222222)
  for (const x of [-0.6, 0.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), wm); w.rotation.x = Math.PI / 2; w.position.set(x, 0.3, 0); g.add(w) }
  g.add(box(0.5, 0.5, 0.5, mat(C.blue), -0.2, 0.55, 0))
  const rider = person(color, 0.8); rider.position.set(-0.1, 0.6, 0); g.add(rider)
  return g
}

function tree(x: number, z: number, s = 1) {
  const g = new THREE.Group()
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1 * s, 8), mat(C.trunk)); t.position.y = 0.5 * s; t.castShadow = true
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.9 * s, 14, 12), mat(C.tree)); c.position.y = 1.5 * s; c.castShadow = true
  g.add(t, c); g.position.set(x, 0, z); return g
}

function house(w: number, d: number, roof: number) {
  const g = new THREE.Group()
  g.add(box(w, 1.6, d, mat(C.white)))
  const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.1, 4), mat(roof)); r.rotation.y = Math.PI / 4; r.position.y = 1.6 + 0.55; r.castShadow = true; g.add(r)
  g.add(box(0.5, 0.9, 0.06, mat(C.black), 0, 0, d / 2 + 0.01))
  return g
}

interface Walker { obj: THREE.Object3D; pts: THREE.Vector3[]; seg: number[]; len: number; speed: number; t: number; face: boolean }
function makeWalker(obj: THREE.Object3D, pts: THREE.Vector3[], speed: number, t0: number, face: boolean): Walker {
  const seg: number[] = []; let len = 0
  for (let i = 0; i < pts.length; i++) { const d = pts[i].distanceTo(pts[(i + 1) % pts.length]); seg.push(d); len += d }
  return { obj, pts, seg, len, speed, t: t0 * len, face }
}
function stepWalker(w: Walker, dt: number) {
  w.t = (w.t + w.speed * dt) % w.len
  let d = w.t, i = 0
  while (d > w.seg[i]) { d -= w.seg[i]; i = (i + 1) % w.pts.length }
  const a = w.pts[i], b = w.pts[(i + 1) % w.pts.length]
  const f = w.seg[i] ? d / w.seg[i] : 0
  w.obj.position.lerpVectors(a, b, f)
  if (w.face) w.obj.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x)
}

interface Office { id: string; group: THREE.Group; roof: THREE.Group; cabinLabels: THREE.Group; center: THREE.Vector3; roofY: number; roofTarget: number; glowMats: THREE.MeshStandardMaterial[] }

export default function TownScene({ branches, liveAgentIds, selectedId, night, resetKey, onSelect, onHover }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const api = useRef<{ select: (id: string | null) => void; setNight: (n: boolean) => void; reset: () => void } | null>(null)
  const cb = useRef({ onSelect, onHover }); cb.current = { onSelect, onHover }
  const latest = useRef({ selectedId, night }); latest.current = { selectedId, night }

  const dataKey = JSON.stringify(branches.map(b => [b.branchId, b.name, b.status, b.staff.map(s => [s.userId, s.roleInBranch, s.name]), b.guarantors.map(g => g.guarantorId)])) + [...liveAgentIds].sort().join(',')

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    const small = window.innerWidth < 768
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2))
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'; renderer.domElement.style.touchAction = 'none'

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI / 2.15; controls.minDistance = 8; controls.maxDistance = 220

    const amb = new THREE.HemisphereLight(0xffffff, 0xcdd6e0, 0.9); scene.add(amb)
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun, sun.target)

    const n = Math.max(branches.length, 1)
    const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n / cols)
    const townW = cols * SPACING, townD = rows * SPACING
    const cx = 0, cz = 0
    const originX = -townW / 2 + SPACING / 2, originZ = -townD / 2 + SPACING / 2

    sun.position.set(80, 120, 60); sun.shadow.camera.left = -townW; sun.shadow.camera.right = townW; sun.shadow.camera.top = townD; sun.shadow.camera.bottom = -townD; sun.shadow.camera.far = 400

    // Ground and roads
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(townW + 90, townD + 90), mat(C.grass)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(townW + 6, townD + 6), mat(C.ground)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; pad.receiveShadow = true; scene.add(pad)
    for (let c = 0; c <= cols; c++) { const r = box(4.4, 0.06, townD + 6, mat(C.road), -townW / 2 + c * SPACING, 0.02, 0); r.castShadow = false; scene.add(r) }
    for (let r = 0; r <= rows; r++) { const m = box(townW + 6, 0.06, 4.4, mat(C.road), 0, 0.02, -townD / 2 + r * SPACING); m.castShadow = false; scene.add(m) }
    for (let c = 0; c <= cols; c++) for (let k = -townD / 2; k < townD / 2; k += 4) { const l = box(0.2, 0.02, 1.6, mat(C.line), -townW / 2 + c * SPACING, 0.09, k + 1); l.castShadow = false; scene.add(l) }
    for (let r = 0; r <= rows; r++) for (let k = -townW / 2; k < townW / 2; k += 4) { const l = box(1.6, 0.02, 0.2, mat(C.line), k + 1, 0.09, -townD / 2 + r * SPACING); l.castShadow = false; scene.add(l) }

    const lamps: THREE.PointLight[] = []
    const offices: Office[] = []; const walkers: Walker[] = []; const pickables: THREE.Object3D[] = []; const rings: THREE.Mesh[] = []
    const allGlow: THREE.MeshStandardMaterial[] = []

    branches.forEach((b, idx) => {
      const px = originX + (idx % cols) * SPACING, pz = originZ + Math.floor(idx / cols) * SPACING
      const rand = rng(hash(b.branchId))
      const og = new THREE.Group(); og.position.set(px, 0, pz); scene.add(og)
      og.userData.pick = { kind: 'branch', id: b.branchId, title: b.name, sub: `${b.staff.length} staff · ${b.guarantors.length} guarantors` }

      // Office shell: slab, glass walls, partitions
      og.add(box(17, 0.3, 13, mat(C.white), 0, 0, 0))
      const glass = new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1 })
      og.add(box(15, 3, 0.15, glass, 0, 0.3, -5), box(0.15, 3, 10, glass, -7.5, 0.3, 0), box(0.15, 3, 10, glass, 7.5, 0.3, 0))
      og.add(box(5, 3, 0.15, glass, -5, 0.3, 5), box(5, 3, 0.15, glass, 5, 0.3, 5))
      og.add(box(0.1, 3, 4.6, glass, -2.5, 0.3, -2.7), box(0.1, 3, 4.6, glass, 2.5, 0.3, -2.7))
      og.add(box(15, 3, 0.1, glass, 0, 0.3, -0.4))
      // door
      og.add(box(3.4, 2.4, 0.12, mat(C.blue, { transparent: true, opacity: 0.45 }), 0, 0.3, 5))

      // Cabins (back row): assistant manager | manager | accountant ; front row: cashier counter
      const byRole = (r: string) => b.staff.filter(s => s.roleInBranch === r)
      const cabins: Array<{ role: string; x: number; z: number }> = [
        { role: 'assistant_manager', x: -5, z: -2.8 }, { role: 'manager', x: 0, z: -2.8 }, { role: 'accountant', x: 5, z: -2.8 },
      ]
      const cabinLabels = new THREE.Group(); cabinLabels.visible = false; og.add(cabinLabels)
      const glowMats: THREE.MeshStandardMaterial[] = []
      const addPeople = (role: string, x: number, z: number, spread: number, faceZ = 1) => {
        const list = byRole(role).slice(0, 3)
        const desk = box(spread > 0 ? 3.2 : 2.4, 0.8, 1, mat(0x2b303b), x, 0.3, z - 0.2 * faceZ); og.add(desk)
        const pc = box(0.8, 0.5, 0.06, mat(C.black), x, 1.1, z - 0.35 * faceZ); og.add(pc)
        if (list.length === 0) {
          const l = label(`${ROLE_LABEL[role]} · vacant`, { bg: 'rgba(100,116,139,0.85)', scale: 0.011 }); l.position.set(x, 3.0, z); cabinLabels.add(l)
        }
        list.forEach((s, i) => {
          const p = person(ROLE_COLOR[role] ?? C.black); const off = (i - (list.length - 1) / 2) * 1.0
          p.position.set(x + off, 0.3, z + 0.9 * faceZ); p.userData.pick = { kind: 'person', title: s.name, sub: ROLE_LABEL[role] }; og.add(p); pickables.push(p)
          const l = label(`${s.name.split(' ')[0]} · ${ROLE_LABEL[role]}`, { scale: 0.011 }); l.position.set(x + off, 2.9 + i * 0.001, z + 0.9 * faceZ); cabinLabels.add(l)
        })
      }
      cabins.forEach(c => addPeople(c.role, c.x, c.z, 0))
      // Cashier counter
      og.add(box(8, 0.9, 1.1, mat(C.blue), 0, 0.3, 2.3))
      addPeople('cashier', 0, 3.7, 1, -1)
      // sofa for the hall
      og.add(box(3, 0.6, 1, mat(0x334155), -5, 0.3, 3.6), box(3, 0.6, 1, mat(0x334155), 5, 0.3, 3.6))

      const lamp = new THREE.PointLight(0xffe8b0, 0, 40, 1.6); lamp.position.set(0, 5, 0); og.add(lamp); lamps.push(lamp)

      // Roof (lifts off on select)
      const roof = new THREE.Group(); roof.position.set(0, 3.4, 0)
      roof.add(box(17.6, 0.5, 13.6, mat(C.black), 0, 0, 0))
      roof.add(box(17.6, 0.2, 13.6, mat(C.green), 0, 0.5, 0))
      const sign = label(b.name.toUpperCase(), { bg: 'rgba(22,163,74,0.95)', scale: 0.026 }); sign.position.set(0, 3.2, 5.5); roof.add(sign)
      const flag = box(0.12, 2.6, 0.12, mat(C.black), -7.5, 0.7, 5.5); roof.add(flag)
      const winMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0xfde68a, emissiveIntensity: 0, roughness: 0.3 })
      glowMats.push(winMat); allGlow.push(winMat)
      for (const x of [-6, -2, 2, 6]) roof.add(box(2, 0.9, 0.1, winMat, x, 0.9, 6.9))
      og.add(roof)

      // Surroundings: houses (customer homes), trees
      const houseSpots: THREE.Vector3[] = []
      const roofColors = [C.blue, C.green, 0x0f172a, C.sky]
      for (let h = 0; h < 7; h++) {
        const ang = (h / 7) * Math.PI * 2 + rand() * 0.4
        const rr = 13.5 + rand() * 2
        const hx = Math.cos(ang) * rr * 1.05, hz = Math.sin(ang) * rr * 0.95
        if (Math.abs(hx) > 16.5 || Math.abs(hz) > 16.5) continue
        const hs = house(2.4 + rand(), 2.2 + rand() * 0.6, roofColors[h % 4]); hs.position.set(hx, 0, hz); hs.rotation.y = Math.atan2(-hx, -hz) + Math.PI; og.add(hs)
        houseSpots.push(new THREE.Vector3(px + hx * 0.86, 0.3, pz + hz * 0.86))
      }
      for (let t = 0; t < 8; t++) { const tx = (rand() - 0.5) * 34, tz = (rand() - 0.5) * 34; if (Math.abs(tx) < 10 && Math.abs(tz) < 8.5) continue; og.add(tree(tx, tz, 0.8 + rand() * 0.5)) }

      // Agents (scooters out on the roads) and guarantors (walking between houses)
      const door = new THREE.Vector3(px, 0.1, pz + 7.6)
      const agents = b.staff.filter(s => s.roleInBranch === 'collection_agent')
      agents.forEach((a, i) => {
        const live = liveAgentIds.has(a.userId)
        const s = scooter(live ? C.green : 0x94a3b8); s.userData.pick = { kind: 'agent', title: a.name, sub: live ? 'Collection agent · LIVE tracking' : 'Collection agent' }
        scene.add(s); pickables.push(s)
        const hA = houseSpots[(i * 2) % Math.max(houseSpots.length, 1)] || door, hB = houseSpots[(i * 2 + 3) % Math.max(houseSpots.length, 1)] || door
        const road = new THREE.Vector3(px + 11, 0.1, pz + 8 - i), road2 = new THREE.Vector3(px - 11, 0.1, pz + 8 - i)
        walkers.push(makeWalker(s, [door, road, hA.clone().setY(0.1), road, door, road2, hB.clone().setY(0.1), road2], 3.4 + i * 0.3, rand(), true))
        if (live) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; s.add(ring); rings.push(ring); ring.position.y = 0.1 }
      })
      b.guarantors.slice(0, 12).forEach((g, i) => {
        const p = person(C.green, 0.95); p.userData.pick = { kind: 'guarantor', title: g.name, sub: `Guarantor ${g.code} · field work` }
        scene.add(p); pickables.push(p)
        const base = houseSpots[(i + 1) % Math.max(houseSpots.length, 1)] || door
        const away = base.clone().add(new THREE.Vector3((rand() - 0.5) * 6, 0, (rand() - 0.5) * 6))
        walkers.push(makeWalker(p, [base.clone().setY(0.1), away.setY(0.1)], 0.7 + rand() * 0.4, rand(), true))
      })

      pickables.push(og)
      offices.push({ id: b.branchId, group: og, roof, cabinLabels, center: new THREE.Vector3(px, 0, pz), roofY: 3.4, roofTarget: 3.4, glowMats })
    })

    // Camera framing
    const overview = { pos: new THREE.Vector3(cx + townW * 0.35 + 16, Math.max(townW, townD) * 0.45 + 16, cz + townD * 0.35 + 26), target: new THREE.Vector3(cx, 0, cz) }
    camera.position.copy(overview.pos); controls.target.copy(overview.target)
    let focus: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
    controls.addEventListener('start', () => { focus = null })

    const applySelection = (id: string | null) => {
      offices.forEach(o => { o.roofTarget = o.id === id ? 3.4 + 40 : 3.4; o.cabinLabels.visible = o.id === id })
      if (id) { const o = offices.find(x => x.id === id); if (o) focus = { pos: o.center.clone().add(new THREE.Vector3(10, 17, 20)), target: o.center.clone().add(new THREE.Vector3(0, 0.5, 0)) } }
      else focus = { pos: overview.pos.clone(), target: overview.target.clone() }
    }
    const applyNight = (nt: boolean) => {
      scene.background = new THREE.Color(nt ? 0x0b1020 : 0xdbeafe); scene.fog = new THREE.Fog(nt ? 0x0b1020 : 0xdbeafe, 120, 330)
      amb.intensity = nt ? 0.35 : 0.9; sun.intensity = nt ? 0.25 : 1.4; sun.color.set(nt ? 0x93c5fd : 0xffffff)
      allGlow.forEach(m => { m.emissiveIntensity = nt ? 1.4 : 0 }); lamps.forEach(l => { l.intensity = nt ? 90 : 0 })
    }
    applyNight(latest.current.night); applySelection(latest.current.selectedId)
    api.current = { select: applySelection, setNight: applyNight, reset: () => applySelection(null) }

    // Hover + click
    const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let downAt = { x: 0, y: 0 }
    const pickAt = (clientX: number, clientY: number) => {
      const r = renderer.domElement.getBoundingClientRect()
      mouse.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera)
      const hits = ray.intersectObjects(pickables, true)
      for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.pick) return o.userData.pick as { kind: TownHover['kind']; id?: string; title: string; sub: string }; o = o.parent } }
      return null
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const p = pickAt(e.clientX, e.clientY); renderer.domElement.style.cursor = p ? 'pointer' : 'grab'
      const r = mount.getBoundingClientRect(); cb.current.onHover(p ? { kind: p.kind, title: p.title, sub: p.sub, x: e.clientX - r.left, y: e.clientY - r.top } : null)
    }
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
      const p = pickAt(e.clientX, e.clientY)
      if (p?.kind === 'branch' && p.id) cb.current.onSelect(p.id)
    }
    renderer.domElement.addEventListener('pointermove', onMove); renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointerleave', () => cb.current.onHover(null))

    const resize = () => { const w = mount.clientWidth, h = mount.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(resize); ro.observe(mount); resize()

    const clock = new THREE.Clock(); let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
      walkers.forEach(w => stepWalker(w, dt))
      offices.forEach(o => { o.roof.position.y += (o.roofTarget - o.roof.position.y) * Math.min(1, dt * 4); o.roof.visible = o.roof.position.y < o.roofY + 25 })
      rings.forEach((r, i) => { const s = 1 + 0.25 * Math.sin(t * 3 + i); r.scale.set(s, s, s) })
      if (focus) { camera.position.lerp(focus.pos, Math.min(1, dt * 3)); controls.target.lerp(focus.target, Math.min(1, dt * 3)); if (camera.position.distanceTo(focus.pos) < 0.2) focus = null }
      controls.update(); renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); api.current = null
      scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mm = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach(x => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose() }) })
      renderer.dispose(); renderer.domElement.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  useEffect(() => { api.current?.select(selectedId) }, [selectedId])
  useEffect(() => { api.current?.setNight(night) }, [night])
  useEffect(() => { if (resetKey) api.current?.reset() }, [resetKey])

  return <div ref={mountRef} className="absolute inset-0" />
}
