'use client'
// One shared loader for pictures served by /api/drive/[fileId] (customer photos, payment screenshots).
// - a module-level cache of object URLs, so re-renders, polls and page switches do not download again
// - at most MAX_PARALLEL downloads at a time
// - useDriveImage() starts the download only when the picture scrolls near the screen
// The cache is emptied when the signed-in token changes (sign out / another user), so one person's
// pictures are never shown from memory to the next.
import { useEffect, useState } from 'react'

const MAX_PARALLEL = 4
const MAX_ITEMS = 300
const MAX_BYTES = 120 * 1024 * 1024

// "/api/drive/<id>" from a stored link: a Drive link (?id= or /d/) or an /api/drive/... path.
// Another same-origin path is used as it is; anything else gives ''.
export function driveImagePath(url: string): string {
  if (!url) return ''
  if (url.startsWith('/api/drive/')) return url
  const id = url.match(/[?&]id=([^&]+)/)?.[1] || url.match(/\/d\/([^/]+)/)?.[1] || ''
  if (id) return `/api/drive/${id}`
  return url.startsWith('/') && !url.startsWith('//') ? url : ''
}

type Item = { src: string; bytes: number }
const cache = new Map<string, Item>()          // insertion order = least recently used first
const inflight = new Map<string, Promise<string>>()
let cacheBytes = 0
let cacheToken = ''
let generation = 0

function switchToken(token: string) {
  if (token === cacheToken) return
  cacheToken = token
  generation++
  for (const it of cache.values()) URL.revokeObjectURL(it.src)
  cache.clear()
  inflight.clear()
  cacheBytes = 0
}

function store(key: string, item: Item) {
  cache.set(key, item)
  cacheBytes += item.bytes
  for (const [k, it] of cache) {
    if (cache.size <= MAX_ITEMS && cacheBytes <= MAX_BYTES) break
    if (k === key) continue
    cache.delete(k)
    cacheBytes -= it.bytes
    URL.revokeObjectURL(it.src)
  }
}

// Simple queue: at most MAX_PARALLEL downloads running
let running = 0
const waiting: (() => void)[] = []
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>(r => waiting.push(r))
  running++
  try { return await work() } finally {
    running--
    waiting.shift()?.()
  }
}

const keyOf = (path: string, w: number) => (w ? `${path}${path.includes('?') ? '&' : '?'}w=${w}` : path)

// Object URL already in memory (no download), or ''
export function peekDriveImage(url: string, token: string, w = 0): string {
  const path = driveImagePath(url)
  if (!path || token !== cacheToken) return ''
  const key = keyOf(path, w)
  const it = cache.get(key)
  if (!it) return ''
  cache.delete(key); cache.set(key, it)   // most recently used
  return it.src
}

// Object URL for the picture (downloads once; later calls share the result). w = small version, 0 = original.
export function loadDriveImage(url: string, token: string, w = 0): Promise<string> {
  const path = driveImagePath(url)
  if (!path) return Promise.reject(new Error('No picture'))
  switchToken(token)
  const key = keyOf(path, w)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit.src)
  const busy = inflight.get(key)
  if (busy) return busy
  const gen = generation
  const p = slot(async () => {
    const r = await fetch(key, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`Picture ${r.status}`)
    const blob = await r.blob()
    const src = URL.createObjectURL(blob)
    if (gen === generation) store(key, { src, bytes: blob.size })
    return src
  }).finally(() => { if (gen === generation) inflight.delete(key) })
  inflight.set(key, p)
  return p
}

// Watches when an element comes near the screen (one shared observer)
const watchers = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null
function watch(el: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { onVisible(); return () => {} }
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const cb = watchers.get(e.target)
        watchers.delete(e.target)
        observer?.unobserve(e.target)
        cb?.()
      }
    }, { rootMargin: '300px' })
  }
  watchers.set(el, onVisible)
  observer.observe(el)
  return () => { watchers.delete(el); observer?.unobserve(el) }
}

// React hook. Put `ref` on the element that is on screen while loading (placeholder) and after (the <img>).
// lazy: wait until it scrolls near the screen. enabled: false = do not load yet (e.g. a closed viewer).
export function useDriveImage(url: string, token: string, opts: { w?: number; lazy?: boolean; enabled?: boolean } = {}) {
  const { w = 0, lazy = true, enabled = true } = opts
  const path = driveImagePath(url)
  const key = path ? `${keyOf(path, w)}|${token}` : ''
  const [el, setEl] = useState<Element | null>(null)
  const [seen, setSeen] = useState('')
  const [done, setDone] = useState<{ key: string; src: string; error: boolean } | null>(null)
  const cached = enabled ? peekDriveImage(url, token, w) : ''
  const visible = !lazy || seen === key

  useEffect(() => {
    if (!lazy || !key || !enabled || cached || seen === key || !el) return
    return watch(el, () => setSeen(key))
  }, [lazy, key, enabled, cached, seen, el])

  useEffect(() => {
    if (!key || !enabled || cached || !visible) return
    let dead = false
    loadDriveImage(url, token, w).then(
      src => { if (!dead) setDone({ key, src, error: false }) },
      () => { if (!dead) setDone({ key, src: '', error: true }) },
    )
    return () => { dead = true }
  }, [key, enabled, cached, visible, url, token, w])

  const mine = done && done.key === key ? done : null
  const src = cached || mine?.src || ''
  const error = !src && !!mine?.error
  return { src, error, loading: !!path && enabled && !src && !error, ref: setEl }
}
