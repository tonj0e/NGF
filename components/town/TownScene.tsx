'use client'

// 3D "Branch Town" (admin only): a Kerala-style road with an elevated six-lane deck (like the Aroor–Thuravoor NH 66 stretch),
// service roads, shops and offices. Each NGF branch is the left section of the top floor of a 4-storey building.
// Click a building to fly to its office; the camera buttons are the future CCTV viewpoints.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { bx, cyl, mesh, slab, std, glow, texMat, pavingTex, grassTex, concreteTex, roadTex, rng } from './kit'
import { car, autoRickshaw, bus, lorry, palm, tree, streetLight } from './props'
import { buildBranchBuilding, buildFiller, type Pulse, type BranchBuilding } from './building'
import type { TownBranch, TownHover, OfficeViewKey } from './types'
export type { TownBranch, TownHover }

interface Props {
  branches: TownBranch[]
  selectedId: string | null
  view: OfficeViewKey
  night: boolean
  resetKey: number
  onSelect: (branchId: string | null) => void
  onView: (v: OfficeViewKey) => void
  onHover: (h: TownHover | null) => void
}

const SPACING = 36
const Z = { nearFront: 8, serviceN: [11.5, 21.5], carrS: [21.5, 31.5], median: [31.5, 36.5], carrN: [36.5, 46.5], serviceF: [46.5, 56.5], farFront: 60 }
const DECK_Y = 10.3

interface Vehicle { obj: THREE.Object3D; dir: number; speed: number }

