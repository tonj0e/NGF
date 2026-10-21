'use client'
import { useState, useEffect, useRef } from 'react'
import { Session } from '@/types'
import { APP_CONFIG } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetClose } from '@/components/ui/sheet'
import { Menu, X, Bell, User, LogOut, LayoutDashboard, Users, FileText, Truck, BarChart3, LandPlot, Upload, CreditCard, Settings, Shield, MessageSquare, MapPin, ClipboardList, Wallet, History, Sparkles, HelpCircle, ChevronLeft, ChevronRight, DollarSign, Coins, Banknote, Pin, PinOff, PieChart, TrendingUp, Route as RouteIcon, Navigation, Building2, Link2 } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import LeadsPage from './pages/LeadsPage'
import StaffPage from './pages/StaffPage'
import RepayPage from './pages/RepayPage'
import NotificationsPage from './pages/NotificationsPage'
import SubmitLeadPage from './pages/SubmitLeadPage'
import VerificationsPage from './pages/VerificationsPage'
import TripDetailsPage from './pages/TripDetailsPage'
import CollectionsPage from './pages/CollectionsPage'
import CustomersPage from './pages/CustomersPage'
import LoansPage from './pages/LoansPage'
import ChequesPledgedPage from './pages/ChequesPledgedPage'
import ReportsPage from './pages/ReportsPage'
import CommissionsPage from './pages/CommissionsPage'
import PayoutRequestsPage from './pages/PayoutRequestsPage'
import PastMonthCollectionPage from './pages/PastMonthCollectionPage'
import ImportCustomerPage from './pages/ImportCustomerPage'
import CollectionPage from './pages/CollectionPage'
import SettlementsPage from './pages/SettlementsPage'
import PaymentMatchingPage from './pages/PaymentMatchingPage'
import VisitRoutesPage from './pages/VisitRoutesPage'
import MyRoutePage from './pages/MyRoutePage'
import ReviewOptionsPage from './pages/ReviewOptionsPage'
import MyCustomersPage from './pages/MyCustomersPage'
import DevPage from './pages/DevPage'
import GuarantorPage from './pages/GuarantorPage'
import MyIdCardPage from './pages/MyIdCardPage'
import DepositsPage from './pages/DepositsPage'
import AgentLocationPage from './pages/AgentLocationPage'
import AgentTrackingPage from './pages/AgentTrackingPage'
import BranchTownPage from './pages/BranchTownPage'
import PaymentLinksPage from './pages/PaymentLinksPage'

function MenuIcon({ name }: { name: string }) {
  const icons: Record<string, React.ElementType> = {
    dashboard: LayoutDashboard,
    customers: Users,
    leads: FileText,
    collection: Coins,
    reports: BarChart3,
    settlements: LandPlot,
    importCustomer: Upload,
    payoutRequests: CreditCard,
    staff: Settings,
    town: Building2,
    payLinks: Link2,
    guarantors: Shield,
    reviewOptions: ClipboardList,
    notifications: Bell,
    agent: Sparkles,
    agentTracking: MapPin,
    dev: HelpCircle,
    verifications: ClipboardList,
    commissions: Wallet,
    myCustomers: Users,
    myIdCard: CreditCard,
    deposits: LandPlot,
    location: MapPin,
    tripDetails: History,
    financialAnalytics: PieChart,
    payments: Banknote,
    routes: RouteIcon,
    myRoute: Navigation,
  }
  const Icon = icons[name] || LayoutDashboard
  return <Icon className="h-5 w-5 shrink-0" />
}

