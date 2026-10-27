'use client'
import { useState, useEffect } from 'react'

export default function DriveImage({ url, label, token }: { url: string; label: string; token: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // For Supabase proxy URLs, use the full path after /api/drive/
  // For Drive URLs, extract the fileId from ?id= or /d/
  const identifier = url?.startsWith('/api/drive/')
    ? url.slice('/api/drive/'.length)
    : (url?.match(/[?&]id=([^&]+)/)?.[1] || url?.match(/\/d\/([^/]+)/)?.[1] || '')

  useEffect(() => {
    if (!identifier) return
    setLoading(true)
    fetch(`/api/drive/${identifier}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (!res.ok) throw new Error(); return res.blob() })
      .then(blob => setSrc(URL.createObjectURL(blob)))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [identifier, token])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{label}</p>
      {!url ? (
        <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-line bg-[#f8f9fb] text-xs text-soft">Not uploaded</div>
      ) : src ? (
        <a href={url} target="_blank" rel="noopener" className="block rounded-2xl overflow-hidden border border-line bg-[#f8f9fb]">
          <img src={src} alt={label} className="w-full h-64 object-cover transition hover:opacity-90" />
        </a>
      ) : loading ? (
        <div className="flex h-64 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-[#f8f9fb] text-xs text-soft">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          Loading...
        </div>
      ) : error ? (
        <a href={url} target="_blank" rel="noopener" className="flex h-64 w-full items-center justify-center rounded-2xl border border-line bg-[#f8f9fb] text-xs text-red-400">
          Failed — click to open in Drive
        </a>
      ) : null}
    </div>
  )
}