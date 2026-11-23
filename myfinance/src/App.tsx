import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  HandCoins,
  Menu,
  MonitorDown,
  Moon,
  Pencil,
  Plus,
  Receipt,
  RefreshCcw,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { collection, deleteDoc, getDocs } from 'firebase/firestore'
import { addDebt, addDebtPayment, addTransaction, deleteDebt, deleteDebtPayment, deleteTransaction, formatRupees, monthKey, outstandingPaise, parseAmountToPaise, updateDebt, updateTransaction } from './accounting'
import { db } from './database'
import { createBackup, restoreBackup, validateBackup } from './data-transfer'
import { getFirebaseAuth, getFirestoreDb, initFirebase } from './firebase'
import { applyTheme, loadSettings, saveSettings, type AppSettings } from './settings-store'
import { pushAllLocal, syncNow, subscribeToRemote, watchLocalChanges } from './sync'
import { type Debt, type DebtPayment, type Transaction } from './types'
import './App.css'

const today = new Date().toISOString().slice(0, 10)
const currentDateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const currentMonth = today.slice(0, 7)

type View = 'overview' | 'reports' | 'transactions' | 'debts'
const VIEW_PATHS: Record<View, string> = { overview: '/', reports: '/reports', transactions: '/transactions', debts: '/debts' }
function viewFromPath(path: string): View {
  for (const [view, viewPath] of Object.entries(VIEW_PATHS)) {
    if (viewPath !== '/' && path.startsWith(viewPath)) return view as View
  }
  return 'overview'
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isAddingDebt, setIsAddingDebt] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const backupInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [activeView, setActiveView] = useState<View>(() => viewFromPath(window.location.pathname))
  const navigate = (view: View) => {
    window.history.pushState({}, '', VIEW_PATHS[view])
    setActiveView(view)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    const onPopState = () => setActiveView(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [appInstalled, setAppInstalled] = useState(false)
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const userName = user?.email ? user.email.split('@')[0].split('.')[0].replace(/^\w/, (c) => c.toUpperCase()) : 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const [syncStatus, setSyncStatus] = useState('')
  const stopRealtimeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    initFirebase()
    const auth = getFirebaseAuth()
    if (!auth) return
    const stopRealtime = () => { stopRealtimeRef.current?.(); stopRealtimeRef.current = null }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      stopRealtime()
      if (nextUser) {
        setSyncStatus('Syncing…')
        syncNow(nextUser.uid)
          .then(({ pushed }) => { setSyncStatus(`Synced ${pushed} areas`); return refresh() })
          .catch(() => setSyncStatus('Sync failed'))
        const stopRemote = subscribeToRemote(nextUser.uid, () => { refresh().catch(() => undefined) })
        const stopLocal = watchLocalChanges(nextUser.uid)
        stopRealtimeRef.current = () => { stopRemote(); stopLocal() }
      } else {
        setSyncStatus('')
      }
    })
    return () => { unsubscribe(); stopRealtime() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setAppInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') setAppInstalled(true)
    setDeferredPrompt(null)
  }

  const refresh = async () => {
    const [nextTransactions, nextDebts, nextPayments] = await Promise.all([
      db.transactions.filter((item) => !item.deleted).toArray(),
      db.debts.filter((debt) => !debt.deleted).toArray(),
      db.debtPayments.filter((payment) => !payment.deleted).toArray(),
    ])
    const sorted = [...nextTransactions].sort((a, b) => b.date.localeCompare(a.date))
    setAllTransactions(sorted)
    setTransactions(sorted.slice(0, 8))
    setDebts([...nextDebts].sort((a, b) => b.date.localeCompare(a.date)))
    setDebtPayments(nextPayments)
  }

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not open local database.'))
  }, [])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    const refreshOnFocus = () => { refresh().catch(() => undefined) }
    window.addEventListener('focus', refreshOnFocus)
    const onVisibility = () => { if (!document.hidden) refreshOnFocus() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateSettings = (next: Partial<AppSettings>) => {
    setSettings((current) => {
      const merged: AppSettings = { ...current, ...next }
      saveSettings(merged)
      return merged
    })
  }

  const resetData = async () => {
    if (!window.confirm('This will permanently delete all local financial data. Continue?')) return
    await Promise.all([db.transactions.clear(), db.debts.clear(), db.debtPayments.clear()])
    await refresh()
    setIsSettingsOpen(false)
  }

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const auth = getFirebaseAuth()
    if (!auth) { setError('Firebase is unavailable now.'); return }
    try {
      await signInWithEmailAndPassword(auth, email, password)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.')
    }
  }

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const auth = getFirebaseAuth()
    if (!auth) { setError('Firebase is unavailable now.'); return }
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      if (credential.user && !credential.user.emailVerified) {
        await sendEmailVerification(credential.user).catch(() => undefined)
      }
      setError('Account created! A verification email was sent — verify it to enable cloud sync.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create account.')
    }
  }

  const handleSignOut = async () => {
    const auth = getFirebaseAuth()
    if (auth) await signOut(auth).catch(() => undefined)
  }

  const handlePasswordReset = async () => {
    const auth = getFirebaseAuth()
    const email = auth?.currentUser?.email
    if (!auth || !email) { setError('You must be signed in with an email to reset your password.'); return }
    try {
      await sendPasswordResetEmail(auth, email)
      setError('Password reset email sent — check your inbox.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send reset email.')
    }
  }

  const handleSendVerification = async () => {
    const auth = getFirebaseAuth()
    const user = auth?.currentUser
    if (!user) return
    try {
      await sendEmailVerification(user)
      setError('Verification email sent — check your inbox.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send verification email.')
    }
  }

  const handleDeleteAccount = async () => {
    const auth = getFirebaseAuth()
    const user = auth?.currentUser
    if (!auth || !user) { setError('Sign in to delete your account.'); return }
    if (!window.confirm('This permanently deletes your cloud data and Firebase account. This cannot be undone. Continue?')) return
    try {
      const firestore = getFirestoreDb()
      if (firestore) {
        for (const table of ['transactions', 'debts', 'debtPayments']) {
          const col = collection(firestore, 'users', user.uid, table)
          const snapshot = await getDocs(col)
          for (const entry of snapshot.docs) await deleteDoc(entry.ref)
        }
      }
      await deleteUser(user)
      setUser(null)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete account.')
    }
  }

  const handleManualSync = async () => {
    const auth = getFirebaseAuth()
    if (!auth?.currentUser) { setError('Sign in to sync.'); return }
    setSyncStatus('Syncing…')
    try {
      await pushAllLocal(auth.currentUser.uid)
      const { pushed } = await syncNow(auth.currentUser.uid)
      setSyncStatus(`Synced ${pushed} areas`)
      await refresh()
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sync failed.')
      setSyncStatus('Sync failed')
    }
  }

  const monthTransactions = useMemo(() => allTransactions.filter((item) => monthKey(item.date) === currentMonth), [allTransactions])
  const monthExpenses = monthTransactions.reduce((sum, item) => sum + item.amountPaise, 0)
  const lentOutstanding = debts.filter((debt) => debt.direction === 'lent').reduce((sum, debt) => sum + outstandingPaise(debt, debtPayments), 0)
  const owingOutstanding = debts.filter((debt) => debt.direction === 'owing').reduce((sum, debt) => sum + outstandingPaise(debt, debtPayments), 0)

  const submitTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const values = {
        amountPaise: parseAmountToPaise(String(form.get('amount') ?? '')),
        item: String(form.get('item') ?? '').trim() || 'Untitled item',
        description: String(form.get('description') ?? '').trim() || undefined,
        date: String(form.get('date') ?? today),
      }
      if (editingTransaction?.id) await updateTransaction(editingTransaction.id, values)
      else await addTransaction(values)
      setIsAdding(false)
      setEditingTransaction(null)
      setError('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save transaction.')
    }
  }

  const submitDebt = async (values: Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>, id?: string) => {
    try {
      if (id) await updateDebt(id, values)
      else await addDebt(values)
      setIsAddingDebt(false)
      setEditingDebt(null)
      setError('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save debt.')
    }
  }

  const submitPayment = async (values: Omit<DebtPayment, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) => {
    try {
      await addDebtPayment(values)
      setPayingDebt(null)
      setError('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save payment.')
    }
  }

  const handleDeleteDebt = async (id?: string) => {
    if (!id) return
    await deleteDebt(id)
    for (const payment of debtPayments) if (payment.debtId === id) await deleteDebtPayment(payment.id)
    await refresh()
  }

  return (
    <div className="app-shell">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><div className="brand-mark"><CircleDollarSign size={23} /></div><span>myfinance</span></div>
        <nav>
          <button className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => navigate('overview')}><BarChart3 size={18} /> Overview</button>
          <button className={`nav-item ${activeView === 'transactions' ? 'active' : ''}`} onClick={() => navigate('transactions')}><Receipt size={18} /> Transactions</button>
          <button className={`nav-item ${activeView === 'debts' ? 'active' : ''}`} onClick={() => navigate('debts')}><HandCoins size={18} /> Debts</button>
          <button className={`nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => navigate('reports')}><BarChart3 size={18} /> Reports</button>
        </nav>
        <div className="sidebar-bottom">
          {deferredPrompt && !appInstalled && <button className="nav-item" onClick={promptInstall}><MonitorDown size={18} /> Install app</button>}
          {appInstalled && <div className="installed-note"><Check size={15} /> Installed</div>}
          <button className="nav-item" onClick={() => setIsDataModalOpen(true)}><Download size={18} /> Backup & import</button>
          <button className="nav-item" onClick={() => setIsSyncOpen(true)}><RefreshCcw size={18} /> Sync {user ? <span className="nav-badge">on</span> : null}</button>
          <div className="profile"><div className="avatar">AK</div><div><strong>My finances</strong><small>Local workspace</small></div></div>
        </div>
      </aside>
      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><p className="eyebrow">{currentDateLabel}</p><h1>{greeting}, {userName}</h1></div><div className="top-actions"><span className="offline-dot">● Local & private</span><button className="icon-button" onClick={() => setIsSettingsOpen(true)} aria-label="Settings"><Settings size={19} /></button><div className="avatar">AK</div></div></header>
        {error && <div className="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {activeView === 'overview' ? <><section className="hero-grid">
          <div className="balance-card"><div className="card-label">Total spent this month</div><div className="total-balance">{formatRupees(monthExpenses)}</div><div className="balance-meta"><span>Every expense you record, summed up.</span></div></div>
          <div className="metric-card"><span className="metric-icon green"><HandCoins size={16} /></span><small>You are owed</small><strong>{formatRupees(lentOutstanding)}</strong><small>Net lent outstanding</small></div>
          <div className="metric-card"><span className="metric-icon red"><CircleDollarSign size={16} /></span><small>You owe</small><strong>{formatRupees(owingOutstanding)}</strong><small>Net borrowed outstanding</small></div>
          <div className="quick-card"><span className="card-label">Quick action</span><button onClick={() => { setEditingTransaction(null); setIsAdding(true) }}><span className="quick-icon expense"><ArrowUpRight size={18} /></span>Add expense <ChevronRight size={16} /></button><button onClick={() => { setEditingDebt(null); setIsAddingDebt(true) }}><span className="quick-icon income"><HandCoins size={18} /></span>Add debt <ChevronRight size={16} /></button></div>
        </section>
        <section className="content-grid">
          <div className="panel transactions-panel"><div className="panel-heading"><div><p className="eyebrow">Activity</p><h2>Recent transactions</h2></div><button className="text-button" onClick={() => navigate('transactions')}>View all <ChevronRight size={15} /></button></div>{transactions.length === 0 ? <EmptyState /> : <div className="transaction-list">{transactions.map((transaction) => <div className="transaction-row" key={transaction.id}><div className="transaction-icon expense"><Receipt size={17} /></div><div className="transaction-info"><strong>{transaction.item}</strong><small>{transaction.description ?? 'Item purchase'}</small></div><time>{new Date(`${transaction.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</time><strong className="amount">-{formatRupees(transaction.amountPaise)}</strong><button className="delete-button" onClick={() => { setEditingTransaction(transaction); setIsAdding(true) }} aria-label={`Edit ${transaction.item}`}><Settings size={15} /></button><button className="delete-button" onClick={() => transaction.id && deleteTransaction(transaction.id).then(refresh)} aria-label={`Delete ${transaction.item}`}><Trash2 size={15} /></button></div>)}</div>}<button className="add-transaction" onClick={() => { setEditingTransaction(null); setIsAdding(true) }}><Plus size={17} /> Add transaction</button></div>
          <div className="right-column"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Debts</p><h2>People</h2></div><button className="text-button" onClick={() => navigate('debts')}>View all <ChevronRight size={15} /></button></div>{debts.length === 0 ? <div className="empty-state"><HandCoins size={30} /><strong>No debts yet</strong><span>Add who owes you or who you owe.</span></div> : <div className="debt-list">{debts.slice(0, 5).map((debt) => { const outstanding = outstandingPaise(debt, debtPayments); return <div className="debt-row" key={debt.id}><div className="transaction-icon income"><HandCoins size={17} /></div><div className="transaction-info"><strong>{debt.person}</strong><small>{debt.direction === 'lent' ? 'Owes you' : 'You owe'} · {formatRupees(debt.amountPaise)}</small></div><strong className={debt.direction === 'lent' ? 'amount positive' : 'amount'}>{formatRupees(outstanding)}</strong></div> })}</div>}</div></div>
        </section></> : activeView === 'transactions'
          ? <TransactionsView transactions={allTransactions} onEdit={(t) => { setEditingTransaction(t); setIsAdding(true) }} onDelete={(id) => { if (id == null) return; deleteTransaction(id).then(refresh) }} />
          : activeView === 'debts'
              ? <DebtsView debts={debts} payments={debtPayments} onAdd={() => { setEditingDebt(null); setIsAddingDebt(true) }} onEdit={(debt) => { setEditingDebt(debt); setIsAddingDebt(true) }} onDelete={handleDeleteDebt} onPay={(debt) => setPayingDebt(debt)} />
              : <ReportView transactions={allTransactions} />}
      </main>
      {isAdding && <div className="modal-backdrop" onClick={() => { setIsAdding(false); setEditingTransaction(null) }}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{editingTransaction ? 'Edit entry' : 'New entry'}</p><h2>{editingTransaction ? 'Edit transaction' : 'Add transaction'}</h2></div><button className="icon-button" onClick={() => { setIsAdding(false); setEditingTransaction(null) }} aria-label="Close"><X /></button></div><form onSubmit={submitTransaction}><label>Item name<input name="item" placeholder="e.g. Pen, notebook" defaultValue={editingTransaction?.item} autoFocus required /></label><label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={editingTransaction ? (editingTransaction.amountPaise / 100).toFixed(2) : ''} required /></label><div className="form-grid"><label>Date<input name="date" type="date" defaultValue={editingTransaction?.date ?? today} required /></label><label>Description (optional)<input name="description" defaultValue={editingTransaction?.description ?? ''} placeholder="e.g. blue ink pen" /></label></div><button className="primary-button" type="submit">{editingTransaction ? 'Update transaction' : 'Save transaction'}</button></form></div></div>}
      {isAddingDebt && <DebtModal editing={editingDebt} onClose={() => { setIsAddingDebt(false); setEditingDebt(null) }} onSubmit={submitDebt} />}
      {payingDebt && <PaymentModal debt={payingDebt} outstanding={outstandingPaise(payingDebt, debtPayments)} onClose={() => setPayingDebt(null)} onSubmit={submitPayment} />}
      {isDataModalOpen && <DataModal inputRef={backupInput} onClose={() => setIsDataModalOpen(false)} onRestored={refresh} />}
      {isSettingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onReset={resetData} onClose={() => setIsSettingsOpen(false)} user={user} onPasswordReset={handlePasswordReset} onSendVerification={handleSendVerification} onDeleteAccount={handleDeleteAccount} />}
      {isSyncOpen && <SyncModal user={user} status={syncStatus} onClose={() => setIsSyncOpen(false)} onSignIn={handleSignIn} onSignUp={handleSignUp} onSignOut={handleSignOut} onSync={handleManualSync} />}
    </div>
  )
}

