import { selectRows, getRowById, getSupabase } from './supabase-db'
import { Session } from '../types'

// Who may read a stored file through /api/drive/[fileId].
// Admin and Staff: any file. Guarantor and Agent: only a file that is named in one of their own records
// (their leads, customers, loans, repayments and collections). Profile pictures are shown on ID cards and lists
// to every signed-in user, so the profiles bucket is open to all roles.

// The columns that can name a stored file, per table (only these tables hold file references).
const LEAD_FILE_COLS = ['customer_photo_url', 'aadhaar_front_url', 'aadhaar_back_url', 'landmark_photo_url', 'house_photo_url', 'cheque_photo_url', 'document_folder_id']

// A value for a PostgREST filter list: quoted, with the characters that mean something escaped.
// The id is matched as plain text, so `%`, `_` and `\` in it are escaped for LIKE first.
function containsFilter(column: string, text: string) {
  const like = '%' + text.replace(/[\\%_]/g, m => '\\' + m) + '%'
  return `${column}.ilike."${like.replace(/[\\"]/g, m => '\\' + m)}"`
}
const anyColumn = (cols: string[], text: string) => cols.map(c => containsFilter(c, text)).join(',')

export async function canReadFile(session: Session, fileId: string): Promise<boolean> {
  if (session.role === 'Admin' || session.role === 'Staff') return true
  if (!fileId || fileId.includes('..')) return false
  if (fileId.startsWith('supabase:profiles/')) return true

  // Which of this person's loans / leads they may open files of
  let who: { column: 'guarantor_id' | 'assigned_agent_id'; id: string }
  if (session.role === 'Guarantor') {
    const g = (await selectRows('Guarantors', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
    if (!g) return false
    // a screenshot this guarantor sent in Payment Chat
    const { data: chat } = await getSupabase().from('payment_chat').select('message_id').eq('guarantor_id', g['Guarantor ID']).like('image_url', '%' + fileId.replace(/[\\%_]/g, m => '\\' + m) + '%').limit(1)
    if (chat && chat.length) return true
    who = { column: 'guarantor_id', id: g['Guarantor ID'] }
  } else if (session.role === 'NGF AGENT') {
    const a = (await selectRows('Agents', qb => qb.eq('user_id', session.userId).limit(1))).rows[0]
    if (!a) return false
    who = { column: 'assigned_agent_id', id: a['Agent ID'] }
  } else return false

  // Ask the database whether any of their own records names this file (one row is enough)
  const leadAgentColumn = who.column === 'assigned_agent_id' ? 'assigned_agent_id' : 'guarantor_id'
  const [leadHit, repaymentHit, collectionHits] = await Promise.all([
    selectRows('Leads', qb => qb.eq(leadAgentColumn, who.id).or(anyColumn(LEAD_FILE_COLS, fileId)).limit(1)),
    selectRows('RepaymentsEnriched', qb => qb.eq(who.column, who.id).or(containsFilter('proof_file_id', fileId)).limit(1)),
    selectRows('Collections', qb => qb.or(containsFilter('proof_file_id', fileId)).limit(20)),
  ])
  if (leadHit.rows.length || repaymentHit.rows.length) return true
  // a collection record belongs to them when its loan does
  for (const c of collectionHits.rows) {
    const loan = c['Loan ID'] ? await getRowById('Loans', c['Loan ID']) : null
    if (loan && loan[who.column === 'guarantor_id' ? 'Guarantor ID' : 'Assigned Agent ID'] === who.id) return true
  }
  return false
}
