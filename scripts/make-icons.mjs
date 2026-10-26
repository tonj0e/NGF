// Builds the app icons from the NGF mark in public/ngflogo.png (run: node scripts/make-icons.mjs)
import sharp from 'sharp'

const SRC = 'public/ngflogo.png'
// the "NGF" mark on the left of the logo, with some room around it
const MARK = { left: 205, top: 375, width: 400, height: 240 }
// the app's own background (#f4f5f7), so the icons and the phone start-up screen blend in with no frame
const WHITE = { r: 244, g: 245, b: 247, alpha: 1 }

async function icon(file, size, markFraction) {
  const markW = Math.round(size * markFraction)
  // the logo file has a faint watermark: turn every very light, grey-ish pixel pure white so only the mark is left
  const raw = await sharp(SRC).extract(MARK).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < raw.data.length; i += 3) {
    const [r, g, b] = [raw.data[i], raw.data[i + 1], raw.data[i + 2]]
    if (Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 40) { raw.data[i] = 244; raw.data[i + 1] = 245; raw.data[i + 2] = 247 }
  }
  const mark = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 3 } }).resize({ width: markW }).png().toBuffer()
  const meta = await sharp(mark).metadata()
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: mark, left: Math.round((size - markW) / 2), top: Math.round((size - (meta.height || 0)) / 2) }])
    .png().toFile(file)
}

await icon('public/icons/icon-192.png', 192, 0.86)
await icon('public/icons/icon-512.png', 512, 0.86)
await icon('public/icons/maskable-512.png', 512, 0.6)      // inside the safe zone: phones crop maskable icons to a circle or rounded square
await icon('public/icons/apple-touch-icon.png', 180, 0.8)   // iPhone home screen
await icon('public/icons/favicon-32.png', 32, 0.95)
console.log('icons written')
