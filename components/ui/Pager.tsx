'use client'

// Previous / Next buttons with "N items · page X of Y". Shown only when there is more than one page.
export default function Pager({ page, totalPages, total, noun = 'items', pageSize, onPage }: {
  page: number; totalPages: number; total: number; noun?: string; pageSize: number; onPage: (page: number) => void
}) {
  if (total <= pageSize) return null
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <span className="text-xs text-[#697586]">{total} {noun} · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button>
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}
