// Computed guarantor commission: sum of Loans."Guarantor Commission" per guarantor.
// The Guarantors."Commission Earned" column is never maintained, so do not read it.
export function buildGuarantorEarnedMap(loans: any[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const l of loans) {
    const gid = l['Guarantor ID']
    if (!gid) continue
    const amt = Number(l['Guarantor Commission'] || 0)
    if (!Number.isFinite(amt)) continue
    map.set(gid, (map.get(gid) || 0) + amt)
  }
  return map
}

export function earnedForGuarantor(loans: any[], guarantorId: string): number {
  return buildGuarantorEarnedMap(loans).get(guarantorId) || 0
}
