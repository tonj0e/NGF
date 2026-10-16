import { APP_CONFIG } from './config'

export type IdCardUser = {
  userId: string
  username: string
  name: string
  role: string
  code?: string
  phone?: string
  createdAt?: string
  photoDataUrl?: string
  cardNumber?: string
  guarantorId?: string
  bloodGroup?: string
  emergencyContact?: string
  place?: string
}

// Fallback 12-digit ID number derived from the user id (used when no card number)
export function buildIdNumber(userId: string): string {
  let h = 0
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (String(h) + String(userId.length * 7919)).replace(/\D/g, '').padStart(12, '0').slice(0, 12)
}

// QR payload — used to print the card and later for QR-secured login
export function idCardPayload(user: IdCardUser): string {
  return JSON.stringify({ t: 'NGF_ID', uid: user.userId, un: user.username, role: user.role, card: user.cardNumber || '' })
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

function addYearsIso(iso: string | undefined, years: number): string {
  const d = iso ? new Date(iso) : new Date()
  if (isNaN(d.getTime())) return ''
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString()
}

const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

const roleTitle: Record<string, string> = {
  Admin: 'Administrator', Guarantor: 'Guarantor', 'NGF AGENT': 'NGF AGENT', Staff: 'Branch Staff',
}

// Decorative barcode strip generated deterministically from the card number
function barcode(text: string): string {
  const s = (text || 'NGF0000').replace(/[^A-Za-z0-9]/g, '')
  let bars = ''
  // 8 thin modules per character → a dense, real-looking barcode
  for (const ch of s) {
    const v = ch.charCodeAt(0)
    for (let i = 0; i < 8; i++) {
      const w = ((v >> i) & 1) ? 2 : 1
      bars += `<i style="width:${w}px"></i><b style="width:1px"></b>`
    }
  }
  return `<div class="barcode">${bars}</div>`
}

const CARD_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; padding: 22px; background: #e5e7eb; }
  .card { width: 300px; height: 474px; border-radius: 18px; overflow: hidden; position: relative;
    background: #ffffff; color: #1a1a1a; border: 1px solid #ececec;
    box-shadow: 0 10px 30px rgba(0,0,0,.18); }
  .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 92px; background: linear-gradient(135deg, #e11d2a, #a40f18); }
  .bubble { display: none; }
  .inner { position: relative; z-index: 2; padding: 20px 18px; height: 100%; display: flex; flex-direction: column; align-items: center; }
  .brand { font-size: 16px; font-weight: 700; letter-spacing: .5px; color: #fff; }
  .brand span { color: #1a1a1a; }
  .photo { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; border: 4px solid #fff; margin: 14px 0 8px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  .photo-img { width: 100%; height: 100%; object-fit: cover; }
  .photo-initials { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 38px; font-weight: 700; background: #e11d2a; color: #fff; }
  .name { font-size: 18px; font-weight: 700; text-align: center; color: #111; }
  .role { font-size: 12px; color: #e11d2a; font-weight: 700; margin-top: 1px; }
  .id { font-size: 12px; letter-spacing: 1px; margin-top: 5px; color: #555; font-weight: 600; }
  .details { width: 100%; margin-top: auto; padding: 0 6px; display: flex; flex-direction: column; gap: 7px; }
  .drow { display: flex; justify-content: space-between; font-size: 11px; border-bottom: 1px dashed #e0e0e0; padding-bottom: 4px; }
  .drow .k { color: #888; }
  .drow .v { font-weight: 700; text-align: right; color: #111; }
  .barcode-wrap { margin-top: 16px; width: 100%; background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 6px 10px 4px; text-align: center; }
  .barcode { display: flex; height: 34px; align-items: stretch; justify-content: center; }
  .barcode i { background: #111; } .barcode b { background: #fff; }
  .barcode-num { font-size: 9px; letter-spacing: 2px; color: #111; margin-top: 3px; font-weight: 600; }
  .watermark { position: absolute; top: 56%; left: 50%; transform: translate(-50%, -50%); width: 90%; opacity: .07; z-index: 1; pointer-events: none; }
  .back-name { font-size: 15px; font-weight: 700; margin-top: 54px; color: #111; }
  .qr { background: #fff; padding: 12px; border-radius: 12px; margin-top: 24px; border: 1px solid #eee; }
  .qr img { display: block; width: 150px; height: 150px; }
  .qr-hint { font-size: 10px; color: #888; margin-top: 10px; }
  .foot { margin-top: auto; text-align: center; line-height: 1.6; }
  .foot .dates { display: flex; gap: 18px; justify-content: center; font-size: 11px; color: #555; margin-bottom: 6px; }
  .foot .dates b { color: #111; }
  .foot .org { font-size: 10px; color: #e11d2a; font-weight: 700; }
  .foot .terms { font-size: 8.5px; color: #999; margin-top: 3px; }
  @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; } }
`

export function buildIdCardHtml(user: IdCardUser, qrDataUrl: string, logoUrl = ''): string {
  const cardNo = user.cardNumber || buildIdNumber(user.userId)
  const join = fmtDate(user.createdAt) || fmtDate(new Date().toISOString())
  const expire = fmtDate(addYearsIso(user.createdAt, 2))
  const initials = (user.name || user.username || '?').trim().charAt(0).toUpperCase()
  const photo = user.photoDataUrl
    ? `<img src="${user.photoDataUrl}" class="photo-img" alt="photo" />`
    : `<div class="photo-initials">${esc(initials)}</div>`

  const detailRow = (k: string, v?: string) => v ? `<div class="drow"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>` : ''

  const watermark = logoUrl ? `<img class="watermark" src="${logoUrl}" onerror="this.style.display='none'" alt="" />` : ''

  const front = `
    <div class="card">
      ${watermark}
      <div class="inner">
        <div class="brand">${esc(APP_CONFIG.COMPANY_PREFIX)} <span>FINCORP</span></div>
        <div class="photo">${photo}</div>
        <div class="name">${esc(user.name || user.username)}</div>
        <div class="role">${esc(roleTitle[user.role] || user.role)}</div>
        <div class="id">ID. ${esc(cardNo)}</div>
        <div class="details">
          ${detailRow('Blood Group', user.bloodGroup)}
          ${detailRow('Emergency Contact', user.emergencyContact)}
          ${detailRow('Place', user.place)}
        </div>
        <div class="barcode-wrap">
          ${barcode(cardNo)}
          <div class="barcode-num">${esc(cardNo)}</div>
        </div>
      </div>
    </div>`

  const back = `
    <div class="card">
      ${watermark}
      <div class="inner">
        <div class="brand">${esc(APP_CONFIG.COMPANY_PREFIX)} <span>FINCORP</span></div>
        <div class="back-name">${esc(user.name || user.username)}</div>
        <div class="id">ID. ${esc(cardNo)}</div>
        <div class="qr"><img src="${qrDataUrl}" alt="QR" /></div>
        <div class="qr-hint">Scan to verify identity / secure login</div>
        <div class="foot">
          <div class="dates"><span>Join: <b>${join}</b></span><span>Expiry: <b>${expire}</b></span></div>
          <div class="org">${esc(APP_CONFIG.APP_NAME)}</div>
          <div class="terms">This card is property of the company. If found, please return.</div>
        </div>
      </div>
    </div>`

  return `<!doctype html><html><head><meta charset="utf-8"><title>ID Card — ${esc(user.name)}</title>
  <style>@page { size: auto; margin: 0; }${CARD_CSS}</style></head>
  <body onload="window.print()">${front}${back}</body></html>`
}
