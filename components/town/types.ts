export interface TownPerson { userId: string; name: string; roleInBranch: string }
export interface TownGuarantor { guarantorId: string; name: string; code: string }
export interface TownBranch {
  branchId: string; name: string; status: string
  staff: TownPerson[]; guarantors: TownGuarantor[]
}
export interface TownHover { kind: 'branch' | 'person' | 'camera'; title: string; sub: string; x: number; y: number }

/** A fixed viewpoint inside the office. These double as the future CCTV camera positions. */
export const OFFICE_VIEWS = [
  { key: 'outside', label: 'Outside' },
  { key: 'overview', label: 'Overview' },
  { key: 'reception', label: 'Waiting area' },
  { key: 'counter', label: 'Cash counter' },
  { key: 'glass', label: 'Glass section' },
  { key: 'manager', label: 'Manager cabin' },
  { key: 'top', label: 'Top view' },
] as const
export type OfficeViewKey = typeof OFFICE_VIEWS[number]['key']
