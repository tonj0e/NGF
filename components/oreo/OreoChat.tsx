'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Session } from '@/types'
import { apiGet, apiSend, csrfFor } from '@/lib/clientApi'
import { OreoOrb, OreoFace, OreoState } from './Mascot'

type Card = { actionId: string; tool: string; summary: string; state: 'pending' | 'working' | 'done' | 'cancelled' | 'failed'; note?: string; at: number }
type Msg = {
  id: string; role: 'user' | 'assistant'; text: string; tools?: string[]; cards?: Card[]; busy?: boolean; error?: boolean
  cost?: { usd: number; model: string }; sw?: { to: 'haiku' | 'sonnet' | 'opus'; label: string; reason: string; estimateUsd: number }; retry?: string
}
type Tier = 'auto' | 'haiku' | 'sonnet' | 'opus'
type VoiceCfg = { stt: 'sarvam' | 'elevenlabs' | 'browser'; tts: 'sarvam' | 'elevenlabs' | 'browser' }
const MODELS: { key: Tier; label: string; hint: string }[] = [
  { key: 'auto', label: 'Auto', hint: 'Oreo picks, and tells you when a task needs Opus' },
  { key: 'haiku', label: 'Haiku 5.5', hint: 'Quick and cheap: lookups, simple questions' },
  { key: 'sonnet', label: 'Sonnet 5.5', hint: 'Everyday: reports, actions' },
  { key: 'opus', label: 'Opus 5.5', hint: 'Deep: audits, forecasts, hard questions' },
]
const uid = () => Math.random().toString(36).slice(2, 10)
const CONFIRM = /^(yes[, ]*)?(please )?(confirm(ed)?|confirm it|go ahead|do it)\.?$|^(കൺഫേം|കൺഫർം|ഉറപ്പിക്കുക|ശരി ചെയ്യൂ)\.?$/i
// Speaking costs by the character, so Oreo reads out only the first sentences (the full answer is on screen) and remembers audio it already made.
const SPOKEN_MAX = 350
function shortSpoken(text: string): string {
  if (text.length <= SPOKEN_MAX) return text
  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) || [text]
  let out = ''
  for (const sn of sentences) { if (out && out.length + sn.length > SPOKEN_MAX) break; out += sn }
  return out.slice(0, SPOKEN_MAX + 120).trim()
}
const ttsCache = new Map<string, Promise<Blob | null>>()
function cachedTts(key: string, make: () => Promise<Blob | null>): Promise<Blob | null> {
  const hit = ttsCache.get(key); if (hit) return hit
  const p = make().then(b => { if (!b) ttsCache.delete(key); return b })
  ttsCache.set(key, p); if (ttsCache.size > 40) ttsCache.delete(ttsCache.keys().next().value as string)
  return p
}

type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }

