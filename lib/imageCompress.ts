// Browser-only: shrinks a camera photo under 1 MB (largest JPEG quality that fits, longest side at most 1920 px) and reads it as a
// data: URL for the JSON upload. Used by the agent's verification form and the office's "Complete verification" form.
const MAX_BYTES = 1 * 1024 * 1024 // 1 MB

export async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      // Scale down if image is very large
      const MAX_DIM = 1920
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      // Binary search for highest quality that fits under 1MB
      let lo = 0.1, hi = 0.92, best = ''
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        const data = canvas.toDataURL('image/jpeg', mid)
        const bytes = Math.round((data.length - 22) * 3 / 4)
        if (bytes <= MAX_BYTES) { best = data; lo = mid } else { hi = mid }
      }
      if (!best) best = canvas.toDataURL('image/jpeg', 0.1)
      // Convert base64 back to File
      const arr = best.split(','), mime = 'image/jpeg'
      const bstr = atob(arr[1])
      const n = bstr.length
      const u8 = new Uint8Array(n)
      for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i)
      const compressed = new File([u8], file.name.replace(/\.[^.]+$/, '.jpg'), { type: mime })
      resolve(compressed)
    }
    // a file the browser cannot open as a picture: fail instead of waiting for ever (the form then shows the error)
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`"${file.name}" could not be read as a picture. Take or choose the photo again.`)) }
    img.src = url
  })
}

export async function fileToPayload(file: File) {
  const processed = await compressImage(file)
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error(`"${file.name}" could not be read. Take or choose the photo again.`))
    r.readAsDataURL(processed)
  })
}
