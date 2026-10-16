'use client'
import { useEffect } from 'react'

export default function AutoUppercase() {
  useEffect(() => {
    function handle(e: Event) {
      const el = e.target as HTMLInputElement | HTMLTextAreaElement
      if (!el) return
      const tag = el.tagName
      const type = (el as HTMLInputElement).type || ''
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return
      if (['password', 'file', 'checkbox', 'radio', 'email'].includes(type)) return
      if (el.hasAttribute('data-no-upper')) return
      if (el.closest('[data-no-upper-form]')) return
      const up = el.value.toUpperCase()
      if (up === el.value) return
      const start = el.selectionStart
      const end = el.selectionEnd
      el.value = up
      try { el.setSelectionRange(start, end) } catch {}
    }
    // Capture phase so the value is uppercased BEFORE React's onChange reads it —
    // otherwise the last typed character stays lowercase in controlled inputs.
    document.addEventListener('input', handle, true)
    return () => document.removeEventListener('input', handle, true)
  }, [])
  return null
}
