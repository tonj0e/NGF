// The sign-in answer carries the person's own menu and first page (the same object GET /api/branches?self=1 returns).
// Login keeps it here for the session token it came with; AppShell uses it instead of asking the server again right
// after signing in. Kept in memory only (a reload asks the server as before). It never grants anything: the server
// still checks every request.
export type SelfAccess = { branchId: string; branchName: string; permissions: string[]; effective: string[] }

let boot: { token: string; access: SelfAccess } | null = null

export function setBootAccess(token: string, access: SelfAccess | null | undefined) {
  boot = token && access && Array.isArray(access.effective) ? { token, access } : null
}

export function bootAccessFor(token: string): SelfAccess | null {
  return boot && boot.token === token ? boot.access : null
}