export default function OreoChat({ session, usdInr, prefill, onPrefillUsed, onChanged, active = true, onActivity }: { session: Session; usdInr: number; prefill: string; onPrefillUsed: () => void; onChanged: () => void; active?: boolean; onActivity?: (e: { type: 'ask' | 'tool' | 'end' | 'state'; text?: string; name?: string }) => void }) {
  const actRef = useRef(onActivity)
  useEffect(() => { actRef.current = onActivity })
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [model, setModelState] = useState<Tier>('haiku')
  const setModel = (t: Tier) => { setModelState(t); try { localStorage.setItem('oreo:model', t) } catch { /* not saved */ } }
  const [wakeOn, setWakeOn] = useState(false)
  const [thread, setThread] = useState<string | undefined>()
  const [lang, setLang] = useState<'en-IN' | 'ml-IN'>('en-IN')
  const [speakOn, setSpeakOn] = useState(true)
  const [handsFree, setHandsFree] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'speaking'>('idle')
  const [voiceCfg, setVoiceCfg] = useState<VoiceCfg>({ stt: 'browser', tts: 'browser' })
  const [history, setHistory] = useState<{ id: string; title: string; updated_at: string }[] | null>(null)
  const [interim, setInterim] = useState('')
  const [voiceErr, setVoiceErr] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const recog = useRef<SR | null>(null), media = useRef<{ rec: MediaRecorder; stream: MediaStream; stop: () => void } | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const stopped = useRef(false)
  const live = useRef({ msgs, thread, model, handsFree, speakOn, lang, voiceCfg })
  live.current = { msgs, thread, model, handsFree, speakOn, lang, voiceCfg }
  const orb: OreoState = voiceState === 'listening' ? 'listening' : voiceState === 'speaking' ? 'speaking' : busy ? 'thinking' : 'idle'
  useEffect(() => { actRef.current?.({ type: 'state', name: orb }) }, [orb])

  useEffect(() => {
    try {
      const m = localStorage.getItem('oreo:model'); if (m === 'auto' || m === 'haiku' || m === 'sonnet' || m === 'opus') setModelState(m)  // eslint-disable-line react-hooks/set-state-in-effect
      if (localStorage.getItem('oreo:wake') === '1') setWakeOn(true)
    } catch { /* none */ }
  }, [])
  useEffect(() => { apiGet<VoiceCfg>(session.token, '/api/oreo/voice').then(r => { if (r.ok && r.data) setVoiceCfg(r.data) }) }, [session.token])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [msgs, interim])

  const patch = useCallback((id: string, f: (m: Msg) => Msg) => setMsgs(p => p.map(m => m.id === id ? f(m) : m)), [])

  // ── speaking
  const stopSpeaking = useCallback(() => {
    stopped.current = true
    try { window.speechSynthesis?.cancel() } catch { /* none */ }
    if (audio.current) { audio.current.pause(); audio.current = null }
    setVoiceState(s => s === 'speaking' ? 'idle' : s)
  }, [])
  const afterSpeech = useCallback(() => { setVoiceState('idle'); if (live.current.handsFree) setTimeout(() => startListening(), 350) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const speak = useCallback(async (text: string) => {
    const clean = text.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim()
    if (!live.current.speakOn || !clean) { if (live.current.handsFree) afterSpeech(); return }
    stopped.current = false
    setVoiceState('speaking')
    if (live.current.voiceCfg.tts !== 'browser') {
      try {
        // Short first piece so speech starts quickly; the rest is prepared while it plays
        const sentences = shortSpoken(clean).match(/[^.!?।]+[.!?।]*\s*/g) || [clean]
        const parts: string[] = []
        for (const sn of sentences) {
          const last = parts[parts.length - 1]
          if (parts.length === 0 || (parts.length === 1 && parts[0].length < 25) || !last || last.length + sn.length > 280) parts.push(sn); else parts[parts.length - 1] = last + sn
        }
        const csrf = await csrfFor(session.token), lang = live.current.lang
        const jobs = parts.map(t => cachedTts(`${lang}|${t.trim()}`, () => fetch('/api/oreo/tts', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ text: t.trim(), lang }) }).then(r => r.ok ? r.blob() : null).catch(() => null)))
        let played = 0
        for (let i = 0; i < jobs.length; i++) {
          const blob = await jobs[i]
          if (stopped.current) return
          if (!blob) { if (i === 0) throw new Error('tts'); continue }
          const url = URL.createObjectURL(blob); const a = new Audio(url); audio.current = a
          await new Promise<void>(resolve => { a.onended = () => resolve(); a.onerror = () => resolve(); a.play().catch(() => resolve()) })
          URL.revokeObjectURL(url); played++
          if (stopped.current) return
        }
        if (played) { afterSpeech(); return }
      } catch { /* fall back to the browser voice */ }
    }
    try {
      const u = new SpeechSynthesisUtterance(clean.slice(0, 1200)); u.lang = live.current.lang
      const v = window.speechSynthesis.getVoices().find(x => x.lang === live.current.lang) || window.speechSynthesis.getVoices().find(x => x.lang.startsWith(live.current.lang.slice(0, 2)))
      if (v) u.voice = v
      u.onend = () => afterSpeech(); u.onerror = () => afterSpeech()
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
    } catch { afterSpeech() }
  }, [session.token, afterSpeech])

  // ── confirm cards
  const decide = useCallback(async (msgId: string, card: Card, decision: 'confirm' | 'cancel', via: 'button' | 'typed' | 'voice') => {
    patch(msgId, m => ({ ...m, cards: m.cards?.map(c => c.actionId === card.actionId ? { ...c, state: 'working' } : c) }))
    const r = await apiSend(session.token, 'POST', '/api/oreo/actions', { actionId: card.actionId, decision, via })
    const note = r.ok ? String(r.data?.message || '') : String(r.error || 'Failed')
    patch(msgId, m => ({ ...m, cards: m.cards?.map(c => c.actionId === card.actionId ? { ...c, state: r.ok ? (decision === 'confirm' ? 'done' : 'cancelled') : 'failed', note } : c) }))
    if (r.ok && decision === 'confirm') onChanged()
    if (via !== 'button') speak(note)
  }, [session.token, patch, onChanged, speak])
  const pendingCard = () => { for (const m of [...live.current.msgs].reverse()) { const c = m.cards?.find(x => x.state === 'pending'); if (c) return { m, c } } return null }

  // ── sending
  const send = useCallback(async (raw: string, viaVoice = false, forceModel?: Tier) => {
    const text = raw.trim(); if (!text || busy) return
    setInput(''); setInterim('')
    const pc = pendingCard()
    if (pc && CONFIRM.test(text) && Date.now() - pc.c.at < (viaVoice ? 5 : 30) * 60_000) {   // "confirm" answers the card, it is not sent to the model
      setMsgs(p => [...p, { id: uid(), role: 'user', text }])
      await decide(pc.m.id, pc.c, 'confirm', viaVoice ? 'voice' : 'typed'); return
    }
    const aid = uid()
    setMsgs(p => [...p, { id: uid(), role: 'user', text }, { id: aid, role: 'assistant', text: '', busy: true, tools: [] }])
    setBusy(true)
    actRef.current?.({ type: 'ask', text })
    try {
      const res = await fetch('/api/oreo/chat', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfFor(session.token) }, body: JSON.stringify({ message: text, model: forceModel || live.current.model, threadId: live.current.thread, voice: viaVoice }) })
      if (!res.ok || !res.body) { let m = 'Oreo could not answer'; try { m = (await res.json()).error || m } catch { /* keep */ } patch(aid, x => ({ ...x, busy: false, error: true, text: m })); setBusy(false); return }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '', final = ''
      for (;;) {
        const { value, done } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let e: any; try { e = JSON.parse(line) } catch { continue }
          if (e.type === 'thread') setThread(e.threadId)
          else if (e.type === 'tool') { actRef.current?.({ type: 'tool', name: e.name }); patch(aid, x => ({ ...x, tools: [...(x.tools || []), e.name] })) }
          else if (e.type === 'card') patch(aid, x => ({ ...x, cards: [...(x.cards || []), { actionId: e.actionId, tool: e.tool, summary: e.summary, state: 'pending', at: Date.now() }] }))
          else if (e.type === 'switch') patch(aid, x => ({ ...x, sw: { to: e.to, label: e.label, reason: e.reason, estimateUsd: e.estimateUsd }, retry: text }))
          else if (e.type === 'text') { final = e.text; patch(aid, x => ({ ...x, text: e.text })) }
          else if (e.type === 'done') patch(aid, x => ({ ...x, busy: false, cost: { usd: e.costUsd, model: e.model } }))
          else if (e.type === 'error') { patch(aid, x => ({ ...x, busy: false, error: true, text: e.message })); final = '' }
        }
      }
      patch(aid, x => ({ ...x, busy: false }))
      actRef.current?.({ type: 'end' })
      if (final) speak(viaVoice ? final : final)
      onChanged()
    } catch { patch(aid, x => ({ ...x, busy: false, error: true, text: 'The connection dropped. Please try again.' })); actRef.current?.({ type: 'end' }) }
    setBusy(false)
  }, [busy, session.token, patch, speak, decide, onChanged])

  // ── listening
  const stopListening = useCallback(() => {
    try { recog.current?.stop() } catch { /* none */ }
    media.current?.stop(); media.current = null
    setVoiceState(s => s === 'listening' ? 'idle' : s)
  }, [])
  const startListening = useCallback(async () => {
    setVoiceErr(''); stopSpeaking()
    if (live.current.voiceCfg.stt === 'browser') {
      const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
      const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition
      if (!Ctor) { setVoiceErr('This browser cannot listen. Use Chrome, or add a Sarvam key in Dev > AI keys for voice everywhere.'); return }
      const r = new Ctor(); recog.current = r; r.lang = live.current.lang; r.interimResults = true; r.continuous = false
      let heard = ''
      r.onresult = e => { const res = Array.from(e.results as unknown as ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>); heard = res.map(x => x[0].transcript).join(' '); setInterim(heard) }
      r.onerror = e => { setVoiceState('idle'); if (e.error !== 'no-speech' && e.error !== 'aborted') setVoiceErr(e.error === 'not-allowed' ? 'Allow the microphone in the browser to talk to Oreo.' : `Could not listen (${e.error})`) }
      r.onend = () => { setVoiceState(s => s === 'listening' ? 'idle' : s); if (heard.trim()) send(heard, true) }
      setVoiceState('listening'); try { r.start() } catch { setVoiceState('idle') }
      return
    }
    try {   // our own speech service: record, stop at silence, send the audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream); const chunks: Blob[] = []
      const ctx = new AudioContext(); const an = ctx.createAnalyser(); ctx.createMediaStreamSource(stream).connect(an); const data = new Uint8Array(an.fftSize)
      let spoke = false, quietSince = Date.now(); const t0 = Date.now()
      const tick = setInterval(() => {
        an.getByteTimeDomainData(data); let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        if (peak > 12) { spoke = true; quietSince = Date.now() }
        if ((spoke && Date.now() - quietSince > 1500) || Date.now() - t0 > 28_000 || (!spoke && Date.now() - t0 > 8000)) stop()
      }, 150)
      const stop = () => { clearInterval(tick); try { if (rec.state !== 'inactive') rec.stop() } catch { /* done */ } }
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); media.current = null; setVoiceState('idle')
        if (!spoke) return
        setInterim('…')
        const res = await fetch(`/api/oreo/stt?lang=${live.current.lang}`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': rec.mimeType || 'audio/webm', 'X-Audio-Seconds': String(Math.round((Date.now() - t0) / 1000)), 'X-CSRF-Token': await csrfFor(session.token) }, body: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) })
        const j = await res.json().catch(() => null); setInterim('')
        if (j?.success && j.data?.text) send(String(j.data.text), true); else setVoiceErr(j?.error || 'Could not understand the audio. Try again.')
      }
      media.current = { rec, stream, stop }; rec.start(); setVoiceState('listening')
    } catch { setVoiceErr('Allow the microphone in the browser to talk to Oreo.') }
  }, [send, stopSpeaking, session.token])

  // ── wake word: while this page is open and "Say Oreo" is on, the browser listens for the name (free, in the browser) and then Oreo wakes up
  useEffect(() => {
    if (!wakeOn || !active || voiceState !== 'idle' || busy) return
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition; if (!Ctor) return
    let alive = true, woke = false, timer: ReturnType<typeof setTimeout> | undefined
    const r = new Ctor(); r.lang = lang; r.interimResults = true; r.continuous = true
    const NAME = /\b(oreo|orio|oriyo|o\s?reo)\b|ഒറിയോ|ഓറിയോ|ഒറിയൊ|ഓറിയൊ/i
    r.onresult = e => {
      if (woke) return
      const res = Array.from(e.results as unknown as ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>)
      const last = res[res.length - 1]; const heard = last[0].transcript
      const m = heard.match(NAME); if (!m) return
      woke = true; alive = false; try { r.abort() } catch { /* done */ }
      const rest = heard.slice((m.index || 0) + m[0].length).replace(/^[\s,.!?:-]+/, '')
      if (last.isFinal && rest.split(/\s+/).filter(Boolean).length >= 3) send(rest, true); else startListening()
    }
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { alive = false; setWakeOn(false); setVoiceErr('Allow the microphone to use the wake word.') } }
    r.onend = () => { if (alive && !woke) timer = setTimeout(() => { if (alive) { try { r.start() } catch { /* retry on next change */ } } }, 400) }
    try { r.start() } catch { /* none */ }
    return () => { alive = false; clearTimeout(timer); try { r.abort() } catch { /* none */ } }
  }, [wakeOn, active, voiceState, busy, lang, send, startListening])

  const orbClick = () => { if (voiceState === 'listening') stopListening(); else if (voiceState === 'speaking') stopSpeaking(); else startListening() }
  useEffect(() => () => { try { recog.current?.abort() } catch { /* none */ } media.current?.stop(); window.speechSynthesis?.cancel() }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (prefill) { send(prefill); onPrefillUsed() } }, [prefill]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openHistory() {
    if (history) { setHistory(null); return }
    const r = await apiGet<{ threads: { id: string; title: string; updated_at: string }[] }>(session.token, '/api/oreo/threads')
    setHistory(r.ok ? r.data!.threads : [])
  }
  async function loadThread(id: string) {
    const r = await apiGet<{ messages: { id: string; role: 'user' | 'assistant'; text: string; model: string | null; cost_usd: number }[] }>(session.token, `/api/oreo/threads?id=${id}`)
    if (r.ok) { setThread(id); setHistory(null); setMsgs(r.data!.messages.map(m => ({ id: m.id, role: m.role, text: m.text, cost: m.role === 'assistant' && m.cost_usd ? { usd: Number(m.cost_usd), model: m.model || '' } : undefined }))) }
  }
  const newChat = () => { setThread(undefined); setMsgs([]); setHistory(null); stopSpeaking(); stopListening() }
  const hintFor = MODELS.find(m => m.key === model)?.hint

  return (
    <div className="flex h-full min-h-[560px] flex-col rounded-[1.75rem] border border-white/70 bg-white shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2"><OreoFace size={30} /><div><p className="text-sm font-semibold leading-tight">Ask Oreo</p><p className="text-[11px] text-soft">{voiceCfg.stt === 'browser' ? 'Browser voice' : voiceCfg.stt === 'sarvam' ? 'Sarvam voice' : 'ElevenLabs voice'}</p></div></div>
        <div className="flex items-center gap-1.5">
          <select value={model} onChange={e => setModel(e.target.value as Tier)} title={hintFor} className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold">{MODELS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
          <button onClick={openHistory} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold">History</button>
          <button onClick={newChat} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold">New</button>
        </div>
      </div>

      {history && (
        <div className="max-h-48 overflow-y-auto border-b border-black/5 bg-mist px-3 py-2">
          {history.length === 0 ? <p className="py-2 text-center text-xs text-soft">No earlier chats.</p> : history.map(h => <button key={h.id} onClick={() => loadThread(h.id)} className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white">{h.title} <span className="text-soft">· {new Date(h.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></button>)}
        </div>
      )}

      <div className="flex flex-col items-center gap-1 px-4 pt-4">
        <OreoOrb state={orb} onClick={orbClick} label="Talk to Oreo" size={msgs.length ? 104 : 150} />
        <p className="text-sm font-semibold">{orb === 'listening' ? "I'm listening" : orb === 'speaking' ? 'Speaking' : orb === 'thinking' ? 'Thinking…' : 'Tap to talk, or type below'}</p>
        <div className="flex items-center gap-1.5 text-[11px]">
          <button onClick={() => setLang(l => l === 'en-IN' ? 'ml-IN' : 'en-IN')} className="rounded-full border border-line px-2 py-0.5 font-semibold">{lang === 'en-IN' ? 'English' : 'മലയാളം'}</button>
          <button onClick={() => { setSpeakOn(v => !v); if (speakOn) stopSpeaking() }} className={`rounded-full border px-2 py-0.5 font-semibold ${speakOn ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-line text-soft'}`}>{speakOn ? 'Voice on' : 'Voice off'}</button>
          <button onClick={() => setWakeOn(v => { const n = !v; try { localStorage.setItem('oreo:wake', n ? '1' : '0') } catch { /* none */ } return n })} title="Oreo wakes up when you say its name (needs the microphone, Chrome)" className={`rounded-full border px-2 py-0.5 font-semibold ${wakeOn ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-line text-soft'}`}>{wakeOn ? 'Listening for “Oreo”' : 'Say “Oreo”'}</button>
          <button onClick={() => setHandsFree(v => !v)} title="Oreo listens again after it speaks" className={`rounded-full border px-2 py-0.5 font-semibold ${handsFree ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-line text-soft'}`}>{handsFree ? 'Hands-free on' : 'Hands-free'}</button>
        </div>
        {voiceErr && <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-center text-[11px] text-red-600">{voiceErr}</p>}
      </div>

      <div ref={scroller} className="mt-2 min-h-[140px] flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {msgs.length === 0 && (
          <div className="grid gap-1.5 pt-2">
            {['How is business today?', 'Who is overdue and for how much?', 'Show the disbursement queue', 'How is Saturday collection?'].map(q => <button key={q} onClick={() => send(q)} className="rounded-xl border border-line bg-mist px-3 py-2 text-left text-xs font-medium hover:bg-white">{q}</button>)}
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[92%] break-words rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${m.role === 'user' ? 'bg-ink text-white' : m.error ? 'bg-red-50 text-red-700' : 'bg-mist text-ink'}`}>
              {m.role === 'assistant' && (m.tools?.length || m.busy) ? <p className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-soft">{m.tools?.map((t, i) => <span key={i} className="rounded-full bg-white px-2 py-0.5">{t}</span>)}{m.busy && <span className="animate-pulse">working…</span>}</p> : null}
              {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
              {m.cards?.map(c => (
                <div key={c.actionId} className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-ink">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Needs your confirm</p>
                  <p className="mt-1 text-sm">{c.summary}</p>
                  {c.state === 'pending' && <div className="mt-2 flex gap-2">
                    <button onClick={() => decide(m.id, c, 'confirm', 'button')} className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white">Confirm</button>
                    <button onClick={() => decide(m.id, c, 'cancel', 'button')} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold">Cancel</button>
                  </div>}
                  {c.state === 'pending' && <p className="mt-1 text-[10px] text-amber-800">You can also type or say &quot;confirm&quot;.</p>}
                  {c.state === 'working' && <p className="mt-2 text-xs text-soft">Working…</p>}
                  {c.state === 'done' && <p className="mt-2 rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">Done. {c.note}</p>}
                  {c.state === 'cancelled' && <p className="mt-2 text-xs text-soft">{c.note || 'Cancelled.'}</p>}
                  {c.state === 'failed' && <p className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700">{c.note}</p>}
                </div>
              ))}
              {m.sw && (
                <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-ink">
                  <p className="text-xs">Better on <b>{m.sw.label}</b>: {m.sw.reason}. About {`₹${(m.sw.estimateUsd * usdInr).toFixed(1)}`} for an answer.</p>
                  <button onClick={() => { setModel(m.sw!.to); send(m.retry || '', false, m.sw!.to) }} className="mt-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white">Switch to {m.sw.label} and ask again</button>
                </div>
              )}
              {m.cost && m.cost.usd > 0 && <p className="mt-1 text-[10px] text-soft">{m.cost.model} · ${m.cost.usd.toFixed(4)} · ₹{(m.cost.usd * usdInr).toFixed(2)}</p>}
            </div>
          </div>
        ))}
        {interim && <div className="flex justify-end"><div className="max-w-[92%] rounded-2xl bg-ink/60 px-3 py-2 text-sm text-white">{interim}</div></div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex items-center gap-2 border-t border-black/5 p-3">
        <button type="button" onClick={orbClick} title="Talk" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${voiceState === 'listening' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-line bg-white text-ink'}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </button>
        <input data-no-upper value={input} onChange={e => setInput(e.target.value)} placeholder="Ask Oreo anything about NGF…" className="min-w-0 flex-1 rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Send</button>
      </form>
    </div>
  )
}
