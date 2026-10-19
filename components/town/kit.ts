// Shared geometry/material/texture kit for the Branch Town scene. Everything is procedural (no downloaded assets).
// Units are metres. Geometry, materials and textures are cached by key so repeated props stay cheap.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const geos = new Map<string, THREE.BufferGeometry>()
const mats = new Map<string, THREE.Material>()
const texs = new Map<string, THREE.CanvasTexture>()

export const bx = (w: number, h: number, d: number) => { const k = `b${w},${h},${d}`; let g = geos.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); geos.set(k, g) } return g }
export const rb = (w: number, h: number, d: number, r = 0.04) => { const k = `r${w},${h},${d},${r}`; let g = geos.get(k); if (!g) { g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); geos.set(k, g) } return g }
export const cyl = (rt: number, rbm: number, h: number, seg = 20) => { const k = `c${rt},${rbm},${h},${seg}`; let g = geos.get(k); if (!g) { g = new THREE.CylinderGeometry(rt, rbm, h, seg); geos.set(k, g) } return g }
export const sph = (r: number, ws = 24, hs = 16) => { const k = `s${r},${ws},${hs}`; let g = geos.get(k); if (!g) { g = new THREE.SphereGeometry(r, ws, hs); geos.set(k, g) } return g }
export const cap = (r: number, len: number) => { const k = `p${r},${len}`; let g = geos.get(k); if (!g) { g = new THREE.CapsuleGeometry(r, len, 6, 14); geos.set(k, g) } return g }

/** Mesh with its centre at (x,y,z). */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; return o
}
/** Box standing on y0 (bottom-based), centre x,z. */
export function slab(w: number, h: number, d: number, m: THREE.Material, x = 0, y0 = 0, z = 0, shadow = true): THREE.Mesh {
  return mesh(bx(w, h, d), m, x, y0 + h / 2, z, shadow)
}

export function mat(key: string, make: () => THREE.Material): THREE.Material { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m) } return m }
export const std = (color: number | string, rough = 0.8, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  mat(`std${color}|${rough}|${metal}|${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra })) as THREE.MeshStandardMaterial
export const glow = (color: number | string, intensity = 1) =>
  mat(`glow${color}|${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 })) as THREE.MeshStandardMaterial
export const glass = (tint = 0xbfd8e6, opacity = 0.18) =>
  mat(`glass${tint}|${opacity}`, () => new THREE.MeshPhysicalMaterial({ color: tint, transparent: true, opacity, roughness: 0.04, metalness: 0.05, envMapIntensity: 1.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })) as THREE.MeshPhysicalMaterial

