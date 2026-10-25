// Supabase returns at most 1000 rows per request. Reading a whole table therefore has to ask page by page,
// otherwise everything after row 1000 is silently dropped.
export const PAGE_SIZE = 1000

/** Calls `fetchPage(from, to)` (inclusive range) until a page comes back short; returns all rows in order. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const rows = await fetchPage(from, from + pageSize - 1)
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}