export default function TownScene({ branches, selectedId, view, night, resetKey, onSelect, onView, onHover }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const api = useRef<{ go: (id: string | null, v: OfficeViewKey) => void; setNight: (n: boolean) => void } | null>(null)
  const cb = useRef({ onSelect, onView, onHover }); cb.current = { onSelect, onView, onHover }
  const latest = useRef({ selectedId, view, night }); latest.current = { selectedId, view, night }
  const dataKey = JSON.stringify(branches.map(b => [b.branchId, b.name, b.status, b.staff.map(s => [s.userId, s.roleInBranch, s.name]), b.guarantors.length]))

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return
    const small = window.innerWidth < 768
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 2200)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2))
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement); renderer.domElement.style.display = 'block'; renderer.domElement.style.touchAction = 'none'
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxDistance = 420

    // ---------- sky, light, environment ----------
    const sky = new Sky(); sky.scale.setScalar(900000); scene.add(sky)
    const skyEnv = new Sky(); skyEnv.scale.setScalar(900000); const envScene = new THREE.Scene(); envScene.add(skyEnv)
    const pmrem = new THREE.PMREMGenerator(renderer); let envRT: THREE.WebGLRenderTarget | null = null
    const sun = new THREE.DirectionalLight(0xfff1dc, 3); sun.castShadow = true
    sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04
    const SH = 90; Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 420 })
    scene.add(sun, sun.target)
    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x9a8f7c, 0.5); scene.add(hemi)

    // ---------- layout ----------
    const sorted = [...branches].sort((a, b) => Number(/hq/i.test(b.name)) - Number(/hq/i.test(a.name)))
    const S = Math.max(3, Math.ceil(sorted.length / 2) + 1)
    const slotX = (k: number) => (k - (S - 1) / 2) * SPACING
    const order: Array<{ k: number; far: boolean }> = []
    const ks = Array.from({ length: S }, (_, k) => k).sort((a, b) => Math.abs(a - (S - 1) / 2) - Math.abs(b - (S - 1) / 2) || a - b)
    ks.forEach(k => { order.push({ k, far: false }, { k, far: true }) })
    const L = S * SPACING + 160

    const pulses: Pulse[] = []; const rigs = new Map<string, BranchBuilding>(); const pickables: THREE.Object3D[] = []
    order.forEach((slot, i) => {
      const x = slotX(slot.k)
      const br = sorted[i]
      const b = br ? buildBranchBuilding(br) : null
      const f = b ? null : buildFiller(i + 3)
      const grp = (b ? b.group : f!.group)
      if (slot.far) { grp.position.set(x, 0, Z.farFront + 8); grp.rotation.y = Math.PI } else grp.position.set(x, 0, 0)
      scene.add(grp)
      if (b && br) { rigs.set(br.branchId, b); pulses.push(...b.pulses); pickables.push(grp); b.office.cams.forEach(c => pickables.push(c)) } else if (f) pulses.push(...f.pulses)
    })

    // ---------- ground, roads, footpaths ----------
    const ground = mesh(new THREE.PlaneGeometry(L + 600, 700), texMat(grassTex(L / 12, 60), 1), 0, 0, 30, false); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
    const plane = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; scene.add(p); return p }
    const road = (z0: number, z1: number, lanes: number) => plane(L, z1 - z0, texMat(roadTex(lanes, L / 22, true), 0.9), 0, 0.03, (z0 + z1) / 2)
    road(Z.serviceN[0], Z.serviceN[1], 2); road(Z.carrS[0], Z.carrS[1], 2); road(Z.carrN[0], Z.carrN[1], 2); road(Z.serviceF[0], Z.serviceF[1], 2)
    const kerb = std(0xb8b8b4, 0.85)
    scene.add(slab(L, 0.2, Z.median[1] - Z.median[0], texMat(concreteTex(L / 8, 1), 0.9), 0, 0, (Z.median[0] + Z.median[1]) / 2))
    for (let x = -L / 2; x < L / 2; x += 6) {
      const sh = mesh(new THREE.SphereGeometry(0.7, 10, 8), std(0x3a7a35, 0.85), x + 1.5, 0.75, 33.2); sh.scale.set(2.2, 0.9, 1.1); scene.add(sh)
      const sh2 = mesh(new THREE.SphereGeometry(0.7, 10, 8), std(0x2f6a30, 0.85), x + 4.5, 0.75, 34.8); sh2.scale.set(2.2, 0.9, 1.1); scene.add(sh2)
    }
    const foot = (z0: number, z1: number) => { scene.add(slab(L, 0.2, z1 - z0, texMat(pavingTex(L / 6, (z1 - z0) / 6), 0.9), 0, 0, (z0 + z1) / 2, false)) }
    foot(Z.nearFront, Z.serviceN[0]); foot(Z.serviceF[1], Z.farFront)
    ;[Z.serviceN[0], Z.carrS[0], Z.carrS[1], Z.carrN[0], Z.carrN[1], Z.serviceF[1]].forEach(z => scene.add(slab(L, 0.16, 0.22, kerb, 0, 0, z)))

    // ---------- elevated deck (6 lanes, single central piers) ----------
    const deckLen = L
    scene.add(slab(deckLen, 1.0, 24, texMat(concreteTex(deckLen / 10, 2), 0.9), 0, DECK_Y - 1.0, 34))
    plane(deckLen, 22.4, texMat(roadTex(6, deckLen / 24, true), 0.88), 0, DECK_Y + 0.02, 34)
    scene.add(slab(deckLen, 1.1, 0.5, std(0xc9c9c4, 0.85), 0, DECK_Y, 22.1)); scene.add(slab(deckLen, 1.1, 0.5, std(0xc9c9c4, 0.85), 0, DECK_Y, 45.9)); scene.add(slab(deckLen, 1.0, 0.6, std(0xd8d8d3, 0.8), 0, DECK_Y, 34))
    for (const z of [22.1, 45.9]) scene.add(slab(deckLen, 0.08, 0.1, std(0x8d8f92, 0.4, 0.8), 0, DECK_Y + 1.1, z))
    for (let x = -L / 2 + 10; x < L / 2; x += 30) {
      scene.add(mesh(cyl(1.25, 1.45, DECK_Y - 2.3, 28), texMat(concreteTex(1, 2), 0.9), x, (DECK_Y - 2.3) / 2, 34))
      scene.add(mesh(bx(3.4, 1.4, 12), texMat(concreteTex(2, 1), 0.9), x, DECK_Y - 1.7, 34))
      scene.add(mesh(bx(0.4, 1.5, 0.4), std(0xe0b01a, 0.6), x, 0.75, 31.4)); scene.add(mesh(bx(0.4, 1.5, 0.4), std(0xe0b01a, 0.6), x, 0.75, 36.6))
    }
    const lampMat = glow(0xfff2c6, 0)
    for (let x = -L / 2 + 20; x < L / 2; x += 28) {
      scene.add(mesh(cyl(0.09, 0.12, 6.5, 10), std(0x8f949c, 0.4, 0.7), x, DECK_Y + 3.3, 34))
      for (const s of [-1, 1]) { scene.add(mesh(bx(0.08, 0.08, 2.4), std(0x8f949c, 0.4, 0.7), x, DECK_Y + 6.4, 34 + s * 1.2)); scene.add(mesh(bx(0.3, 0.06, 0.8), lampMat, x, DECK_Y + 6.33, 34 + s * 2.5, false)) }
    }

    // ---------- street furniture, trees ----------
    const lamps: THREE.Mesh[] = []
    for (let x = -L / 2 + 12; x < L / 2; x += 26) {
      const a = streetLight(); a.position.set(x, 0, Z.serviceN[0] + 0.2); a.rotation.y = -Math.PI / 2; scene.add(a); lamps.push(a.getObjectByName('lamp') as THREE.Mesh)
      const c = streetLight(); c.position.set(x + 13, 0, Z.serviceF[1] - 0.2); c.rotation.y = Math.PI / 2; scene.add(c); lamps.push(c.getObjectByName('lamp') as THREE.Mesh)
    }
    const rr = rng(77)
    for (let x = -L / 2 + 6; x < L / 2; x += 9) {
      const p = rr() > 0.4 ? palm(6 + rr() * 4, Math.floor(rr() * 9)) : tree(5 + rr() * 3, Math.floor(rr() * 9)); p.position.set(x + rr() * 4, 0, -12 - rr() * 14); p.rotation.y = rr() * 6; scene.add(p)
      const q = rr() > 0.5 ? palm(6 + rr() * 4, Math.floor(rr() * 9)) : tree(5 + rr() * 3, Math.floor(rr() * 9)); q.position.set(x + rr() * 4, 0, Z.farFront + 20 + rr() * 16); q.rotation.y = rr() * 6; scene.add(q)
    }
    for (let k = 0; k < S + 1; k++) {
      const gx = slotX(k) - SPACING / 2; if (Math.abs(gx) > L / 2) continue
      for (const z of [2, 66]) { const p = palm(7 + rr() * 3, k); p.position.set(gx, 0, z); scene.add(p) }
    }

    // ---------- traffic (left-hand drive) ----------
    const vehicles: Vehicle[] = []
    const palette = [0xf3f4f6, 0xc9ccd1, 0x1f2937, 0x8b1e1e, 0x1d4ed8, 0xd9d9d9, 0x0f766e, 0xb45309]
    const rv = rng(5)
    const pickVehicle = (kind: string) => {
      if (kind === 'bus') return bus(rv() > 0.5 ? 0x1d4ed8 : 0xb91c1c)
      if (kind === 'lorry') return lorry(rv() > 0.5 ? 0xdc7a1c : 0x2f6f4f)
      if (kind === 'auto') return autoRickshaw()
      return car(palette[Math.floor(rv() * palette.length)])
    }
    const lane = (z: number, y: number, dir: number, speed: number, count: number, kinds: string[]) => {
      for (let i = 0; i < count; i++) {
        const o = pickVehicle(kinds[Math.floor(rv() * kinds.length)]); const x = -L / 2 + ((i + rv() * 0.6) / count) * L
        o.position.set(x, y, z); o.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(o); vehicles.push({ obj: o, dir, speed: speed * (0.85 + rv() * 0.3) })
      }
    }
    const nv = Math.max(2, Math.round(L / 110))
    lane(14.2, 0.04, 1, 5.5, nv, ['auto', 'car', 'car']); lane(19.0, 0.04, -1, 5.5, nv, ['auto', 'car', 'lorry'])
    lane(24.5, 0.04, 1, 10, nv, ['bus', 'car', 'lorry']); lane(28.5, 0.04, 1, 12, nv, ['car', 'car', 'lorry'])
    lane(39.5, 0.04, -1, 12, nv, ['car', 'bus', 'car']); lane(43.5, 0.04, -1, 10, nv, ['car', 'lorry', 'car'])
    lane(49.2, 0.04, 1, 5.5, nv, ['car', 'auto']); lane(54.0, 0.04, -1, 5.5, nv, ['auto', 'car', 'car'])
    for (const z of [25.0, 28.7, 32.2]) lane(z, DECK_Y + 0.03, 1, 21, nv, ['car', 'car', 'bus', 'lorry'])
    for (const z of [35.8, 39.3, 43.0]) lane(z, DECK_Y + 0.03, -1, 21, nv, ['car', 'car', 'bus', 'lorry'])

    // ---------- day / night ----------
    const sunDir = new THREE.Vector3(0.5, 0.8, 0.4), lightDir = new THREE.Vector3(0.5, 0.8, 0.4)
    const applyNight = (nt: boolean) => {
      const elev = nt ? -6 : 38, az = 215
      sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az))
      lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(nt ? 58 : 90 - elev), THREE.MathUtils.degToRad(nt ? 150 : az))
      for (const s of [sky, skyEnv]) {
        const u = s.material.uniforms
        u.turbidity.value = nt ? 2 : 5; u.rayleigh.value = nt ? 0.15 : 1.3; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(sunDir)
      }
      sun.intensity = nt ? 0.9 : 3.2; sun.color.set(nt ? 0x86a6ff : 0xfff1dc); hemi.intensity = nt ? 0.45 : 0.55; renderer.toneMappingExposure = nt ? 0.75 : 0.62
      scene.fog = new THREE.FogExp2(nt ? 0x05070d : 0xc9d9e8, nt ? 0.0022 : 0.0016)
      envRT?.dispose(); envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture; scene.environmentIntensity = nt ? 0.3 : 0.55
      pulses.forEach(p => { p.m.emissiveIntensity = nt ? p.night : p.day })
      lampMat.emissiveIntensity = nt ? 4 : 0
      glow(0xfff6d6, 0.2).emissiveIntensity = nt ? 6 : 0.2; glow(0xd01818, 0.3).emissiveIntensity = nt ? 3 : 0.3
      lamps.forEach(l => { (l.material as THREE.MeshStandardMaterial).emissiveIntensity = nt ? 4 : 0 })
      rigs.forEach(r => { r.office.glowMats.forEach(m => { m.emissiveIntensity = nt ? 1.6 : 0.9 }); r.office.lights.forEach(l => { l.intensity = nt ? 38 : 8 }) })
    }

    // ---------- camera / focus ----------
    const overviewPos = new THREE.Vector3(-30, 62 + S * 5, 96 + S * 6), overviewTarget = new THREE.Vector3(0, 6, 14)
    camera.position.copy(overviewPos); controls.target.copy(overviewTarget)
    let focus: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
    let targetFov = 42
    scene.updateMatrixWorld(true)
    const go = (id: string | null, v: OfficeViewKey) => {
      const rig = id ? rigs.get(id) : null
      rigs.forEach((r, rid) => { const sel = rid === id; r.office.cams.forEach(c => { c.visible = !(sel && c.userData.pick.view === v) }); r.office.labels.visible = sel && v !== 'outside'; r.office.ceiling.visible = !(sel && v === 'top'); r.terrace.visible = !(sel && v === 'top') })
      if (!rig || !id) { targetFov = 42; focus = { pos: overviewPos.clone(), target: overviewTarget.clone() }; controls.minDistance = 6; controls.maxPolarAngle = Math.PI / 2.05; return }
      scene.updateMatrixWorld(true)
      targetFov = v === 'outside' ? 40 : v === 'top' ? 52 : 68
      if (v === 'outside') {
        focus = { pos: rig.group.localToWorld(rig.outside.pos.clone()), target: rig.group.localToWorld(rig.outside.target.clone()) }; controls.minDistance = 3; controls.maxPolarAngle = Math.PI / 2.05
      } else {
        const vw = rig.office.views[v]; focus = { pos: rig.officeGroup.localToWorld(vw.pos.clone()), target: rig.officeGroup.localToWorld(vw.target.clone()) }; controls.minDistance = 0.3; controls.maxPolarAngle = Math.PI * 0.97
      }
    }
    applyNight(latest.current.night); go(latest.current.selectedId, latest.current.view)
    api.current = { go, setNight: applyNight }
    controls.addEventListener('start', () => { focus = null })

    // ---------- pick ----------
    const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let downAt = { x: 0, y: 0 }
    type Pick = { kind: TownHover['kind']; id?: string; view?: OfficeViewKey; title: string; sub: string }
    const pickAt = (cx: number, cy: number): Pick | null => {
      const r = renderer.domElement.getBoundingClientRect(); mouse.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera)
      const hits = ray.intersectObjects(pickables, true)
      for (const h of hits) {
        const m = (h.object as THREE.Mesh).material as THREE.Material | undefined
        if (m && m.transparent && m.opacity < 0.5) continue
        let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.pick) return o.userData.pick as Pick; o = o.parent }
      }
      return null
    }
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'touch') return; const p = pickAt(e.clientX, e.clientY); renderer.domElement.style.cursor = p ? 'pointer' : 'grab'; const r = mount.getBoundingClientRect(); cb.current.onHover(p ? { kind: p.kind, title: p.title, sub: p.sub, x: e.clientX - r.left, y: e.clientY - r.top } : null) }
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => { if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return; const p = pickAt(e.clientX, e.clientY); if (!p) return; if (p.kind === 'camera' && p.view) cb.current.onView(p.view); else if (p.kind === 'branch' && p.id) cb.current.onSelect(p.id) }
    const el = renderer.domElement; el.addEventListener('pointermove', onMove); el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp); el.addEventListener('pointerleave', () => cb.current.onHover(null))

    const resize = () => { const w = mount.clientWidth, h = mount.clientHeight; renderer.setSize(w, h, false); el.style.width = w + 'px'; el.style.height = h + 'px'; camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(resize); ro.observe(mount); resize()

    const clock = new THREE.Clock(); let raf = 0; const half = L / 2 + 30
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime
      for (const v of vehicles) { v.obj.position.x += v.dir * v.speed * dt; if (v.obj.position.x > half) v.obj.position.x = -half; if (v.obj.position.x < -half) v.obj.position.x = half }
      rigs.forEach(r => r.office.cams.forEach(c => { const led = c.getObjectByName('led') as THREE.Mesh | undefined; if (led) (led.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 4) > 0 ? 2 : 0.2 }))
      if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix() }
      if (focus) { const k = Math.min(1, dt * 2.6); camera.position.lerp(focus.pos, k); controls.target.lerp(focus.target, k); if (camera.position.distanceTo(focus.pos) < 0.15 && controls.target.distanceTo(focus.target) < 0.15) focus = null }
      sun.position.copy(controls.target).addScaledVector(lightDir, 160); sun.target.position.copy(controls.target)
      controls.update(); renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); api.current = null; envRT?.dispose(); pmrem.dispose()
      renderer.dispose(); el.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  useEffect(() => { api.current?.go(selectedId, view) }, [selectedId, view, resetKey])
  useEffect(() => { api.current?.setNight(night) }, [night])

  return <div ref={mountRef} className="absolute inset-0" />
}
