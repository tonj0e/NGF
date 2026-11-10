import { NextRequest } from 'next/server'
import { apiHandler, requireRole, ok, err } from '@/lib/api'
import { csrfProtection } from '@/lib/csrf'
import { createAuditLogger } from '@/lib/audit'
import { getSupabase } from '@/lib/supabase-db'
import { addBrain, updateBrain, listBrain, brainVersions, restoreBrainVersion, searchDocs, BrainKind } from '@/lib/oreo/brain'
import { dailyCapUsd, oreoSpentToday, usdInr } from '@/lib/oreo/agent'

// Oreo's brain screen: read, add, edit, approve, archive and undo. Admin only.
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])
  const sp = new URL(req.url).searchParams
  if (sp.get('versions')) return ok({ versions: await brainVersions(String(sp.get('versions'))) })
  if (sp.get('docs')) return ok({ docs: searchDocs(String(sp.get('docs')), 8) })
  if (sp.get('history')) {   // what Oreo did: every action it prepared or ran
    const { data } = await getSupabase().from('oreo_actions').select('id, tool, risk, summary, status, result, via, created_at, decided_at').order('created_at', { ascending: false }).limit(60)
    return ok({ actions: data || [] })
  }
  const [rows, cap, spent, rate, pending] = await Promise.all([
    listBrain({ kind: sp.get('kind') || undefined, status: sp.get('status') || undefined, q: sp.get('q') || undefined }),
    dailyCapUsd(), oreoSpentToday(), usdInr(),
    getSupabase().from('oreo_brain').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  return ok({ notes: rows, pendingCount: pending.count || 0, dailyCapUsd: cap, spentTodayUsd: Number(spent.toFixed(4)), usdInr: rate })
})

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['Admin'])
  const csrf = csrfProtection(req, session.userId); if (csrf) return csrf
  const b = await req.json().catch(() => ({}))
  const audit = createAuditLogger(req, session)
  switch (b.action) {
    case 'add': {
      const r = await addBrain({ kind: b.kind as BrainKind, title: String(b.title || ''), body: String(b.body || ''), pinned: !!b.pinned, source: 'owner', by: session.userId })
      if (!r.ok) return err(r.error)
      await audit.log('OREO_BRAIN_ADDED', 'OreoBrain', r.id, { kind: b.kind }); return ok({ id: r.id })
    }
    case 'update': {
      const r = await updateBrain(String(b.id), { title: b.title, body: b.body, pinned: b.pinned, kind: b.kind, status: b.status }, session.userId)
      if (!r.ok) return err(r.error || 'Could not save')
      await audit.log('OREO_BRAIN_EDITED', 'OreoBrain', String(b.id), {}); return ok({ success: true })
    }
    case 'approve': { const r = await updateBrain(String(b.id), { status: 'active' }, session.userId); if (!r.ok) return err(r.error || 'Could not save'); await audit.log('OREO_BRAIN_APPROVED', 'OreoBrain', String(b.id), {}); return ok({ success: true }) }
    case 'archive': { const r = await updateBrain(String(b.id), { status: 'archived', pinned: false }, session.userId); if (!r.ok) return err(r.error || 'Could not save'); await audit.log('OREO_BRAIN_ARCHIVED', 'OreoBrain', String(b.id), {}); return ok({ success: true }) }
    case 'restore': { const done = await restoreBrainVersion(String(b.versionId), session.userId); return done ? ok({ success: true }) : err('Version not found') }
    case 'setCap': {
      const v = Number(b.dailyCapUsd); if (!(v >= 0.1 && v <= 100)) return err('Choose a daily limit between $0.10 and $100')
      await getSupabase().from('settings').upsert({ key: 'oreo:daily_cap_usd', value: String(v), updated_at: new Date().toISOString() }); return ok({ dailyCapUsd: v })
    }
    default: return err('Unknown action')
  }
})