function EmptyState() {
  return <div className="empty-state"><Receipt size={30} /><strong>Your activity will appear here</strong><span>Add your first expense to get started.</span></div>
}

function DebtModal({ editing, onClose, onSubmit }: { editing: Debt | null; onClose: () => void; onSubmit: (values: Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>, id?: string) => Promise<void> }) {
  const [direction, setDirection] = useState<'lent' | 'owing'>(editing?.direction ?? 'lent')
  const [saving, setSaving] = useState(false)
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = {
      person: String(form.get('person') ?? '').trim() || 'Someone',
      direction,
      amountPaise: parseAmountToPaise(String(form.get('amount') ?? '')),
      note: String(form.get('note') ?? '').trim() || undefined,
      date: String(form.get('date') ?? today),
    }
    setSaving(true)
    try { await onSubmit(values, editing?.id) } finally { setSaving(false) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{editing ? 'Edit entry' : 'New entry'}</p><h2>{editing ? 'Edit debt' : 'Add debt'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div><form onSubmit={submit}><div className="type-switcher"><button type="button" className={direction === 'lent' ? 'selected' : ''} onClick={() => setDirection('lent')}><HandCoins size={15} /> They owe me</button><button type="button" className={direction === 'owing' ? 'selected' : ''} onClick={() => setDirection('owing')}><CircleDollarSign size={15} /> I owe them</button></div><label>Person<input name="person" placeholder="e.g. Ramesh" defaultValue={editing?.person ?? ''} autoFocus required /></label><label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={editing ? (editing.amountPaise / 100).toFixed(2) : ''} required /></label><div className="form-grid"><label>Date<input name="date" type="date" defaultValue={editing?.date ?? today} required /></label><label>Note (optional)<input name="note" defaultValue={editing?.note ?? ''} placeholder="Why?" /></label></div><button className="primary-button" type="submit" disabled={saving}>{editing ? 'Update debt' : 'Save debt'}</button></form></div></div>
}

function PaymentModal({ debt, outstanding, onClose, onSubmit }: { debt: Debt; outstanding: number; onClose: () => void; onSubmit: (values: Omit<DebtPayment, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) => Promise<void> }) {
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = {
      debtId: debt.id,
      amountPaise: parseAmountToPaise(String(form.get('amount') ?? '')),
      date: String(form.get('date') ?? today),
    }
    await onSubmit(values)
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Repayment</p><h2>Record payment</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div><form onSubmit={submit}><p className="report-subtitle">{debt.person} · {debt.direction === 'lent' ? 'owes you' : 'you owe'} {formatRupees(outstanding)} remaining</p><label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" autoFocus required /></label><label>Date<input name="date" type="date" defaultValue={today} required /></label><button className="primary-button" type="submit">Save payment</button></form></div></div>
}

function DataModal({ inputRef, onClose, onRestored }: { inputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onRestored: () => Promise<void> }) {
  const [message, setMessage] = useState('')
  const downloadBackup = async () => {
    const backup = await createBackup()
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `myfinance-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  const restore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !window.confirm('Restore will replace all current local data. Continue?')) return
    try {
      const backup = JSON.parse(await file.text())
      validateBackup(backup)
      await restoreBackup(backup)
      await onRestored()
      setMessage('Backup restored successfully.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not restore backup.')
    } finally {
      event.target.value = ''
    }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Local data</p><h2>Backup & restore</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div><p className="budget-empty">Download every transaction and debt as one validated JSON backup.</p><div className="data-actions"><button className="primary-button" onClick={downloadBackup}><Download size={15} /> Download backup</button><button className="secondary-button" onClick={() => inputRef.current?.click()}>Restore JSON backup</button><input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={restore} /></div>{message && <div className="alert">{message}</div>}</div></div>
}

function ReportView({ transactions }: { transactions: Transaction[] }) {
  const [range, setRange] = useState<'month' | 'year' | 'all'>('month')
  const currentYear = today.slice(0, 4)
  const currentMonthNumber = today.slice(5, 7)
  const filtered = transactions.filter((transaction) => {
    if (range === 'all') return true
    const transactionYear = transaction.date.slice(0, 4)
    const transactionMonth = transaction.date.slice(5, 7)
    return range === 'month'
      ? transactionYear === currentYear && transactionMonth === currentMonthNumber
      : transactionYear === currentYear
  })
  const expenseTotal = filtered.reduce((sum, item) => sum + item.amountPaise, 0)
  const itemTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of filtered) {
      const name = item.item.trim() || 'Untitled item'
      totals.set(name, (totals.get(name) ?? 0) + item.amountPaise)
    }
    return [...totals.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])
  const exportCsv = () => {
    const rows = [['Date', 'Item', 'Description', 'Amount']]
    filtered.forEach((item) => rows.push([item.date, item.item, item.description ?? '', (item.amountPaise / 100).toFixed(2)]))
    const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `myfinance-report-${range}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Analytics</p><h2>Financial reports</h2><p className="report-subtitle">A clear view of your spending activity.</p></div><div className="report-actions"><select value={range} onChange={(event) => setRange(event.target.value as typeof range)}><option value="month">This month</option><option value="year">This year</option><option value="all">All time</option></select><button className="export-button" onClick={exportCsv}><Download size={15} /> Export CSV</button></div></div>
    <div className="report-summary"><div className="report-card"><span>Total spent</span><strong className="negative">{formatRupees(expenseTotal)}</strong><small>{filtered.length} entries</small></div></div>
    <div className="report-columns"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Breakdown</p><h2>Spending by item</h2></div></div>{itemTotals.length === 0 ? <EmptyState /> : <div className="category-bars">{itemTotals.map((entry) => <div className="category-bar" key={entry.name}><div><span>{entry.name}</span><b>{formatRupees(entry.total)}</b></div><div className="bar-track"><div style={{ width: `${(entry.total / itemTotals[0].total) * 100}%`, background: '#2a8b74' }} /></div></div>)}</div>}</div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Ledger</p><h2>Report transactions</h2></div></div><div className="report-rows">{filtered.slice(0, 10).map((item) => <div className="report-row" key={item.id}><span>{item.date}</span><strong>{item.item}</strong><b className="negative">-{formatRupees(item.amountPaise)}</b></div>)}{filtered.length === 0 && <p className="budget-empty">No transactions in this period.</p>}</div></div></div>
  </section>
}

function TransactionsView({ transactions, onEdit, onDelete }: { transactions: Transaction[]; onEdit: (t: Transaction) => void; onDelete: (id?: string) => void }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'amount'>('newest')
  const filtered = useMemo(() => {
    let rows = transactions.filter((t) => {
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        if (!t.item.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    if (sort === 'newest') rows = [...rows].sort((a, b) => b.date.localeCompare(a.date))
    else if (sort === 'oldest') rows = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    else rows = [...rows].sort((a, b) => b.amountPaise - a.amountPaise)
    return rows
  }, [transactions, query, sort])
  const total = filtered.reduce((sum, t) => sum + t.amountPaise, 0)
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Ledger</p><h2>All transactions</h2><p className="report-subtitle">{filtered.length} entries · {formatRupees(total)} spent</p></div></div>
    <div className="history-toolbar">
      <div className="search-box"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item or description" /></div>
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Highest amount</option></select>
    </div>
    <div className="panel"><div className="report-rows">{filtered.length === 0 ? <EmptyState /> : filtered.map((item) => <div className="history-row" key={item.id}><div className="transaction-info"><strong>{item.item}</strong><small>{item.description ?? 'Item purchase'} · {item.date}</small></div><b className="negative">-{formatRupees(item.amountPaise)}</b><button className="row-action" onClick={() => onEdit(item)} aria-label="Edit"><Pencil size={14} /></button><button className="row-action danger" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 size={14} /></button></div>)}</div></div>
  </section>
}

function SettingsModal({ settings, onChange, onReset, onClose, user, onPasswordReset, onSendVerification, onDeleteAccount }: { settings: AppSettings; onChange: (next: Partial<AppSettings>) => void; onReset: () => Promise<void>; onClose: () => void; user: User | null; onPasswordReset: () => void; onSendVerification: () => void; onDeleteAccount: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Preferences</p><h2>Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
    <div className="settings-section"><h3>Appearance</h3><div className="type-switcher two"><button className={settings.theme === 'light' ? 'selected' : ''} type="button" onClick={() => onChange({ theme: 'light' })}><Sun size={15} /> Light</button><button className={settings.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => onChange({ theme: 'dark' })}><Moon size={15} /> Dark</button></div></div>
    {user && <div className="settings-section"><h3>Account</h3><p className="report-subtitle">{user.email}{!user.emailVerified ? ' · unverified' : ''}</p><div className="data-actions">{!user.emailVerified && <button className="secondary-button" onClick={onSendVerification}><RefreshCcw size={15} /> Resend verification</button>}<button className="secondary-button" onClick={onPasswordReset}>Reset password</button><button className="danger-button" onClick={onDeleteAccount}>Delete account &amp; data</button></div></div>}
    <div className="settings-section"><h3>Data</h3><div className="data-actions"><button className="danger-button" onClick={onReset}><RefreshCcw size={15} /> Reset all data</button></div></div>
  </div></div>
}

function DebtsView({ debts, payments, onAdd, onEdit, onDelete, onPay }: { debts: Debt[]; payments: DebtPayment[]; onAdd: () => void; onEdit: (debt: Debt) => void; onDelete: (id?: string) => void; onPay: (debt: Debt) => void }) {
  const lent = debts.filter((d) => d.direction === 'lent')
  const owing = debts.filter((d) => d.direction === 'owing')
  const lentTotal = lent.reduce((sum, d) => sum + outstandingPaise(d, payments), 0)
  const owingTotal = owing.reduce((sum, d) => sum + outstandingPaise(d, payments), 0)
  if (debts.length === 0) return <section className="reports-view"><div className="report-toolbar"><div><p className="eyebrow">People</p><h2>Debts</h2><p className="report-subtitle">Track money you owe or are owed.</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add debt</button></div><EmptyState /></section>
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">People</p><h2>Debts</h2><p className="report-subtitle">Track money you owe or are owed.</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add debt</button></div>
    <div className="report-summary"><div className="report-card"><span>They owe you</span><strong>{formatRupees(lentTotal)}</strong><small>{lent.length} people</small></div><div className="report-card"><span>You owe</span><strong className="negative">{formatRupees(owingTotal)}</strong><small>{owing.length} people</small></div></div>
    <div className="panel"><div className="panel-heading"><div><p className="eyebrow">Ledger</p><h2>All debts</h2></div></div><div className="debt-list">{[...debts].sort((a, b) => b.date.localeCompare(a.date)).map((debt) => {
      const outstanding = outstandingPaise(debt, payments)
      const paid = debt.amountPaise - outstanding
      const settled = outstanding <= 0
      const partial = !settled && paid > 0
      const status = settled ? 'paid' : partial ? 'partial' : 'unpaid'
      const statusLabel = settled ? 'Paid' : partial ? 'Partially paid' : 'Unpaid'
      return <div className="debt-row" key={debt.id}><div className="transaction-info"><strong>{debt.person}</strong><small>{debt.note ?? ''}{debt.note ? ' · ' : ''}{debt.date}</small></div><span className={`direction-badge ${debt.direction}`}>{debt.direction === 'lent' ? 'Owed to you' : 'You owe'}</span><div className="debt-amounts"><span className={`debt-status ${status}`}>{statusLabel}</span><small className={`paid-amount ${status}`}>Paid {formatRupees(paid)}</small><b className={settled ? 'settled' : debt.direction === 'lent' ? '' : 'negative'}>{formatRupees(outstanding)}</b></div><button className="row-action" onClick={() => onPay(debt)} aria-label="Record payment"><Check size={14} /></button><button className="row-action" onClick={() => onEdit(debt)} aria-label="Edit"><Pencil size={14} /></button><button className="row-action danger" onClick={() => onDelete(debt.id)} aria-label="Delete"><Trash2 size={14} /></button></div>
    })}</div></div>
  </section>
}

function SyncModal({ user, status, onClose, onSignIn, onSignUp, onSignOut, onSync }: {
  user: User | null
  status: string
  onClose: () => void
  onSignIn: (event: React.FormEvent<HTMLFormElement>) => void
  onSignUp: (event: React.FormEvent<HTMLFormElement>) => void
  onSignOut: () => void
  onSync: () => void
}) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Cloud</p><h2>Sync & backup</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
    {user ? <div className="settings-section"><h3>Signed in</h3><p className="report-subtitle">{user.email}</p><p className="sync-status">{status || 'Ready'}</p><div className="data-actions"><button className="primary-button" onClick={onSync}><RefreshCcw size={15} /> Sync now</button><button className="secondary-button" onClick={onSignOut}>Sign out</button></div></div>
      : <><div className="settings-section"><h3>Sign in</h3><p className="report-subtitle">Sync your data across devices under your private Firebase account. The app keeps working fully offline either way.</p><form onSubmit={onSignIn}><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" placeholder="Password" required /><button className="primary-button" type="submit">Sign in</button></form></div>
        <div className="settings-section"><h3>New here?</h3><p className="report-subtitle">Create an account to enable cloud sync and backup.</p><form onSubmit={onSignUp}><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" placeholder="Create a password" required /><button className="secondary-button" type="submit">Create account</button></form></div></>}
  </div></div>
}

export default App
