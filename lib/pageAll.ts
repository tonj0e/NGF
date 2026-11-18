// Read every row of a filtered, ordered list in pages of `pageSize`, the way the old "no page" loops did
// (page 1, 2, 3 ... in the same order), but faster: the exact count is asked once (with page 1), then the
// remaining pages are fetched in parallel, a few at a time. The rows come back in page order, so the result is
// the same list the sequential loop produced.

/**
 * `fetchPage(from, to, withCount)` reads one inclusive row range; it must return `total` (the exact count)
 * when `withCount` is true. Pages after the first are read `concurrency` at a time.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => Promise<{ rows: T[]; total?: number }>,
  pageSize = 200,
  concurrency = 5,
): Promise<T[]> {
  const first = await fetchPage(0, pageSize - 1, true)
  const total = first.total ?? first.rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return first.rows
  const pages: T[][] = new Array(totalPages)
  pages[0] = first.rows
  let next = 2
  async function worker() {
    while (next <= totalPages) {
      const pg = next++
      const r = await fetchPage((pg - 1) * pageSize, pg * pageSize - 1, false)
      pages[pg - 1] = r.rows
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, totalPages - 1) }, worker))
  return pages.flat()
}
