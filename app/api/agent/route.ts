import { NextRequest } from 'next/server'
import { apiHandler, ok, err, requireRole } from '@/lib/api'
import { readTable, countRows } from '@/lib/supabase-db'
import { companyTotals } from '@/lib/db'
import { getTodayIST } from '@/lib/dateUtils'

const FEATURE_KEYS = ['enabled', 'voice', 'finance', 'collections', 'payouts', 'capital', 'reports', 'approvals'] as const

function getValue(rows: any[], key: string, fallback: string): string {
  return rows.find(r => r['Key'] === key)?.['Value'] ?? fallback
}

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole(req, ['Admin'])

  const body = await req.json().catch(() => ({}))
  const message = String(body.message || '').trim()
  const language = String(body.language || 'English')
  if (!message) return err('Message is required')

  const settingsRows = await readTable('Settings')
  const agentEnabled = getValue(settingsRows, 'agent:enabled', '1') === '1'
  if (!agentEnabled) return err('Admin agent is disabled in Dev → Agent')

  const enabledFeatures: Record<string, boolean> = {}
  for (const key of FEATURE_KEYS) {
    enabledFeatures[key] = getValue(settingsRows, `agent:${key}`, '1') === '1'
  }

  // figures come from the database (counts and sums), not from downloading every table
  const today = getTodayIST()
  const [totals, capital, activeLoanCount, activeCustomerCount, pendingLeadCount] = await Promise.all([
    companyTotals(), readTable('Capital'),
    countRows('Loans', qb => qb.eq('status', 'Active')), countRows('Customers', qb => qb.eq('status', 'Active')), countRows('Leads', qb => qb.eq('status', 'Pending')),
  ])
  const totalCapital = capital.reduce((sum, r) => sum + Number(r['Amount'] || 0), 0)
  const principalOutstanding = totals.activePrincipal
  const totalCollected = totals.paidTotal
  const totalInterest = totals.totalInterest
  const totalPayouts = capital.filter(c => c['Type'] === 'Investor').reduce((sum, c) => sum + Number(c['Amount'] || 0), 0)

  const snapshot = {
    date: today,
    activeLoans: activeLoanCount,
    activeCustomers: activeCustomerCount,
    pendingLeads: pendingLeadCount,
    overdueRepayments: totals.overdueCount,
    overdueAmount: totals.overdueAmount,
    totalCapital,
    principalOutstanding,
    totalCollected,
    totalInterest,
    totalPayouts,
    enabledFeatures,
  }

  const apiKey = process.env.NVIDIA_API_KEY
  const baseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')
  const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b'

  if (!apiKey) return err('NVIDIA API key is missing. Add NVIDIA_API_KEY to the environment.')

  const languageInstruction: Record<string, string> = {
    English: 'Answer in English.',
    Hindi: 'Answer in Hindi.',
    Malayalam: 'Answer in Malayalam.',
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: [
            'You are the NGF FINCORP admin finance assistant.',
            'Act like a chartered-accountant-level analyst and finance operations adviser.',
            'Use the provided CRM snapshot and answer in a professional, spoken-friendly tone.',
            'Keep your answer concise, structured, and useful for admin decision-making.',
            'If the user asks for action, propose a reasonable next step but do not claim you executed anything.',
            'Never claim privileged or hidden information beyond the data provided.',
            languageInstruction[language] || 'Answer in English.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `User question: ${message}\n\nFinance snapshot: ${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    return err(data?.error?.message || 'NVIDIA model request failed', response.status)
  }

  const reply = data?.choices?.[0]?.message?.content || 'No response received from the model.'

  return ok({
    reply,
    model,
    snapshot,
    enabledFeatures,
    voiceEnabled: enabledFeatures.voice,
  })
})
