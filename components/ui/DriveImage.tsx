'use client'
import { useDriveImage } from '@/lib/driveImage'

// Full picture (detail view keeps the original), loaded when it scrolls into view; shared cache.
// The link is a Drive link (?id= or /d/) or an /api/drive/... path.
export default function DriveImage({ url, label, token }: { url: string; label: string; token: string }) {
  const { src, loading, error, ref } = useDriveImage(url, token)

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">{label}</p>
      {!url ? (
        <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-line bg-panel text-xs text-soft">Not uploaded</div>
      ) : src ? (
        <a href={url} target="_blank" rel="noopener" className="block rounded-2xl overflow-hidden border border-line bg-panel">
          <img src={src} alt={label} className="w-full h-64 object-cover transition hover:opacity-90" />
        </a>
      ) : loading ? (
        <div className="flex h-64 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-panel text-xs text-soft">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          Loading...
        </div>
      ) : error ? (
        <a href={url} target="_blank" rel="noopener" className="flex h-64 w-full items-center justify-center rounded-2xl border border-line bg-panel text-xs text-red-400">
          Failed — click to open in Drive
        </a>
      ) : null}
    </div>
  )
}