const MENUS: Record<string, { key: string; label: string }[]> = {
  Admin: [
    { key: 'dashboard',      label: 'Dashboard' },
    { key: 'customers',      label: 'Customers' },
    { key: 'leads',          label: 'Leads' },
    { key: 'routes',         label: 'Visit Routes' },
    { key: 'collection',     label: 'Collection' },
    { key: 'reports',        label: 'Reports' },
    { key: 'financialAnalytics', label: 'Financial Analytics' },
    { key: 'settlements',    label: 'Settlements' },
    { key: 'payments',       label: 'Payment Matching' },
    { key: 'payLinks',       label: 'Payment Links' },
    { key: 'importCustomer', label: 'Import Customer' },
    { key: 'payoutRequests', label: 'Payout Requests' },
    { key: 'staff',          label: 'NGF Branches' },
    { key: 'town',           label: 'Branch Town' },
    { key: 'guarantors',     label: 'Guarantors' },
    { key: 'reviewOptions',  label: 'Review Options' },
    { key: 'notifications',  label: 'Notifications' },
    { key: 'agentTracking',  label: 'Agent Tracking' },
    { key: 'dev',            label: 'Dev' },
  ],
  Guarantor: [
    { key: 'dashboard',     label: 'Dashboard' },
    { key: 'leads',         label: 'Leads' },
    { key: 'collection',    label: 'Collection' },
    { key: 'payments',      label: 'UPI Payments' },
    { key: 'payLinks',      label: 'Send Payment Link' },
    { key: 'commissions',   label: 'Commissions' },
    { key: 'deposits',      label: 'Deposits' },
    { key: 'myCustomers',   label: 'My Customers' },
    { key: 'myIdCard',      label: 'My ID Card' },
    { key: 'notifications', label: 'Notifications' },
  ],
  'NGF AGENT': [
    { key: 'verifications', label: 'Assigned Verifications' },
    { key: 'myRoute',       label: 'My Route' },
    { key: 'customers',     label: 'Assigned Customers' },
    { key: 'collection',    label: 'Collection' },
    { key: 'tripDetails',   label: 'Trip Details' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'location',      label: 'Live Location' },
  ],
  Staff: [
    { key: 'collection',    label: 'Collection' },
    { key: 'notifications', label: 'Notifications' },
  ],
}

// Pages this role can open. The current page is kept in the address (#leads) so a browser refresh, or the back
// button, returns to the same page instead of the first menu item. The server still checks every request.
function roleViews(role: string): Set<string> {
  return new Set([
    ...(MENUS[role] || []).map(m => m.key),
    ...(role === 'Staff' ? APP_CONFIG.STAFF_FEATURES.map(f => f.view).filter(Boolean) : []),
    ...(role === 'NGF AGENT' || role === 'Guarantor' ? ['payments'] : []),
    ...(role === 'Guarantor' ? ['myIdCard', 'myCustomers'] : []),
    'notifications',
  ] as string[])
}
function viewFromHash(role: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const key = decodeURIComponent(window.location.hash.slice(1))
    return key && roleViews(role).has(key) ? key : ''
  } catch { return '' }
}

