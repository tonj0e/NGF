// Pure helpers for lib/db.ts (no database), so they can be tested alone.
export const MAX_PAGE_SIZE = 200
export const ID_CHUNK = 200

export function chunk<T>(items: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Search text safe to put inside a PostgREST `or=(...)` filter: no separators, brackets, wildcards or quotes. */
export function cleanSearch(text: unknown): string {
  return String(text ?? '').replace(/[,()%*\\"'`;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** Page number (from 1) and size to an inclusive row range, with sane limits. */
export function pageBounds(page: unknown, pageSize: unknown, fallbackSize = 50): { page: number; pageSize: number; from: number; to: number } {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize)) || fallbackSize))
  const pg = Math.max(1, Math.floor(Number(page)) || 1)
  return { page: pg, pageSize: size, from: (pg - 1) * size, to: pg * size - 1 }
}

