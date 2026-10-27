'use client'
import { useEffect, useRef, useState } from 'react'
import { Session } from '@/types'

type Option = { 'Option ID': string; 'Label': string; 'Category': string; 'Created At': string }

// Single review category used by the collection payment screen
export const REVIEW_CATEGORY = 'Review'

function CategorySection({ cat, options, token, onAdded, onChanged, onError }: {
  cat: string; options: Option[]; token: string
  onAdded: () => void; onChanged: () => void; onError: (msg: string) => void
}) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  async function add() {
    if (!label.trim()) return
    setSaving(true)
    await fetch('/api/review-options', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), category: cat }),
    })
    setLabel('')
    setSaving(false)
    onAdded()
  }

  async function save(optionId: string) {
    if (!editLabel.trim()) return
    await fetch('/api/review-options', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId, label: editLabel.trim() }),
    })
    setEditingId(null)
    onChanged()
  }

  async function remove(optionId: string) {
    const res = await fetch('/api/review-options', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    })
    const json = await res.json()
    if (json.success) onChanged()
    else onError(json.error || 'Failed to delete')
  }

  function startEdit(o: Option) {
    setEditingId(o['Option ID'])
    setEditLabel(o['Label'])
  }

  return (
    <div className="rounded-[1.6rem] border border-white/70 bg-white p-5 shadow-panel space-y-4">
      <p className="font-semibold text-base">Review Options</p>
      <div className="flex gap-2">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add review option..."
          className="flex-1 rounded-xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white transition"
        />
        <button onClick={add} disabled={saving || !label.trim()}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </div>
      <div className="space-y-2">
        {options.length === 0 ? (
          <p className="text-xs text-soft text-center py-3">No options yet.</p>
        ) : options.map(o => (
          <div key={o['Option ID']} className="rounded-xl bg-mist px-4 py-2.5">
            {editingId === o['Option ID'] ? (
              <div className="flex gap-2">
                <input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && save(o['Option ID'])}
                  autoFocus
                  className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-ink"
                />
                <button onClick={() => save(o['Option ID'])}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                  Save
                </button>
                <button onClick={() => setEditingId(null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-soft">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{o['Label']}</span>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(o)}
                    className="rounded-lg border border-line bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-mist transition">
                    Edit
                  </button>
                  <button onClick={() => remove(o['Option ID'])}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ReviewOptionsPage({ session }: { session: Session }) {
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  const loadedOnce = useRef(false)
  async function load() {
    if (!loadedOnce.current) setLoading(true)
    const res = await fetch('/api/review-options', { headers: { Authorization: `Bearer ${session.token}` } })
    const json = await res.json()
    if (json.success) setOptions(json.data.options)
    loadedOnce.current = true
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading && !loadedOnce.current) return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
    </div>
  )

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
      <p className="text-sm text-soft">Manage the review options agents pick from when recording a payment, alongside the star rating.</p>
      <div className="max-w-xl">
        <CategorySection
          cat={REVIEW_CATEGORY}
          options={options.filter(o => o['Category'] === REVIEW_CATEGORY)}
          token={session.token}
          onAdded={() => { showToast('Added.'); load() }}
          onChanged={() => { showToast('Updated.'); load() }}
          onError={(msg) => showToast(msg)}
        />
      </div>
    </div>
  )
}
