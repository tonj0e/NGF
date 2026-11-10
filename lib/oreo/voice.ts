import { getConfig } from '@/lib/integrations'
import { getSupabase } from '@/lib/supabase-db'
import { logAiUsage } from '@/lib/slipReader'
import { usdInr } from './agent'

// Oreo's voice: listening (speech to text) and speaking (text to speech). Sarvam AI is best for Malayalam and the other Indian languages,
// ElevenLabs for natural English. Without a key the screen falls back to the browser's own speech. Costs are logged as category "Oreo (voice)".
// Prices (checked 2026-11-10): Sarvam listening ₹0.49 a minute, Bulbul v3 speaking ₹3 per 1,000 characters; ElevenLabs Scribe $0.22 an hour, speaking $0.04 to $0.08 per 1,000 characters.
export type VoiceProvider = 'sarvam' | 'elevenlabs'
export type VoiceStatus = { stt: VoiceProvider | 'browser'; tts: VoiceProvider | 'browser'; sarvam: boolean; elevenlabs: boolean }

async function preferred(): Promise<'auto' | VoiceProvider> {
  const { data } = await getSupabase().from('settings').select('value').eq('key', 'oreo:voice_provider').maybeSingle()
  return data?.value === 'sarvam' || data?.value === 'elevenlabs' ? data.value : 'auto'
}
export async function voiceStatus(): Promise<VoiceStatus> {
  const [sv, el, pref] = await Promise.all([getConfig('SARVAM_API_KEY'), getConfig('ELEVENLABS_API_KEY'), preferred()])
  const has = { sarvam: !!sv, elevenlabs: !!el }
  const pick = (): VoiceProvider | 'browser' => pref !== 'auto' && has[pref] ? pref : has.sarvam ? 'sarvam' : has.elevenlabs ? 'elevenlabs' : 'browser'
  return { stt: pick(), tts: pick(), ...has }
}

export async function speechToText(audio: Buffer, mime: string, lang: 'en-IN' | 'ml-IN', audioSeconds: number, userId: string): Promise<{ text: string; provider: VoiceProvider }> {
  const st = await voiceStatus(), rate = await usdInr()
  const order: VoiceProvider[] = st.stt === 'elevenlabs' ? ['elevenlabs', 'sarvam'] : ['sarvam', 'elevenlabs']
  let lastErr = 'No voice service is set up'
  for (const prov of order) {
    if (!st[prov]) continue
    const t0 = Date.now()
    try {
      let text = ''
      const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'webm'
      const form = new FormData(); form.append('file', new Blob([new Uint8Array(audio)], { type: mime || 'audio/webm' }), `speech.${ext}`)
      if (prov === 'sarvam') {
        form.append('model', 'saaras:v4'); form.append('language_code', lang)
        const r = await fetch('https://api.sarvam.ai/speech-to-text', { method: 'POST', headers: { 'api-subscription-key': await getConfig('SARVAM_API_KEY') }, body: form, signal: AbortSignal.timeout(45_000) })
        const j = await r.json().catch(() => null) as { transcript?: string; error?: { message?: string } } | null
        if (!r.ok) throw new Error(`Sarvam ${r.status}: ${j?.error?.message || 'failed'}`)
        text = String(j?.transcript || '')
      } else {
        form.append('model_id', 'scribe_v2'); form.append('language_code', lang.slice(0, 2))
        const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': await getConfig('ELEVENLABS_API_KEY') }, body: form, signal: AbortSignal.timeout(45_000) })
        const j = await r.json().catch(() => null) as { text?: string; detail?: { message?: string } | string } | null
        if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${typeof j?.detail === 'string' ? j.detail : j?.detail?.message || 'failed'}`)
        text = String(j?.text || '')
      }
      const cost = prov === 'sarvam' ? (0.49 * audioSeconds / 60) / rate : 0.22 * audioSeconds / 3600
      await logAiUsage({ provider: prov, model: prov === 'sarvam' ? 'saaras:v4 (listening, seconds)' : 'scribe_v2 (listening, seconds)', ctx: { purpose: 'oreo_voice', userId }, tokensIn: audioSeconds, cost, ms: Date.now() - t0, status: 'ok' })
      return { text: text.trim(), provider: prov }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      await logAiUsage({ provider: prov, model: 'listening', ctx: { purpose: 'oreo_voice', userId }, ms: Date.now() - t0, status: 'error', error: lastErr })
    }
  }
  throw new Error(lastErr)
}

export async function textToSpeech(text: string, lang: 'en-IN' | 'ml-IN', userId: string): Promise<{ audio: Buffer; mime: string; provider: VoiceProvider }> {
  const st = await voiceStatus(), rate = await usdInr()
  const clean = text.slice(0, 2400)
  // Malayalam: Sarvam Bulbul v3 first (ElevenLabs needs its v4 models); English: ElevenLabs first when it is set up
  const order: VoiceProvider[] = lang === 'ml-IN' ? ['sarvam', 'elevenlabs'] : st.tts === 'sarvam' ? ['sarvam', 'elevenlabs'] : ['elevenlabs', 'sarvam']
  let lastErr = 'No voice service is set up'
  for (const prov of order) {
    if (!st[prov]) continue
    const t0 = Date.now()
    try {
      if (prov === 'sarvam') {
        const r = await fetch('https://api.sarvam.ai/text-to-speech', { method: 'POST', headers: { 'api-subscription-key': await getConfig('SARVAM_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean, language_code: lang, model: 'bulbul:v3', speaker: 'shubh', output_audio_codec: 'mp3', speech_sample_rate: 24000 }), signal: AbortSignal.timeout(45_000) })
        const j = await r.json().catch(() => null) as { audios?: string[]; error?: { message?: string } } | null
        if (!r.ok || !j?.audios?.length) throw new Error(`Sarvam ${r.status}: ${j?.error?.message || 'no audio'}`)
        await logAiUsage({ provider: 'sarvam', model: 'bulbul:v3 (speaking, characters)', ctx: { purpose: 'oreo_voice', userId }, tokensOut: clean.length, cost: (3 * clean.length / 1000) / rate, ms: Date.now() - t0, status: 'ok' })
        return { audio: Buffer.from(j.audios.join(''), 'base64'), mime: 'audio/mpeg', provider: 'sarvam' }
      }
      const voice = (await getConfig('ELEVENLABS_VOICE_ID')) || '21m00Tcm4TlvDq8ikWAM'
      const model = lang === 'ml-IN' ? 'eleven_v4' : 'eleven_flash_v2_5'
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': await getConfig('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean, model_id: model, ...(lang === 'ml-IN' ? { language_code: 'ml' } : {}) }), signal: AbortSignal.timeout(45_000) })
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`)
      await logAiUsage({ provider: 'elevenlabs', model: `${model} (speaking, characters)`, ctx: { purpose: 'oreo_voice', userId }, tokensOut: clean.length, cost: (model === 'eleven_v4' ? 0.08 : 0.04) * clean.length / 1000, ms: Date.now() - t0, status: 'ok' })
      return { audio: Buffer.from(await r.arrayBuffer()), mime: 'audio/mpeg', provider: 'elevenlabs' }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      await logAiUsage({ provider: prov, model: 'speaking', ctx: { purpose: 'oreo_voice', userId }, ms: Date.now() - t0, status: 'error', error: lastErr })
    }
  }
  throw new Error(lastErr)
}