export default function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const defaultView = session.role === 'Staff' ? 'notifications' : (MENUS[session.role]?.[0]?.key || 'dashboard')
  const restoredView = useRef(viewFromHash(session.role))
  const [view, setViewState] = useState(restoredView.current || defaultView)
  const setView = (key: string, replace = false) => {
    setViewState(key)
    try {
      if (window.location.hash !== `#${key}`) window.history[replace ? 'replaceState' : 'pushState'](null, '', `#${key}`)
    } catch {}
  }
  // the address always names the current page; the back and forward buttons move between pages
  useEffect(() => {
    try { if (window.location.hash !== `#${view}`) window.history.replaceState(null, '', `#${view}`) } catch {}
    const onPop = () => setViewState(viewFromHash(session.role) || defaultView)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [staffPerms, setStaffPerms] = useState<string[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  // Apply the saved dark-mode preference (toggled from the Dev page)
  useEffect(() => {
    document.documentElement.classList.toggle('ngf-dark', localStorage.getItem('ngf_dark_mode') === '1')
  }, [])

  // Staff menu is built from the features granted in Dev → Branches
  useEffect(() => {
    if (session.role !== 'Staff' && session.role !== 'NGF AGENT' && session.role !== 'Guarantor') return
    fetch('/api/branches?self=1', { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(j => {
        if (!j.success) return
        const perms = j.data.permissions || []
        setStaffPerms(perms)
        if (session.role === 'Guarantor') {
          // pages an Admin switched off for this guarantor; the first allowed page opens
          if (perms.includes('pages:custom')) {
            const first = (MENUS.Guarantor || []).find(m => m.key === 'notifications' || perms.includes(`gp:${m.key}`) || (m.key === 'payments' && perms.includes('upiPayments')))
            if (first && !restoredView.current && !(MENUS.Guarantor || []).some(m => m.key === 'dashboard' && perms.includes('gp:dashboard'))) setView(first.key, true)
          }
          return
        }
        if (session.role !== 'Staff') return
        const allowed = ['notifications', ...APP_CONFIG.STAFF_FEATURES.filter(f => f.view && perms.includes(f.key)).map(f => f.view)]
        if (restoredView.current && allowed.includes(restoredView.current)) return
        const first = APP_CONFIG.STAFF_FEATURES.find(f => f.view && perms.includes(f.key))
        setView(first ? first.view : 'notifications', true)
      })
      .catch(() => {})
  }, [])

  // Handle hover expand/collapse with debounce to prevent flickering
  useEffect(() => {
    if (sidebarPinned) return
    let timeoutId: NodeJS.Timeout
    if (sidebarHovered) {
      timeoutId = setTimeout(() => setSidebarCollapsed(false), 50)
    } else {
      timeoutId = setTimeout(() => setSidebarCollapsed(true), 150)
    }
    return () => clearTimeout(timeoutId)
  }, [sidebarHovered, sidebarPinned])

  const staffMenu = [
    ...APP_CONFIG.STAFF_FEATURES.filter(f => f.view && staffPerms.includes(f.key)).map(f => ({ key: f.view, label: f.label })),
    { key: 'notifications', label: 'Notifications' },
  ]
  const agentMenu = [
    ...(MENUS['NGF AGENT'] || []),
    ...(staffPerms.includes('upiPayments') ? [{ key: 'payments', label: 'Payment Matching' }] : []),
  ]
  const guarantorMenu = (MENUS.Guarantor || []).filter(m =>
    !staffPerms.includes('pages:custom') || m.key === 'notifications' || staffPerms.includes(`gp:${m.key}`) || (m.key === 'payments' && staffPerms.includes('upiPayments')))
  const menu = session.role === 'Staff' ? staffMenu : session.role === 'NGF AGENT' ? agentMenu : session.role === 'Guarantor' ? guarantorMenu : (MENUS[session.role] || [])
  const pageTitle = menu.find(m => m.key === view)?.label || view
  const PageIcon = MenuIcon

  function renderPage() {
    // a Guarantor must not reach a page an Admin switched off, even if view state points at it
    if (session.role === 'Guarantor' && staffPerms.includes('pages:custom')
      && (MENUS.Guarantor || []).some(m => m.key === view) && !guarantorMenu.some(m => m.key === view)) {
      const home = guarantorMenu.find(m => m.key === 'dashboard')
      return home ? <Dashboard session={session} /> : <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 text-sm text-[#697586]">You do not have access to this page.</div>
    }
    switch (view) {
      case 'dashboard':    return <Dashboard session={session} />
      case 'customers':    return <CustomersPage session={session} />
      case 'leads':        return <LeadsPage session={session} />
      case 'submitLead':   return <SubmitLeadPage session={session} onDone={() => setView('leads')} />
      case 'activeLoans':  return <LoansPage session={session} defaultFilter="active" />
      case 'overdueLoans': return <LoansPage session={session} defaultFilter="overdue" />
      case 'renewals':     return <LoansPage session={session} defaultFilter="renewal" />
      case 'completedLoans': return <LoansPage session={session} defaultFilter="completed" />
      case 'cheques':      return <ChequesPledgedPage session={session} />
      case 'repayments':   return <RepayPage session={session} mode="all" />
      case 'today':        return <RepayPage session={session} mode="today" />
      case 'saturday':     return <RepayPage session={session} mode="saturday" />
      case 'collection':   return <CollectionPage session={session} />
      case 'settlements':  return <SettlementsPage session={session} />
      case 'payments':     return <PaymentMatchingPage session={session} />
      case 'routes':       return <VisitRoutesPage session={session} />
      case 'myRoute':      return <MyRoutePage session={session} onOpenVerification={() => setView('verifications')} />
      case 'reviewOptions': return <ReviewOptionsPage session={session} />
      case 'pastMonth':    return <PastMonthCollectionPage session={session} />
      case 'collections':  return <CollectionsPage session={session} />
      case 'reports':      return <ReportsPage session={session} />
      case 'staff':        return <StaffPage session={session} />
      case 'payLinks':     return <PaymentLinksPage session={session} />
      case 'town':         return session.role === 'Admin' ? <BranchTownPage session={session} /> : null
      case 'verifications': return <VerificationsPage session={session} />
      case 'tripDetails': return <TripDetailsPage session={session} />
      case 'commissions':  return <CommissionsPage session={session} />
      case 'payoutRequests': return <PayoutRequestsPage session={session} />
      case 'importCustomer': return <ImportCustomerPage session={session} />
      case 'myCustomers':   return <MyCustomersPage session={session} />
      case 'notifications': return <NotificationsPage session={session} />
      case 'guarantors':    return <GuarantorPage session={session} />
      case 'myIdCard':      return <MyIdCardPage session={session} />
      case 'deposits':      return <DepositsPage session={session} />
      case 'agentTracking':  return <AgentTrackingPage session={session} />
      case 'location':       return <AgentLocationPage session={session} />
      case 'dev':           return <DevPage session={session} />
      case 'financialAnalytics': return <Dashboard session={session} />
      default: return <div className="p-6 text-sm text-[#697586]">Coming soon.</div>
    }
  }

  const handleLogout = () => {
    onLogout()
  }

  return (
    <div className="flex h-screen w-full bg-[#f4f5f7]">
{/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" hideClose className="h-dvh w-[80vw] max-w-[320px] p-0 lg:hidden">
          <div className="flex h-full flex-col">
            <div className="border-b border-[#e5e7eb] px-4 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold leading-tight tracking-wide">NGF FINCORP</h1>
                <p className="mt-0.5 text-xs text-[#697586]">{session.role} portal</p>
              </div>
              <SheetClose
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </SheetClose>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-0.5">
                {menu.map(item => (
                  <Button
                    key={item.key}
                    onClick={() => { setView(item.key); setMobileOpen(false) }}
                    variant={view === item.key ? 'default' : 'ghost'}
                    className="w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                  >
                    <MenuIcon name={item.key} />
                    {item.label}
                  </Button>
                ))}
              </div>
            </nav>
            <div className="border-t border-[#e5e7eb] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={session.photo} alt={session.name} />
                  <AvatarFallback name={session.name} />
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.name}</p>
                  <p className="text-xs text-[#697586] truncate">{session.username}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full justify-start gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex h-screen w-full flex-1">
        {/* Desktop Sidebar */}
        <aside
          className={`glass-panel flex flex-col transition-all duration-250 border-r border-[#e5e7eb] hidden lg:flex ${sidebarCollapsed ? 'w-14' : 'w-64'}`}
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <div className={`border-b border-[#e5e7eb] px-3 py-4 transition-all duration-250 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            {!sidebarCollapsed ? (
              <>
                <h1 className="text-xl font-bold leading-tight tracking-wide">NGF FINCORP</h1>
                <p className="mt-0.5 text-xs text-[#697586]">{session.role} portal</p>
              </>
            ) : (
              <h1 className="text-xl font-bold leading-tight tracking-wide text-center">NGF</h1>
            )}
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-2">
            <div className="space-y-1">
              {menu.map(item => (
                <Button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  variant={view === item.key ? 'default' : 'ghost'}
                  className={`w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <MenuIcon name={item.key} />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </Button>
              ))}
            </div>
          </nav>
          {!sidebarCollapsed && (
            <div className="border-t border-[#e5e7eb] p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={session.photo} alt={session.name} />
                  <AvatarFallback name={session.name} />
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.name}</p>
                  <p className="text-xs text-[#697586] truncate">{session.username}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-1"
                  onClick={() => setSidebarPinned(!sidebarPinned)}
                  aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                >
                  {sidebarPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 rounded-xl px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            </div>
          )}
        </aside>

          {/* Main */}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Mobile Header */}
            <header className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-md lg:hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                  <div className="min-w-0">
                    <h1 className="text-lg font-bold leading-tight tracking-wide truncate">NGF FINCORP</h1>
                    <p className="mt-0.5 text-[10px] text-[#697586] truncate">{session.role} portal</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Notifications */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="relative">
                        <Bell className="h-5 w-5" />
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">3</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="py-2" onClick={() => { setView('notifications'); setNotificationsOpen(false) }}>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">New lead submitted</p>
                            <p className="text-xs text-[#697586]">Rajesh Kumar - ₹50,000</p>
                            <p className="text-xs text-[#9ca3af]">2 min ago</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="py-2">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                            <CreditCard className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Payment received</p>
                            <p className="text-xs text-[#697586]">Weekly collection - ₹12,500</p>
                            <p className="text-xs text-[#9ca3af]">15 min ago</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="py-2">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <Shield className="h-4 w-4 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Verification approved</p>
                            <p className="text-xs text-[#697586]">Lead #LEAD123 approved for disbursement</p>
                            <p className="text-xs text-[#9ca3af]">1 hour ago</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="py-2 text-center text-sm font-medium text-[#1a1a2e]" onClick={() => { setView('notifications'); setNotificationsOpen(false) }}>
                        View all notifications
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* User Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="flex items-center gap-2 rounded-xl px-3 py-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={session.photo} alt={session.name} />
                          <AvatarFallback name={session.name} />
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={session.photo} alt={session.name} />
                          <AvatarFallback name={session.name} />
                        </Avatar>
                        <div>
                          <p className="font-medium">{session.name}</p>
                          <p className="text-xs text-[#697586]">{session.role}</p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setView('myIdCard')}>
                        <User className="h-4 w-4 mr-2" />
                        My Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setView('myCustomers')}>
                        <Users className="h-4 w-4 mr-2" />
                        My Customers
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            {/* Desktop Header */}
            <header className="sticky top-0 z-30 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-md hidden lg:block">
              <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <MenuIcon name={view} />
                      {pageTitle}
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Notifications */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="relative">
                        <Bell className="h-5 w-5" />
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">3</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="py-2" onClick={() => { setView('notifications'); setNotificationsOpen(false) }}>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">New lead submitted</p>
                            <p className="text-xs text-[#697586]">Rajesh Kumar - ₹50,000</p>
                            <p className="text-xs text-[#9ca3af]">2 min ago</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="py-2">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                            <CreditCard className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Payment received</p>
                            <p className="text-xs text-[#697586]">Weekly collection - ₹12,500</p>
                            <p className="text-xs text-[#9ca3af]">15 min ago</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="py-2">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <Shield className="h-4 w-4 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Verification approved</p>
                            <p className="text-xs text-[#697586]">Lead #LEAD123 approved for disbursement</p>
                            <p className="text-xs text-[#9ca3af]">1 hour ago</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="py-2 text-center text-sm font-medium text-[#1a1a2e]" onClick={() => { setView('notifications'); setNotificationsOpen(false) }}>
                        View all notifications
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* User Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="flex items-center gap-2 rounded-xl px-3 py-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={session.photo} alt={session.name} />
                          <AvatarFallback name={session.name} />
                        </Avatar>
                        <span className="hidden sm:block text-sm font-medium">{session.name}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={session.photo} alt={session.name} />
                          <AvatarFallback name={session.name} />
                        </Avatar>
                        <div>
                          <p className="font-medium">{session.name}</p>
                          <p className="text-xs text-[#697586]">{session.role}</p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setView('myIdCard')}>
                        <User className="h-4 w-4 mr-2" />
                        My Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setView('myCustomers')}>
                        <Users className="h-4 w-4 mr-2" />
                        My Customers
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 pb-8 md:pb-4 lg:pb-0">
              {renderPage()}
            </div>
          </main>
        </div>
      </div>
    )
  }