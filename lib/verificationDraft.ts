// A verification form in progress is kept on the phone (IndexedDB) until the server confirms the submit.
// Typed details and the chosen photos survive a dropped signal, Back, closing the app or restarting the phone.
// One draft per agent per lead; it is deleted only after a successful submit.

export type Draft = { fields: Record<string, string>; photos: Record<string, Blob>; updated: number }

const DB = 'ngf-verification-drafts', STORE = 'drafts'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
const run = <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  open().then(db => new Promise<T>((resolve, reject) => {
    const req = f(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => { resolve(req.result); db.close() }
    req.onerror = () => { reject(req.error); db.close() }
  }))

const key = (userId: string, leadId: string) => `${userId}:${leadId}`

export const saveDraft = (userId: string, leadId: string, d: Draft) => run('readwrite', s => s.put(d, key(userId, leadId))).then(() => true).catch(() => false)
export const loadDraft = (userId: string, leadId: string) => run<Draft | undefined>('readonly', s => s.get(key(userId, leadId))).catch(() => undefined)
export const deleteDraft = (userId: string, leadId: string) => run('readwrite', s => s.delete(key(userId, leadId))).catch(() => undefined)
export async function draftLeadIds(userId: string): Promise<string[]> {
  try { return ((await run<IDBValidKey[]>('readonly', s => s.getAllKeys())) as string[]).filter(k => k.startsWith(userId + ':')).map(k => k.slice(userId.length + 1)) } catch { return [] }
}
