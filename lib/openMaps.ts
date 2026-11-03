// "Navigate" buttons. Inside the Android app (a WebView) the Google Maps web page fails and the app shows its
// "No internet" screen, so there we hand the place to the Google Maps app itself (google.navigation: opens turn-by-turn).
// In a normal browser the usual https link is used.
export function isNativeApp(): boolean {
  try { return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() } catch { return false }
}

/** onClick for an <a href="https://www.google.com/maps/..."> : in the Android app opens the Maps app instead. */
export function openMapsClick(lat: number | null | undefined, lng: number | null | undefined) {
  return (e: { preventDefault: () => void }) => {
    if (lat == null || lng == null || !isNativeApp()) return
    e.preventDefault()
    window.location.href = `google.navigation:q=${lat},${lng}&mode=d`
  }
}
