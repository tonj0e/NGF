'use client'
import { useEffect, useState } from 'react'
import SmsPanel from './SmsPanel'
import GatewayPanel from './GatewayPanel'
import IntegrationFields from './IntegrationFields'
import MonitorPanel from './MonitorPanel'
import WhatsAppPanel from './WhatsAppPanel'
import { Session } from '../../types'
import { PAYMENT_UNLOCK_KEY } from './CollectionPage'
import { PROMISSORY_TEMPLATE_KEY, DEFAULT_PROMISSORY_BODY, PROMISSORY_PLACEHOLDERS } from '../../lib/promissoryNote'
import { APP_CONFIG } from '../../lib/config'

const TRANSACTION_TABLES = ['Customers', 'Loans', 'Repayments', 'Collections', 'Settlements', 'Notifications', 'Logs', 'Leads']
const STAFF_CONFIG_TABLES = ['Agents', 'Guarantors', 'ReviewOptions', 'Capital']

export default function DevPage({ session }: { session: Session }) {
  const [subTab, setSubTab] = useState('refreshToken')

  // Dev-only user password reset (server enforces availability; UI only reflects it)
  const [pwAvail, setPwAvail] = useState<'checking' | 'yes' | 'no'>('checking')
  const [pwUser, setPwUser] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (subTab !== 'userReset') return
    setPwAvail('checking')
    fetch('/api/dev/user-password-reset', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => setPwAvail(r.ok ? 'yes' : 'no')).catch(() => setPwAvail('no'))
  }, [subTab])
  async function submitUserReset(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null); setPwBusy(true)
    try {
      const res = await fetch('/api/dev/user-password-reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pwUser.trim(), newPassword: pwNew, confirm: pwConfirm }),
      })
      const json = await res.json().catch(() => ({}))
      setPwMsg({ ok: !!json.success, text: json.success ? json.data.message : (json.error || 'Failed') })
      if (json.success) { setPwNew(''); setPwConfirm('') }
    } catch { setPwMsg({ ok: false, text: 'Network error' }) } finally { setPwBusy(false) }
  }
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'waiting' | 'done'>('idle')
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  // Clear data state
  const [selected, setSelected] = useState<Set<string>>(new Set(TRANSACTION_TABLES))
  const [confirmText, setConfirmText] = useState('')
  const [clearStatus, setClearStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [clearResults, setClearResults] = useState<Record<string, 'ok' | string> | null>(null)

  // Capital state
  const [capLoading, setCapLoading] = useState(false)
  const [capTotals, setCapTotals] = useState<any>(null)
  const [capEntries, setCapEntries] = useState<any[]>([])
  const [capType, setCapType] = useState<'Own' | 'Investor'>('Own')
  const [capContributor, setCapContributor] = useState('')
  const [capAmount, setCapAmount] = useState('')
  const [capNotes, setCapNotes] = useState('')
  const [capSaving, setCapSaving] = useState(false)

  async function loadCapital() {
    setCapLoading(true)
    try {
      const res = await fetch('/api/capital', { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success) { setCapTotals(json.data.totals); setCapEntries(json.data.entries) }
    } catch {}
    finally { setCapLoading(false) }
  }

  useEffect(() => { if (subTab === 'capital') loadCapital() }, [subTab])

  async function addCapital() {
    // Validate that we have a session token
    if (!session.token) {
      showToast('Error: No authentication token available. Please log in again.')
      return
    }

    if (capSaving) return
    const amt = Number(capAmount)
    if (!amt || amt <= 0) { showToast('Enter a valid amount.'); return }
    if (capType === 'Investor' && !capContributor.trim()) { showToast('Enter investor name.'); return }
    setCapSaving(true)
    try {
      const res = await fetch('/api/capital', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: capType, contributor: capContributor, amount: amt, notes: capNotes }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`HTTP ${res.status}: Failed to add capital. Response: ${errorText}`)
      }

      const json = await res.json()
      if (!json.success) {
        showToast(json.error || 'Failed to add.')
        return
      }
      setCapContributor(''); setCapAmount(''); setCapNotes('')
      await loadCapital()
    } catch (error) {
      console.error('Error adding capital:', error)
      showToast(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally { setCapSaving(false) }
  }

  async function deleteCapital(capitalId: string) {
    if (!confirm('Delete this capital entry?')) return
    const res = await fetch('/api/capital', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ capitalId }),
    })
    const json = await res.json()
    if (json.success) { showToast('Deleted.'); await loadCapital() }
    else showToast(json.error || 'Failed')
  }

  const capCurrency = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  // Testing flags
  const [paymentUnlock, setPaymentUnlock] = useState(false)
  useEffect(() => { setPaymentUnlock(localStorage.getItem(PAYMENT_UNLOCK_KEY) === '1') }, [])
  function togglePaymentUnlock() {
    const next = !paymentUnlock
    setPaymentUnlock(next)
    localStorage.setItem(PAYMENT_UNLOCK_KEY, next ? '1' : '0')
  }

  // Agent Trip Testing
  const [testLocation, setTestLocation] = useState<{ enabled: boolean; lat: number; lng: number }>({
    enabled: false, lat: 0, lng: 0
  })
  function applyTestLocation() {
    localStorage.setItem('ngf_last_location', JSON.stringify({ lat: testLocation.lat, lng: testLocation.lng }))
    showToast(`Test location set: ${testLocation.lat.toFixed(6)}, ${testLocation.lng.toFixed(6)}`)
  }
  function clearTestLocation() {
    localStorage.removeItem('ngf_last_location')
    setTestLocation({ enabled: false, lat: 0, lng: 0 })
    showToast('Test location cleared')
  }

  const [darkMode, setDarkMode] = useState(false)
  useEffect(() => { setDarkMode(localStorage.getItem('ngf_dark_mode') === '1') }, [])
  function toggleDarkMode() {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem('ngf_dark_mode', next ? '1' : '0')
    document.documentElement.classList.toggle('ngf-dark', next)
  }

  // QR-secured login per portal (global, server-side)
  const QR_ROLES = ['Guarantor', 'NGF AGENT', 'Staff']
  const [qrLogin, setQrLogin] = useState<Record<string, boolean>>({})
  const [deposit, setDeposit] = useState({ rate: 4, cycleDays: 122, principalWithdraw: false })
  const [recovery, setRecovery] = useState({ testEmail: '', testUntil: '', testOn: false })
  const [recMsg, setRecMsg] = useState('')
  useEffect(() => {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) { setQrLogin(j.data.qrLogin || {}); if (j.data.deposit) setDeposit(j.data.deposit); if (j.data.recovery) setRecovery(j.data.recovery) } }).catch(() => {})
  }, [])
  // Verification route planning switches (global, server-side)
  const [routeCfg, setRouteCfg] = useState({ enabled: true, windows: true, googleReady: false })
  useEffect(() => {
    fetch('/api/routes?view=config', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json()).then(j => { if (j.success) setRouteCfg(j.data) }).catch(() => {})
  }, [])
  async function toggleRoute(field: 'enabled' | 'windows') {
    const next = !routeCfg[field]
    setRouteCfg(p => ({ ...p, [field]: next }))
    await fetch('/api/settings', {
      method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: `route:${field}`, value: next ? '1' : '0' }),
    })
  }
  async function saveDepositSetting(key: string, value: string) {
    await fetch('/api/settings', {
      method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
  }
  async function saveRecovery(on: boolean) {
    setRecMsg('')
    const email = recovery.testEmail.trim()
    if (on && !/^\S+@\S+\.\S+$/.test(email)) { setRecMsg('Enter a valid email address first'); return }
    const until = on ? new Date(Date.now() + 24 * 3600_000).toISOString() : ''
    const post = (key: string, value: string) => fetch('/api/settings', {
      method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }),
    }).then(r => r.json())
    const a = await post('recovery:testEmail', email)
    const b = await post('recovery:testUntil', until)
    if (!a.success || !b.success) { setRecMsg(a.error || b.error || 'Could not save'); return }
    setRecovery({ testEmail: email, testUntil: until, testOn: on })
    setRecMsg(on ? 'On for 24 hours' : 'Off')
  }
  async function toggleQrLogin(role: string) {
    const next = !qrLogin[role]
    setQrLogin(p => ({ ...p, [role]: next }))
    await fetch('/api/settings', {
      method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: `qrlogin:${role}`, value: next ? '1' : '0' }),
    })
  }

  // Loan products
  const emptyProduct = { label: '', principal: '', durationWeeks: '', weeklyCollection: '', lastWeekCollection: '', interestDeduction: '', guarantorCommission: '' }
  const [products, setProducts] = useState<any[]>([])
  const [pForm, setPForm] = useState({ ...emptyProduct })
  const [pSaving, setPSaving] = useState(false)
  async function loadProducts() {
    try {
      const r = await fetch('/api/loan-products', {
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })

      if (!r.ok) {
        const errorText = await r.text()
        throw new Error(`HTTP ${r.status}: Failed to load products. Response: ${errorText}`)
      }

      const j = await r.json()

      if (!j.success) {
        throw new Error(j.error || 'Failed to load products')
      }

      setProducts(j.data.products || [])
    } catch (error) {
      console.error('Error loading products:', error)
      showToast(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  useEffect(() => { if (subTab === 'products') loadProducts() }, [subTab])
  async function addProduct() {
    if (pSaving) return

    // Validate that we have a session token
    if (!session.token) {
      showToast('Error: No authentication token available. Please log in again.')
      return
    }

    setPSaving(true)
    try {
      const r = await fetch('/api/loan-products', {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pForm),
      })

      if (!r.ok) {
        const errorText = await r.text()
        throw new Error(`HTTP ${r.status}: Failed to add product. Response: ${errorText}`)
      }

      const j = await r.json()
      if (j.success) {
        setPForm({ ...emptyProduct });
        loadProducts()
      } else {
        showToast(j.error || 'Failed to add')
      }
    } catch (error) {
      console.error('Error adding product:', error)
      showToast(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally { setPSaving(false) }
  }
  async function deleteProduct(key: string) {
    // Validate that we have a session token
    if (!session.token) {
      showToast('Error: No authentication token available. Please log in again.')
      return
    }

    console.log('deleteProduct: Called with key:', JSON.stringify(key), 'type:', typeof key)
    if (!confirm('Delete this loan product? Existing loans are unaffected.')) return

    // Basic validation
    if (!key || typeof key !== 'string' || !key.trim()) {
      console.log('deleteProduct: Invalid key validation failed')
      showToast('Invalid product key')
      return
    }

    const cleanKey = key.trim()
    console.log('deleteProduct: Sending DELETE request with key:', cleanKey)

    // Optimistic update: remove product from UI immediately
    setProducts(prev => prev.filter(p => p.key !== cleanKey))
    showToast('Deleting...')

    try {
      const res = await fetch('/api/loan-products', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: cleanKey }),
      })

      console.log('deleteProduct: Received response with status:', res.status)
      const responseText = await res.text()
      console.log('deleteProduct: Response body:', responseText)

      if (res.status === 401) {
        // Handle unauthorized error specifically
        // Revert optimistic update on failure by reloading from server
        loadProducts()
        showToast('Error: Unauthorized. Please log in again.')
        return
      }

      if (!res.ok) {
        // Revert optimistic update on failure by reloading from server
        loadProducts()
        showToast(`HTTP ${res.status}: ${responseText || 'Delete failed'}`)
        return
      }

      const json = JSON.parse(responseText)
      console.log('deleteProduct: Parsed JSON response:', json)
      if (json.success) {
        showToast('Deleted')
        // Keep optimistic update (already done), but verify with backend load
        loadProducts()
      } else {
        // Revert optimistic update on business logic failure by reloading from server
        loadProducts()
        showToast(json.error || 'Failed to delete')
      }
    } catch (error) {
      // Revert optimistic update on network/error by reloading from server
      console.error('deleteProduct: Catch error:', error)
      loadProducts()
      showToast(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const pWeekly = Number(pForm.weeklyCollection || 0)
  const pWeeks = Number(pForm.durationWeeks || 0)
  const pLast = pForm.lastWeekCollection === '' ? pWeekly : Number(pForm.lastWeekCollection)
  const pTotal = pWeekly * Math.max(0, pWeeks - 1) + pLast
  const pNet = Number(pForm.principal || 0) - Number(pForm.interestDeduction || 0)

  // Promissory note template
  const [noteTemplate, setNoteTemplate] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  useEffect(() => { setNoteTemplate(localStorage.getItem(PROMISSORY_TEMPLATE_KEY) || DEFAULT_PROMISSORY_BODY) }, [])
  function saveNoteTemplate() {
    localStorage.setItem(PROMISSORY_TEMPLATE_KEY, noteTemplate)
    setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2000)
  }
  function resetNoteTemplate() {
    localStorage.removeItem(PROMISSORY_TEMPLATE_KEY)
    setNoteTemplate(DEFAULT_PROMISSORY_BODY)
  }

  // Branches & staff access
  const [branches, setBranches] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [accessMap, setAccessMap] = useState<Record<string, { branchId: string; permissions: string[] }>>({})
  const [newBranch, setNewBranch] = useState('')
  const [savedUser, setSavedUser] = useState('')

  async function loadBranches() {
    const res = await fetch('/api/branches', { headers: { Authorization: `Bearer ${session.token}` } })
    const j = await res.json()
    if (j.success) {
      setBranches(j.data.branches || [])
      setStaffList(j.data.staff || [])
      const m: Record<string, { branchId: string; permissions: string[] }> = {}
      ;(j.data.access || []).forEach((a: any) => { m[a.userId] = { branchId: a.branchId, permissions: a.permissions } })
      setAccessMap(m)
    }
  }
  useEffect(() => { if (subTab === 'branches') loadBranches() }, [subTab])

  async function addBranch() {
    if (!newBranch.trim()) return
    await fetch('/api/branches', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addBranch', name: newBranch.trim() }) })
    setNewBranch(''); loadBranches()
  }
  async function deleteBranch(branchId: string) {
    if (!confirm('Delete this branch?')) return
    const res = await fetch('/api/branches', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteBranch', branchId }) })
    const json = await res.json()
    if (json.success) { showToast('Deleted.'); loadBranches() }
    else showToast(json.error || 'Failed')
  }
  function patchAccess(userId: string, patch: Partial<{ branchId: string; permissions: string[] }>) {
    setAccessMap(prev => ({ ...prev, [userId]: { branchId: prev[userId]?.branchId || '', permissions: prev[userId]?.permissions || [], ...patch } }))
  }
  function togglePerm(userId: string, key: string) {
    const cur = accessMap[userId]?.permissions || []
    patchAccess(userId, { permissions: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] })
  }
  async function saveAccess(userId: string) {
    const a = accessMap[userId] || { branchId: '', permissions: [] }
    await fetch('/api/branches', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setAccess', userId, branchId: a.branchId, permissions: a.permissions }) })
    setSavedUser(userId); setTimeout(() => setSavedUser(''), 2000)
  }

  // Calculator state
  const [calcCapital, setCalcCapital] = useState('100000')
  const [calcCash, setCalcCash] = useState('9000')
  const [calcProfit, setCalcProfit] = useState('1000')
  const [calcTerm, setCalcTerm] = useState('10')
  const [calcMode, setCalcMode] = useState<'all' | 'fixed' | 'none'>('all')
  const [calcResult, setCalcResult] = useState<any>(null)
  const [calcLoading, setCalcLoading] = useState(false)

  async function runCalc() {
    setCalcLoading(true)
    try {
      const qs = new URLSearchParams({
        capital: calcCapital, cashPerLoan: calcCash, profitPerLoan: calcProfit,
        termWeeks: calcTerm, mode: calcMode,
      })
      const res = await fetch(`/api/projection?${qs}`, { headers: { Authorization: `Bearer ${session.token}` } })
      const json = await res.json()
      if (json.success) setCalcResult(json.data)
    } catch {}
    finally { setCalcLoading(false) }
  }

  useEffect(() => { if (subTab === 'calculator' && !calcResult) runCalc() }, [subTab])

  function toggleTable(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function selectGroup(tables: string[], checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      tables.forEach(t => checked ? next.add(t) : next.delete(t))
      return next
    })
  }

  async function runClear() {
    if (confirmText !== 'CLEAR ALL') return

    // Validate that we have a session token
    if (!session.token) {
      showToast('Error: No authentication token available. Please log in again.')
      setClearStatus('error')
      return
    }

    setClearStatus('running')
    setClearResults(null)
    try {
      const res = await fetch('/api/dev/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ tables: Array.from(selected), confirm: 'CLEAR ALL' }),
      })

      if (res.status === 401) {
        // Handle unauthorized error specifically
        setClearStatus('error')
        showToast('Error: Unauthorized. Please log in again.')
        return
      }

      const json = await res.json()

      if (!res.ok) {
        setClearStatus('error')
        showToast(`Error: ${json.error || 'Failed to clear data'}`)
        return
      }

      setClearResults(json.results)
      setClearStatus('done')
      setConfirmText('')
    } catch (error) {
      console.error('Error clearing data:', error)
      setClearStatus('error')
      showToast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'oauth_token' && e.data?.refresh_token) {
        setToken(e.data.refresh_token)
        setStatus('done')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  function generateToken() {
    setStatus('waiting')
    setToken(null)
    const w = 560, h = 680
    const left = window.screenX + Math.round((window.outerWidth - w) / 2)
    const top  = window.screenY + Math.round((window.outerHeight - h) / 2)
    window.open('/api/drive/auth', 'oauth_popup',
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`)
  }

  function copyToken() {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setSubTab('refreshToken')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'refreshToken' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Refresh Token
        </button>
        <button onClick={() => setSubTab('capital')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'capital' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Capital
        </button>
        <button onClick={() => setSubTab('calculator')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'calculator' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Calculator
        </button>
        <button onClick={() => setSubTab('testing')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'testing' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Testing
        </button>
        <button onClick={() => setSubTab('sms')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'sms' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          SMS
        </button>
        <button onClick={() => setSubTab('whatsapp')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'whatsapp' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          WhatsApp
        </button>
        <button onClick={() => setSubTab('payments')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'payments' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Payments
        </button>
        <button onClick={() => setSubTab('aiReader')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'aiReader' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          AI Reader
        </button>
        <button onClick={() => setSubTab('monitor')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'monitor' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Error tracking
        </button>
        <button onClick={() => setSubTab('note')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'note' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Promissory Note
        </button>
        <button onClick={() => setSubTab('branches')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'branches' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Branches
        </button>
        <button onClick={() => setSubTab('products')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'products' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          Loan Products
        </button>
        <button onClick={() => setSubTab('userReset')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'userReset' ? 'bg-ink text-white' : 'border border-line bg-white text-soft hover:text-ink'}`}>
          User Password Reset
        </button>
        <button onClick={() => setSubTab('clearData')}
          className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${subTab === 'clearData' ? 'bg-red-600 text-white' : 'border border-red-200 bg-white text-red-600 hover:bg-red-50'}`}>
          Clear Data
        </button>
      </div>

      {subTab === 'refreshToken' && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-6">
          <div>
            <p className="text-sm font-semibold">Google OAuth Refresh Token</p>
            <p className="mt-1 text-xs text-soft">
              Used to access Google Drive for loading and uploading customer documents.
              If images stop loading with an <span className="font-mono bg-mist px-1 rounded">invalid_grant</span> error, generate a new token here.
            </p>
          </div>

          {status === 'idle' && (
            <button onClick={generateToken}
              className="rounded-2xl bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">
              Generate New Token
            </button>
          )}

          {status === 'waiting' && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-[#f9fafb] px-4 py-3">
              <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink border-t-transparent" />
              <p className="flex-1 text-sm text-soft">Complete the Google sign-in in the popup window…</p>
              <button onClick={() => setStatus('idle')}
                className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold">
                Cancel
              </button>
            </div>
          )}

          {status === 'done' && token && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                <span className="text-green-700 text-sm font-semibold">✓ New token generated successfully</span>
              </div>

              <div>
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-soft">New Refresh Token</p>
                <div className="flex items-start gap-2">
                  <div className="flex-1 break-all rounded-xl border border-line bg-[#f9fafb] px-4 py-3 font-mono text-xs text-ink">
                    {token}
                  </div>
                  <button onClick={copyToken}
                    className={`shrink-0 rounded-xl px-4 py-3 text-xs font-semibold transition ${copied ? 'bg-green-600 text-white' : 'bg-ink text-white hover:opacity-90'}`}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800">Next steps</p>
                <p className="text-xs text-amber-700">1. Copy the token above</p>
                <p className="text-xs text-amber-700">2. Update <span className="font-mono bg-amber-100 px-1 rounded">GOOGLE_OAUTH_REFRESH_TOKEN</span> in your <span className="font-mono bg-amber-100 px-1 rounded">.env.local</span> or hosting environment variables</p>
                <p className="text-xs text-amber-700">3. Restart the server for the change to take effect</p>
              </div>

              <button onClick={() => { setStatus('idle'); setToken(null) }}
                className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:bg-mist transition">
                Generate Another
              </button>
            </div>
          )}
        </div>
      )}
      {subTab === 'capital' && (
        <div className="space-y-4">
          {/* Totals */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[1.5rem] border border-white/70 bg-white shadow-panel p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-soft">Total Capital</p>
              <p className="mt-1 text-2xl font-bold">{capTotals ? capCurrency(capTotals.totalCapital) : '—'}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white shadow-panel p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-soft">Available Capital</p>
              <p className={`mt-1 text-2xl font-bold ${capTotals && capTotals.availableCapital < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {capTotals ? capCurrency(capTotals.availableCapital) : '—'}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white shadow-panel p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-soft">Interest</p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{capTotals ? capCurrency(capTotals.totalInterest) : '—'}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white shadow-panel p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-soft">Investor Money</p>
              <p className="mt-1 text-2xl font-bold">{capTotals ? capCurrency(capTotals.investorMoney) : '—'}</p>
            </div>
          </div>

          {/* Add form */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <p className="text-sm font-semibold">Add Capital</p>
            <div className="flex gap-2">
              <button onClick={() => setCapType('Own')}
                className={`flex-1 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${capType === 'Own' ? 'border-ink bg-ink text-white' : 'border-line bg-white text-soft'}`}>
                My Capital
              </button>
              <button onClick={() => setCapType('Investor')}
                className={`flex-1 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${capType === 'Investor' ? 'border-ink bg-ink text-white' : 'border-line bg-white text-soft'}`}>
                Investor
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">{capType === 'Investor' ? 'Investor Name *' : 'Name (optional)'}</span>
                <input value={capContributor} onChange={e => setCapContributor(e.target.value)}
                  placeholder={capType === 'Investor' ? 'Investor name' : 'Owner'}
                  className="w-full rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Amount *</span>
                <input type="number" value={capAmount} onChange={e => setCapAmount(e.target.value)} data-no-upper
                  placeholder="0"
                  className="w-full rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Notes (optional)</span>
              <input value={capNotes} onChange={e => setCapNotes(e.target.value)}
                className="w-full rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
            </label>
            <button onClick={addCapital} disabled={capSaving}
              className="rounded-2xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition">
              {capSaving ? 'Adding…' : 'Add Capital'}
            </button>
          </div>

          {/* Entries */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-3">
              <p className="text-sm font-semibold">Capital Entries</p>
            </div>
            {capLoading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
              </div>
            ) : capEntries.length === 0 ? (
              <p className="p-6 text-center text-sm text-soft">No capital added yet.</p>
            ) : (
              <div className="divide-y divide-black/5">
                {capEntries.map(e => (
                  <div key={e.capitalId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{e.contributor || (e.type === 'Own' ? 'Owner' : '—')}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${e.type === 'Investor' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{e.type}</span>
                      </div>
                      <p className="text-xs text-soft">{e.date}{e.notes ? ` · ${e.notes}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold">{capCurrency(e.amount)}</span>
                      <button onClick={() => deleteCapital(e.capitalId)}
                        className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {subTab === 'calculator' && (
        <div className="space-y-4">
          {/* Inputs */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold">Return Calculator</p>
              <p className="mt-1 text-xs text-soft">Compounding model — re-lends collections each week. Profit = interest taken upfront per loan.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['Capital', calcCapital, setCalcCapital],
                ['Cash / loan', calcCash, setCalcCash],
                ['Profit / loan', calcProfit, setCalcProfit],
                ['Term (weeks)', calcTerm, setCalcTerm],
              ] as const).map(([label, val, set]) => (
                <label key={label} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">{label}</span>
                  <input type="number" value={val} onChange={e => set(e.target.value)} data-no-upper
                    className="w-full rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-soft">Mode</span>
              {([['all', 'Compound (lend all)'], ['fixed', 'Fixed / week'], ['none', 'No reinvest']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCalcMode(k)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${calcMode === k ? 'bg-ink text-white' : 'border border-line bg-white text-soft'}`}>{l}</button>
              ))}
              <button onClick={runCalc} disabled={calcLoading}
                className="ml-auto rounded-2xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition">
                {calcLoading ? 'Calculating…' : 'Calculate'}
              </button>
            </div>
          </div>

          {/* Results */}
          {calcResult && (
            <>
              <div className="rounded-[1.75rem] border border-white/70 bg-gradient-to-br from-ink to-[#3b1d5e] p-6 text-white shadow-panel">
                <div className="flex items-end justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-white/60">1-Year Return</p>
                    <p className="text-4xl font-bold text-emerald-400">{calcResult.yearReturnPct}%</p>
                  </div>
                  <p className="text-xs text-white/60">{calcResult.totalLoans} loans funded · {capCurrency(calcResult.totalProfit)} profit · {calcResult.perDayPct}% / day avg</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {calcResult.periods.map((p: any) => (
                    <div key={p.label} className="rounded-2xl bg-white/10 px-3 py-3 text-center">
                      <p className="text-[11px] text-white/60">{p.label}</p>
                      <p className="mt-0.5 text-lg font-bold text-emerald-400">{p.returnPct}%</p>
                      <p className="text-[10px] text-white/50">{capCurrency(p.profit)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
                <div className="border-b border-black/5 px-5 py-3"><p className="text-sm font-semibold">Weekly Projection</p></div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-mist text-xs uppercase tracking-wider text-soft">
                      <tr><th className="px-5 py-2 text-left">Week</th><th className="px-5 py-2 text-right">Collection</th><th className="px-5 py-2 text-right">New Loans</th><th className="px-5 py-2 text-right">Cum. Profit</th></tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {calcResult.curve.map((c: any) => (
                        <tr key={c.week} className="hover:bg-[#f9fafb]">
                          <td className="px-5 py-2">{c.week}</td>
                          <td className="px-5 py-2 text-right font-medium">{capCurrency(c.collection)}</td>
                          <td className="px-5 py-2 text-right">{c.funded}</td>
                          <td className="px-5 py-2 text-right text-green-700 font-medium">{capCurrency(c.cumProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {subTab === 'testing' && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold">Testing Flags</p>
            <p className="mt-1 text-xs text-soft">Temporary switches for testing. Turn these off before going live. Stored on this device only.</p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-[#f9fafb] px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Unlock payment day</p>
              <p className="mt-0.5 text-xs text-soft">
                Allow recording collection payments on any day, bypassing the Saturday-only rule.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={paymentUnlock}
              onClick={togglePaymentUnlock}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${paymentUnlock ? 'bg-green-600' : 'bg-[#d1d5db]'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${paymentUnlock ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className={`rounded-2xl px-4 py-3 text-xs font-medium ${paymentUnlock ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-mist text-soft'}`}>
            {paymentUnlock
              ? 'Payment day is UNLOCKED — agents can record payments any day. Remember to turn this off for production.'
              : 'Payment day lock is active — payments can only be recorded on Saturday.'}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-[#f9fafb] px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Dark mode</p>
              <p className="mt-0.5 text-xs text-soft">
                Switch the interface to a dark theme. Applies on this device; photos and QR codes stay normal.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={darkMode}
              onClick={toggleDarkMode}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${darkMode ? 'bg-green-600' : 'bg-[#d1d5db]'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${darkMode ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {/* QR-secured login per portal */}
          <div className="rounded-2xl border border-line bg-[#f9fafb] px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">QR-secured login</p>
              <p className="mt-0.5 text-xs text-soft">
                When on, these portals must scan their ID-card QR after entering their password. Admin is never asked. Applies to all devices.
              </p>
            </div>
            {QR_ROLES.map(role => (
              <div key={role} className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{role}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!qrLogin[role]}
                  onClick={() => toggleQrLogin(role)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${qrLogin[role] ? 'bg-green-600' : 'bg-[#d1d5db]'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${qrLogin[role] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Password recovery test mailbox */}
          <div className="rounded-2xl border border-line bg-[#f9fafb] px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Recovery codes to one test mailbox</p>
              <p className="mt-0.5 text-xs text-soft">
                Testing only. While on, every "Forgot password" code, for any user ID, is emailed to the address below instead of the user&apos;s own. It switches itself off after 24 hours. Turn it off when testing ends.
              </p>
            </div>
            <input type="email" value={recovery.testEmail} onChange={e => setRecovery(p => ({ ...p, testEmail: e.target.value }))}
              placeholder="your email address" data-no-upper
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{recovery.testOn ? `On until ${new Date(recovery.testUntil).toLocaleString()}` : 'Off'}</span>
              <button type="button" role="switch" aria-checked={recovery.testOn} onClick={() => saveRecovery(!recovery.testOn)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${recovery.testOn ? 'bg-green-600' : 'bg-[#d1d5db]'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${recovery.testOn ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {recMsg && <p className="text-xs text-soft">{recMsg}</p>}
          </div>

          {/* Verification route planning */}
          <div className="rounded-2xl border border-line bg-[#f9fafb] px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Verification routes</p>
              <p className="mt-0.5 text-xs text-soft">
                Lets branch staff fix visit locations and order each agent's day by road distance. Road distances come from Google ({routeCfg.googleReady ? 'key found' : 'no key yet, using straight-line estimates'}).
              </p>
            </div>
            {([['enabled', 'Route planning on'], ['windows', 'Visit time windows (morning / afternoon / evening)']] as const).map(([field, label]) => (
              <div key={field} className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{label}</span>
                <button type="button" role="switch" aria-checked={routeCfg[field]} onClick={() => toggleRoute(field)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${routeCfg[field] ? 'bg-green-600' : 'bg-[#d1d5db]'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${routeCfg[field] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Agent Trip Testing */}
          <div className="rounded-2xl border border-line bg-[#f9fafb] px-5 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Agent Trip Testing</p>
              <p className="mt-0.5 text-xs text-soft">
                Manually set a fake previous location for trip distance testing. When enabled, this location will be used as the "last location" for the first verification.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Latitude</span>
                <input type="number" step="any" value={testLocation.lat} data-no-upper
                  onChange={e => setTestLocation(d => ({ ...d, lat: Number(e.target.value) }))}
                  placeholder="e.g. 9.813315"
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">Longitude</span>
                <input type="number" step="any" value={testLocation.lng} data-no-upper
                  onChange={e => setTestLocation(d => ({ ...d, lng: Number(e.target.value) }))}
                  placeholder="e.g. 76.297821"
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
              </label>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Enable test location</p>
                <p className="mt-0.5 text-xs text-soft">Use these coordinates instead of real GPS/attendance location.</p>
              </div>
              <button type="button" role="switch" aria-checked={testLocation.enabled}
                onClick={() => { const next = !testLocation.enabled; setTestLocation(d => ({ ...d, enabled: next })); if (next) applyTestLocation() }}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${testLocation.enabled ? 'bg-green-600' : 'bg-[#d1d5db]'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${testLocation.enabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <div className={`rounded-2xl px-4 py-3 text-xs font-medium ${testLocation.enabled ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-mist text-soft'}`}>
              {testLocation.enabled
                ? `Test location ACTIVE: ${testLocation.lat.toFixed(6)}, ${testLocation.lng.toFixed(6)} — will be used as previous location for next verification.`
                : 'Test location disabled — real GPS/attendance location will be used.'}
            </div>
            <button onClick={clearTestLocation}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition">
              Clear Test Location
            </button>
          </div>
        </div>
      )}
      {subTab === 'sms' && <SmsPanel session={session} />}
      {subTab === 'whatsapp' && <WhatsAppPanel session={session} />}
      {subTab === 'payments' && <GatewayPanel session={session} />}
      {subTab === 'aiReader' && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-panel space-y-3">
          <div><p className="text-sm font-semibold">AI screenshot reader</p><p className="text-xs text-soft">Keys for reading payment screenshots in Payments. Saved encrypted; the keys are never shown again. To choose which one is used, and to test a screenshot, open Payments &gt; Settings.</p></div>
          <IntegrationFields session={session} group="ai" />
        </div>
      )}

      {subTab === 'monitor' && <MonitorPanel session={session} />}

      {subTab === 'note' && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold">Promissory Note Template</p>
            <p className="mt-1 text-xs text-soft">
              Edit the body text printed on a lead&apos;s promissory note. The title, amount, place/date,
              signature and witnesses layout are fixed. Use the placeholders below — they are filled from the lead.
              Saved on this device.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PROMISSORY_PLACEHOLDERS.map(p => (
              <code key={p} className="rounded-lg bg-mist px-2 py-1 text-[11px] font-mono text-ink">{p}</code>
            ))}
          </div>

          <textarea
            value={noteTemplate}
            onChange={e => setNoteTemplate(e.target.value)}
            rows={12}
            className="w-full rounded-2xl border border-line bg-[#f9fafb] px-4 py-3 text-sm font-mono leading-relaxed outline-none focus:border-ink focus:bg-white resize-y"
          />

          <div className="flex items-center gap-2">
            <button onClick={saveNoteTemplate}
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition ${noteSaved ? 'bg-green-600' : 'bg-ink hover:opacity-90'}`}>
              {noteSaved ? 'Saved ✓' : 'Save Template'}
            </button>
            <button onClick={resetNoteTemplate}
              className="rounded-2xl border border-line bg-white px-5 py-2.5 text-sm font-semibold hover:bg-mist transition">
              Reset to Default
            </button>
          </div>
        </div>
      )}
      {subTab === 'branches' && (
        <div className="space-y-4">
          {/* Manage branches */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold">Branches</p>
              <p className="mt-1 text-xs text-soft">Create branches and assign each Staff account to one. Staff see all data; access to each feature is controlled below.</p>
            </div>
            <div className="flex gap-2">
              <input value={newBranch} onChange={e => setNewBranch(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBranch()}
                placeholder="New branch name (e.g. Chammanad)"
                className="flex-1 rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
              <button onClick={addBranch} disabled={!newBranch.trim()}
                className="rounded-2xl bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Add</button>
            </div>
            {branches.length === 0 ? (
              <p className="text-xs text-soft">No branches yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {branches.map(b => (
                  <span key={b.branchId} className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-sm">
                    {b.name}
                    <button onClick={() => deleteBranch(b.branchId)} className="text-red-500 hover:text-red-700 font-bold">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Staff access */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold">Staff Access</p>
              <p className="mt-1 text-xs text-soft">Field agents only. Staff and guarantor permissions are now set in NGF Branches: open the branch and use the edit icon on the person. Agents only use the Payment Matching options.</p>
            </div>
            {staffList.filter(u => u.role === 'NGF AGENT').length === 0 ? (
              <p className="text-xs text-soft">No field agents yet. Staff and guarantor permissions are in NGF Branches.</p>
            ) : (
              <div className="space-y-4">
                {staffList.filter(u => u.role === 'NGF AGENT').map(u => {
                  const a = accessMap[u.userId] || { branchId: '', permissions: [] }
                  return (
                    <div key={u.userId} className="rounded-2xl border border-line p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold">{u.name}</p>
                          <p className="text-xs text-soft">{u.username}{u.role === 'NGF AGENT' ? ' · Agent' : ''}</p>
                        </div>
                        <select value={a.branchId} onChange={e => patchAccess(u.userId, { branchId: e.target.value })}
                          className="rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink">
                          <option value="">No branch</option>
                          {branches.map(b => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {APP_CONFIG.STAFF_FEATURES.filter(f => u.role !== 'NGF AGENT' || (f.key.startsWith('pay') && f.key !== 'paymentLinks')).map(f => {
                          const on = a.permissions.includes(f.key)
                          return (
                            <button key={f.key} type="button" onClick={() => togglePerm(u.userId, f.key)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${on ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-line text-soft hover:bg-mist'}`}>
                              {on ? '✓ ' : ''}{f.label}
                            </button>
                          )
                        })}
                      </div>
                      <button onClick={() => saveAccess(u.userId)}
                        className={`rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${savedUser === u.userId ? 'bg-green-600' : 'bg-ink hover:opacity-90'}`}>
                        {savedUser === u.userId ? 'Saved ✓' : 'Save Access'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {subTab === 'products' && (
        <div className="space-y-4">
          {/* Add product */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold">Add Loan Product</p>
              <p className="mt-1 text-xs text-soft">
                Supports a different final-week amount. Example: ₹20,000 · ₹1,400/week · 15 weeks · last week ₹400 · ₹2,000 upfront deduction.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ['label', 'Label *', 'text'],
                ['principal', 'Principal (loan amount) *', 'number'],
                ['durationWeeks', 'Duration (weeks) *', 'number'],
                ['weeklyCollection', 'Weekly payment *', 'number'],
                ['lastWeekCollection', 'Last week payment', 'number'],
                ['interestDeduction', 'Upfront deduction', 'number'],
                ['guarantorCommission', 'Guarantor commission', 'number'],
              ] as [keyof typeof pForm, string, string][]).map(([k, l, t]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-soft">{l}</span>
                  <input type={t} value={pForm[k]} data-no-upper
                    onChange={e => setPForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={k === 'lastWeekCollection' ? 'defaults to weekly' : ''}
                    className="w-full rounded-2xl border border-line bg-mist px-4 py-2.5 text-sm outline-none focus:border-ink focus:bg-white" />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#f9fafb] px-4 py-3 text-sm">
              <span className="text-soft">Total collection: <b className="text-ink">{capCurrency(pTotal || 0)}</b></span>
              <span className="text-soft">Net disbursed: <b className="text-green-700">{capCurrency(pNet || 0)}</b></span>
            </div>
            <button onClick={addProduct} disabled={pSaving}
              className="rounded-2xl bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {pSaving ? 'Adding…' : 'Add Product'}
            </button>
          </div>

          {/* Product list */}
          <div className="rounded-[1.75rem] border border-white/70 bg-white shadow-panel overflow-hidden">
            <div className="border-b border-black/5 px-5 py-3"><p className="text-sm font-semibold">Loan Products</p></div>
            {products.length === 0 ? (
              <p className="p-6 text-center text-sm text-soft">No products.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/5 bg-[#fafafa] text-soft">
                  <tr>{['Product', 'Principal', 'Schedule', 'Upfront', 'Total', 'Net', ''].map(h => <th key={h} className="px-4 py-3 font-medium text-xs">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {products.map(p => (
                    <tr key={p.key} className="hover:bg-[#fafafa]">
                      <td className="px-4 py-3 font-medium">{p.label}</td>
                      <td className="px-4 py-3">{capCurrency(p.principal)}</td>
                      <td className="px-4 py-3 text-soft text-xs">
                        {capCurrency(p.weeklyCollection)} × {p.durationWeeks - 1}w
                        {p.lastWeekCollection !== p.weeklyCollection ? ` + ${capCurrency(p.lastWeekCollection)}` : ` + last`}
                      </td>
                      <td className="px-4 py-3 text-amber-600">{capCurrency(p.interestDeduction)}</td>
                      <td className="px-4 py-3 font-semibold">{capCurrency(p.totalCollection)}</td>
                      <td className="px-4 py-3 text-green-700">{capCurrency(p.netDisbursed)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteProduct(p.key)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {subTab === 'userReset' && (
        <div className="rounded-[1.75rem] border border-line bg-white shadow-panel p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold">User Password Reset <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Development only</span></p>
            <p className="mt-1 text-xs text-soft">
              Sets a new password for any user (including Admin) and signs out their existing sessions. Recorded in the audit log.
              Disabled by the server in production.
            </p>
          </div>
          {pwAvail === 'checking' && <p className="text-xs text-soft">Checking availability…</p>}
          {pwAvail === 'no' && (
            <p role="status" className="rounded-xl bg-mist px-4 py-3 text-sm text-soft">
              This utility is not available in this environment.
            </p>
          )}
          {pwAvail === 'yes' && (
            <form onSubmit={submitUserReset} className="space-y-3 max-w-md">
              <label className="block text-xs font-medium">Username
                <input name="resetUsername" value={pwUser} onChange={e => setPwUser(e.target.value)} data-no-upper autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-line bg-mist px-3 py-2 text-sm outline-none focus:border-ink focus:bg-white" />
              </label>
              <label className="block text-xs font-medium">New password
                <input name="resetNewPassword" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} data-no-upper autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-line bg-mist px-3 py-2 text-sm outline-none focus:border-ink focus:bg-white" />
              </label>
              <label className="block text-xs font-medium">
                Type <span className="font-mono">RESET {pwUser.trim() || '<username>'}</span> to confirm
                <input name="resetConfirm" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} data-no-upper autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-line bg-mist px-3 py-2 text-sm outline-none focus:border-ink focus:bg-white" />
              </label>
              <button type="submit" disabled={pwBusy || !pwUser.trim() || !pwNew || pwConfirm !== `RESET ${pwUser.trim()}`}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
                {pwBusy ? 'Resetting…' : 'Reset password'}
              </button>
              {pwMsg && <p role="status" className={`text-sm ${pwMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{pwMsg.text}</p>}
            </form>
          )}
        </div>
      )}

      {subTab === 'clearData' && (
        <div className="rounded-[1.75rem] border border-red-200 bg-white shadow-panel p-6 space-y-6">
          <div>
            <p className="text-sm font-semibold text-red-700">Clear Test Data</p>
            <p className="mt-1 text-xs text-soft">
              Permanently deletes all rows from selected sheets. Header rows are preserved.
              <span className="font-semibold text-red-600"> Users cannot be cleared</span> — admin login is always kept.
            </p>
          </div>

          {/* Transaction Data group */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-soft">Transaction Data</p>
              <div className="flex gap-2">
                <button onClick={() => selectGroup(TRANSACTION_TABLES, true)}
                  className="text-[10px] font-semibold text-blue-600 hover:underline">All</button>
                <button onClick={() => selectGroup(TRANSACTION_TABLES, false)}
                  className="text-[10px] font-semibold text-soft hover:underline">None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TRANSACTION_TABLES.map(t => (
                <label key={t} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 cursor-pointer hover:bg-[#f9fafb]">
                  <input type="checkbox" checked={selected.has(t)} onChange={() => toggleTable(t)}
                    className="h-3.5 w-3.5 accent-red-600" />
                  <span className="text-xs font-medium">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Staff & Config group */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-soft">Staff &amp; Config</p>
              <div className="flex gap-2">
                <button onClick={() => selectGroup(STAFF_CONFIG_TABLES, true)}
                  className="text-[10px] font-semibold text-blue-600 hover:underline">All</button>
                <button onClick={() => selectGroup(STAFF_CONFIG_TABLES, false)}
                  className="text-[10px] font-semibold text-soft hover:underline">None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STAFF_CONFIG_TABLES.map(t => (
                <label key={t} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 cursor-pointer hover:bg-[#f9fafb]">
                  <input type="checkbox" checked={selected.has(t)} onChange={() => toggleTable(t)}
                    className="h-3.5 w-3.5 accent-red-600" />
                  <span className="text-xs font-medium">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Selected summary */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">
              {selected.size === 0 ? 'No tables selected' : `Will clear ${selected.size} table${selected.size > 1 ? 's' : ''}: ${Array.from(selected).join(', ')}`}
            </p>
          </div>

          {/* Confirmation */}
          <div className="space-y-2">
            <p className="text-xs text-soft">
              Type <span className="font-mono font-semibold bg-mist px-1.5 py-0.5 rounded">CLEAR ALL</span> to confirm
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => { setConfirmText(e.target.value); setClearStatus('idle') }}
              placeholder="CLEAR ALL"
              className="w-full rounded-xl border border-line bg-[#f9fafb] px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-red-400"
            />
          </div>

          {clearStatus === 'done' && clearResults && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-green-800">Done — results:</p>
              {Object.entries(clearResults).map(([t, r]) => (
                <p key={t} className={`text-xs font-mono ${r === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
                  {r === 'ok' ? '✓' : '✗'} {t}{r !== 'ok' ? ` — ${r}` : ''}
                </p>
              ))}
            </div>
          )}

          {clearStatus === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold text-red-700">Something went wrong. Check the server logs.</p>
            </div>
          )}

          <button
            onClick={runClear}
            disabled={confirmText !== 'CLEAR ALL' || selected.size === 0 || clearStatus === 'running'}
            className="flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {clearStatus === 'running' && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {clearStatus === 'running' ? 'Clearing…' : 'Clear Selected Data'}
          </button>
        </div>
      )}
    </div>
  )
}