// ---------- textures ----------
function tex(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, rx = 1, ry = 1): THREE.CanvasTexture {
  const k = `${key}|${rx}|${ry}`; const hit = texs.get(k); if (hit) return hit
  const base = texs.get(key)
  let t: THREE.CanvasTexture
  if (base) { t = base.clone(); t.needsUpdate = true } else {
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d')!; draw(c, size)
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; texs.set(key, t)
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); texs.set(k, t); return t
}
function speckle(c: CanvasRenderingContext2D, s: number, n: number, a: number) {
  for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2) }
}
export const plasterTex = (hex: string, rx = 1, ry = 1) => tex(`plaster${hex}`, 256, (c, s) => { c.fillStyle = hex; c.fillRect(0, 0, s, s); speckle(c, s, 5000, 0.07); for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(60,50,40,${Math.random() * 0.025})`; c.fillRect(Math.random() * s, 0, 2 + Math.random() * 6, s) } }, rx, ry)
export const asphaltTex = (rx = 1, ry = 1) => tex('asphalt', 256, (c, s) => { c.fillStyle = '#34373d'; c.fillRect(0, 0, s, s); speckle(c, s, 9000, 0.22) }, rx, ry)
export const pavingTex = (rx = 1, ry = 1) => tex('paving', 256, (c, s) => { c.fillStyle = '#b9a9a0'; c.fillRect(0, 0, s, s); const n = 8; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y % 2) * (s / n / 2); c.fillStyle = `hsl(${12 + Math.random() * 10},${12 + Math.random() * 8}%,${58 + Math.random() * 8}%)`; c.fillRect(x * s / n + o + 1, y * s / n + 1, s / n - 2, s / n - 2) } }, rx, ry)
export const grassTex = (rx = 1, ry = 1) => tex('grass', 256, (c, s) => { c.fillStyle = '#6f8d55'; c.fillRect(0, 0, s, s); for (let i = 0; i < 9000; i++) { c.fillStyle = `hsla(${80 + Math.random() * 30},${28 + Math.random() * 20}%,${28 + Math.random() * 22}%,0.5)`; c.fillRect(Math.random() * s, Math.random() * s, 1, 2 + Math.random() * 3) } }, rx, ry)
export const concreteTex = (rx = 1, ry = 1) => tex('concrete', 256, (c, s) => { c.fillStyle = '#a9aaa8'; c.fillRect(0, 0, s, s); speckle(c, s, 7000, 0.12); for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(40,40,40,${0.03 + Math.random() * 0.04})`; c.fillRect(0, Math.random() * s, s, 2) } }, rx, ry)
export const tileTex = (rx = 1, ry = 1) => tex('tile', 256, (c, s) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const v = 224 + Math.random() * 10; c.fillStyle = `rgb(${v},${v - 2},${v - 8})`; c.fillRect(x * s / 2, y * s / 2, s / 2, s / 2) } c.strokeStyle = 'rgba(120,115,105,0.7)'; c.lineWidth = 3; c.strokeRect(0, 0, s, s); c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke(); speckle(c, s, 1800, 0.05) }, rx, ry)
export const woodTex = (rx = 1, ry = 1, base = '#8a5a35') => tex(`wood${base}`, 256, (c, s) => { c.fillStyle = base; c.fillRect(0, 0, s, s); const n = 6; for (let i = 0; i < n; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; c.fillRect(0, i * s / n, s, 2); for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(40,20,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * s, i * s / n + Math.random() * s / n, 20 + Math.random() * 60, 1) } } }, rx, ry)
export const carpetTex = (rx = 1, ry = 1) => tex('carpet', 128, (c, s) => { c.fillStyle = '#3b4a5c'; c.fillRect(0, 0, s, s); speckle(c, s, 5000, 0.18) }, rx, ry)

/** Road texture: asphalt with dashed white centre line(s) along the long axis (u). */
export const roadTex = (lanes: number, rx: number, edge = true) => tex(`road${lanes}|${edge}`, 512, (c, s) => {
  c.fillStyle = '#34373d'; c.fillRect(0, 0, s, s); speckle(c, s, 22000, 0.2)
  c.fillStyle = 'rgba(245,245,240,0.92)'
  for (let i = 1; i < lanes; i++) { const y = (i / lanes) * s; for (let x = 0; x < s; x += s / 4) c.fillRect(x, y - 3, s / 8, 6) }
  if (edge) { c.fillRect(0, 6, s, 4); c.fillRect(0, s - 10, s, 4) }
}, rx, 1)

export function signTex(lines: string[], bg: string, fg: string, w = 1024, h = 256, accent = ''): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!
  c.fillStyle = bg; c.fillRect(0, 0, w, h)
  if (accent) { c.fillStyle = accent; c.fillRect(0, h - 14, w, 14) }
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'
  const sizes = lines.length === 1 ? [Math.min(150, (w * 1.55) / Math.max(lines[0].length, 8))] : lines.map((_, i) => i === 0 ? 110 : 62)
  let y = h / 2 - ((lines.length - 1) * 60) / 2
  lines.forEach((t, i) => { c.font = `700 ${sizes[i]}px Inter, Arial, sans-serif`; c.fillText(t, w / 2, y); y += 70 })
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
}
export function signMat(lines: string[], bg: string, fg: string, w = 1024, h = 256, accent = '', emissive = 0.7): THREE.MeshStandardMaterial {
  const t = signTex(lines, bg, fg, w, h, accent)
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 0.5 })
}
export function labelSprite(text: string, opts: { bg?: string; fg?: string; scale?: number } = {}): THREE.Sprite {
  const cv = document.createElement('canvas'); const ctx = cv.getContext('2d')!
  const font = '600 34px Inter, system-ui, sans-serif'; ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 44; cv.width = w; cv.height = 64; ctx.font = font
  ctx.fillStyle = opts.bg || 'rgba(16,19,26,0.82)'; ctx.beginPath(); ctx.roundRect(0, 4, w, 56, 28); ctx.fill()
  ctx.fillStyle = opts.fg || '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 22, 33)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }))
  const s = opts.scale ?? 0.0034; sp.scale.set(w * s, 64 * s, 1); sp.renderOrder = 20; return sp
}
export const texMat = (t: THREE.Texture, rough = 0.85, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: metal, ...extra })

export function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
export function rng(seed: number) { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
