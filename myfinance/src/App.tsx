import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
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
import { addTransaction, deleteTransaction, formatRupees, monthKey, parseAmountToPaise, updateTransaction } from './accounting'
import { db, seedDatabase } from './database'
import { createBackup, restoreBackup, validateBackup } from './data-transfer'
import { getFirebaseAuth, getFirestoreDb, initFirebase } from './firebase'
import { applyTheme, loadSettings, saveSettings, type AppSettings } from './settings-store'
import { pushAllLocal, syncNow } from './sync'
import { newId, type Category, type Transaction } from './types'
import './App.css'

const today = new Date().toISOString().slice(0, 10)
const currentDateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const currentMonth = today.slice(0, 7)

type View = 'overview' | 'reports' | 'transactions' | 'categories'
const VIEW_PATHS: Record<View, string> = { overview: '/', reports: '/reports', transactions: '/transactions', categories: '/categories' }
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
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
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

  useEffect(() => {
    initFirebase()
    const auth = getFirebaseAuth()
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        setSyncStatus('Syncing…')
        syncNow(nextUser.uid)
          .then(({ pushed }) => { setSyncStatus(`Synced ${pushed} areas`); return refresh() })
          .catch(() => setSyncStatus('Sync failed'))
      } else {
        setSyncStatus('')
      }
    })
    return () => unsubscribe()
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
    const [nextCategories, nextTransactions] = await Promise.all([
      db.categories.filter((category) => !category.archived).toArray(),
      db.transactions.filter((item) => !item.deleted).toArray(),
    ])
    setCategories(nextCategories)
    const sorted = [...nextTransactions].sort((a, b) => b.date.localeCompare(a.date))
    setAllTransactions(sorted)
    setTransactions(sorted.slice(0, 8))
  }

  useEffect(() => {
    seedDatabase().then(refresh).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not open local database.'))
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
    await Promise.all([db.categories.clear(), db.transactions.clear()])
    await seedDatabase()
    await refresh()
    setIsSettingsOpen(false)
  }

  const archiveCategory = async (id?: string) => {
    if (!id || !window.confirm('Archive this category? It stays on past transactions but is hidden from new entries.')) return
    await db.categories.update(id, { archived: true, updatedAt: new Date().toISOString() })
    await refresh()
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
        for (const table of ['categories', 'transactions']) {
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

  const submitTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const values = {
        amountPaise: parseAmountToPaise(String(form.get('amount') ?? '')),
        categoryId: String(form.get('categoryId') ?? ''),
        description: String(form.get('description') ?? '').trim() || 'Untitled transaction',
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

  const submitCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await db.categories.add({
        id: newId(),
        name: String(form.get('name') ?? '').trim() || 'New category',
        color: String(form.get('color') ?? '#64748b'),
        archived: false,
        deleted: false,
        updatedAt: new Date().toISOString(),
      })
      setIsAddingCategory(false)
      setError('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save category.')
    }
  }

  return (
    <div className="app-shell">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><div className="brand-mark"><CircleDollarSign size={23} /></div><span>myfinance</span></div>
        <nav>
          <button className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => navigate('overview')}><BarChart3 size={18} /> Overview</button>
          <button className={`nav-item ${activeView === 'transactions' ? 'active' : ''}`} onClick={() => navigate('transactions')}><Receipt size={18} /> Transactions</button>
          <button className={`nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => navigate('reports')}><BarChart3 size={18} /> Reports</button>
        </nav>
        <div className="sidebar-bottom">
          {deferredPrompt && !appInstalled && <button className="nav-item" onClick={promptInstall}><MonitorDown size={18} /> Install app</button>}
          {appInstalled && <div className="installed-note"><Check size={15} /> Installed</div>}
          <button className={`nav-item ${activeView === 'categories' ? 'active' : ''}`} onClick={() => navigate('categories')}><Settings size={18} /> Categories</button>
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
          <div className="quick-card"><span className="card-label">Quick action</span><button onClick={() => { setEditingTransaction(null); setIsAdding(true) }}><span className="quick-icon expense"><ArrowUpRight size={18} /></span>Add expense <ChevronRight size={16} /></button></div>
        </section>
        <section className="content-grid">
          <div className="panel transactions-panel"><div className="panel-heading"><div><p className="eyebrow">Activity</p><h2>Recent transactions</h2></div><button className="text-button" onClick={() => navigate('transactions')}>View all <ChevronRight size={15} /></button></div>{transactions.length === 0 ? <EmptyState /> : <div className="transaction-list">{transactions.map((transaction) => { const category = categories.find((item) => item.id === transaction.categoryId); return <div className="transaction-row" key={transaction.id}><div className="transaction-icon expense"><Receipt size={17} /></div><div className="transaction-info"><strong>{transaction.description}</strong><small>{category?.name ?? 'Uncategorized'}</small></div><time>{new Date(`${transaction.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</time><strong className="amount">-{formatRupees(transaction.amountPaise)}</strong><button className="delete-button" onClick={() => { setEditingTransaction(transaction); setIsAdding(true) }} aria-label={`Edit ${transaction.description}`}><Settings size={15} /></button><button className="delete-button" onClick={() => transaction.id && deleteTransaction(transaction.id).then(refresh)} aria-label={`Delete ${transaction.description}`}><Trash2 size={15} /></button></div> })}</div>}<button className="add-transaction" onClick={() => { setEditingTransaction(null); setIsAdding(true) }}><Plus size={17} /> Add transaction</button></div>
        </section></> : activeView === 'transactions'
          ? <TransactionsView transactions={allTransactions} categories={categories} onEdit={(t) => { setEditingTransaction(t); setIsAdding(true) }} onDelete={(id) => { if (id == null) return; deleteTransaction(id).then(refresh) }} />
          : activeView === 'categories'
              ? <CategoriesView categories={categories} transactions={allTransactions} onAdd={() => setIsAddingCategory(true)} onArchive={archiveCategory} />
                  : <ReportView transactions={allTransactions} categories={categories} />}
      </main>
      {isAdding && <div className="modal-backdrop" onClick={() => { setIsAdding(false); setEditingTransaction(null) }}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{editingTransaction ? 'Edit entry' : 'New entry'}</p><h2>{editingTransaction ? 'Edit transaction' : 'Add transaction'}</h2></div><button className="icon-button" onClick={() => { setIsAdding(false); setEditingTransaction(null) }} aria-label="Close"><X /></button></div><form onSubmit={submitTransaction}><label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={editingTransaction ? (editingTransaction.amountPaise / 100).toFixed(2) : ''} autoFocus required /></label><label>Category<select name="categoryId" defaultValue={editingTransaction?.categoryId} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><div className="form-grid"><label>Date<input name="date" type="date" defaultValue={editingTransaction?.date ?? today} required /></label><label>Description<input name="description" defaultValue={editingTransaction?.description ?? ''} placeholder="e.g. Morning coffee" /></label></div><button className="primary-button" type="submit">{editingTransaction ? 'Update transaction' : 'Save transaction'}</button></form></div></div>}
      {isAddingCategory && <div className="modal-backdrop" onClick={() => setIsAddingCategory(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Customize</p><h2>Add category</h2></div><button className="icon-button" onClick={() => setIsAddingCategory(false)} aria-label="Close"><X /></button></div><form onSubmit={submitCategory}><label>Category name<input name="name" placeholder="e.g. Pet care" autoFocus required /></label><label>Color<input name="color" type="color" defaultValue="#64748b" /></label><button className="primary-button" type="submit">Save category</button></form></div></div>}
      {isDataModalOpen && <DataModal inputRef={backupInput} onClose={() => setIsDataModalOpen(false)} onRestored={refresh} />}
      {isSettingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onReset={resetData} onClose={() => setIsSettingsOpen(false)} user={user} onPasswordReset={handlePasswordReset} onSendVerification={handleSendVerification} onDeleteAccount={handleDeleteAccount} />}
      {isSyncOpen && <SyncModal user={user} status={syncStatus} onClose={() => setIsSyncOpen(false)} onSignIn={handleSignIn} onSignUp={handleSignUp} onSignOut={handleSignOut} onSync={handleManualSync} />}
    </div>
  )
}

function EmptyState() {
  return <div className="empty-state"><Receipt size={30} /><strong>Your activity will appear here</strong><span>Add your first expense to get started.</span></div>
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
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Local data</p><h2>Backup & restore</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div><p className="budget-empty">Download every category and transaction as one validated JSON backup.</p><div className="data-actions"><button className="primary-button" onClick={downloadBackup}><Download size={15} /> Download backup</button><button className="secondary-button" onClick={() => inputRef.current?.click()}>Restore JSON backup</button><input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={restore} /></div>{message && <div className="alert">{message}</div>}</div></div>
}

function ReportView({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
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
  const categoryTotals = categories
    .map((category) => ({ ...category, total: filtered.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amountPaise, 0) }))
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total)
  const exportCsv = () => {
    const rows = [['Date', 'Description', 'Category', 'Amount']]
    filtered.forEach((item) => rows.push([item.date, item.description, categories.find((category) => category.id === item.categoryId)?.name ?? 'Uncategorized', (item.amountPaise / 100).toFixed(2)]))
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
    <div className="report-columns"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Breakdown</p><h2>Spending by category</h2></div></div>{categoryTotals.length === 0 ? <EmptyState /> : <div className="category-bars">{categoryTotals.map((category) => <div className="category-bar" key={category.id}><div><span>{category.name}</span><b>{formatRupees(category.total)}</b></div><div className="bar-track"><div style={{ width: `${(category.total / categoryTotals[0].total) * 100}%`, background: category.color }} /></div></div>)}</div>}</div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Ledger</p><h2>Report transactions</h2></div></div><div className="report-rows">{filtered.slice(0, 10).map((item) => <div className="report-row" key={item.id}><span>{item.date}</span><strong>{item.description}</strong><b className="negative">-{formatRupees(item.amountPaise)}</b></div>)}{filtered.length === 0 && <p className="budget-empty">No transactions in this period.</p>}</div></div></div>
  </section>
}

function TransactionsView({ transactions, categories, onEdit, onDelete }: { transactions: Transaction[]; categories: Category[]; onEdit: (t: Transaction) => void; onDelete: (id?: string) => void }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'amount'>('newest')
  const filtered = useMemo(() => {
    let rows = transactions.filter((t) => {
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        const categoryName = categories.find((c) => c.id === t.categoryId)?.name.toLowerCase() ?? ''
        if (!t.description.toLowerCase().includes(q) && !categoryName.includes(q)) return false
      }
      return true
    })
    if (sort === 'newest') rows = [...rows].sort((a, b) => b.date.localeCompare(a.date))
    else if (sort === 'oldest') rows = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    else rows = [...rows].sort((a, b) => b.amountPaise - a.amountPaise)
    return rows
  }, [transactions, query, sort, categories])
  const total = filtered.reduce((sum, t) => sum + t.amountPaise, 0)
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Ledger</p><h2>All transactions</h2><p className="report-subtitle">{filtered.length} entries · {formatRupees(total)} spent</p></div></div>
    <div className="history-toolbar">
      <div className="search-box"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description or category" /></div>
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Highest amount</option></select>
    </div>
    <div className="panel"><div className="report-rows">{filtered.length === 0 ? <EmptyState /> : filtered.map((item) => {
      const category = categories.find((c) => c.id === item.categoryId)
      return <div className="history-row" key={item.id}><div className="transaction-info"><strong>{item.description}</strong><small>{category?.name ?? 'Uncategorized'} · {item.date}</small></div><b className="negative">-{formatRupees(item.amountPaise)}</b><button className="row-action" onClick={() => onEdit(item)} aria-label="Edit"><Pencil size={14} /></button><button className="row-action danger" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 size={14} /></button></div>
    })}</div></div>
  </section>
}

function SettingsModal({ settings, onChange, onReset, onClose, user, onPasswordReset, onSendVerification, onDeleteAccount }: { settings: AppSettings; onChange: (next: Partial<AppSettings>) => void; onReset: () => Promise<void>; onClose: () => void; user: User | null; onPasswordReset: () => void; onSendVerification: () => void; onDeleteAccount: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Preferences</p><h2>Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
    <div className="settings-section"><h3>Appearance</h3><div className="type-switcher two"><button className={settings.theme === 'light' ? 'selected' : ''} type="button" onClick={() => onChange({ theme: 'light' })}><Sun size={15} /> Light</button><button className={settings.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => onChange({ theme: 'dark' })}><Moon size={15} /> Dark</button></div></div>
    {user && <div className="settings-section"><h3>Account</h3><p className="report-subtitle">{user.email}{!user.emailVerified ? ' · unverified' : ''}</p><div className="data-actions">{!user.emailVerified && <button className="secondary-button" onClick={onSendVerification}><RefreshCcw size={15} /> Resend verification</button>}<button className="secondary-button" onClick={onPasswordReset}>Reset password</button><button className="danger-button" onClick={onDeleteAccount}>Delete account &amp; data</button></div></div>}
    <div className="settings-section"><h3>Data</h3><div className="data-actions"><button className="danger-button" onClick={onReset}><RefreshCcw size={15} /> Reset all data</button></div></div>
  </div></div>
}

function CategoriesView({ categories, transactions, onAdd, onArchive }: { categories: Category[]; transactions: Transaction[]; onAdd: () => void; onArchive: (id?: string) => void }) {
  const usage = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) if (t.categoryId) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + 1)
    return map
  }, [transactions])
  if (categories.length === 0) return <section className="reports-view"><div className="report-toolbar"><div><p className="eyebrow">Customize</p><h2>Categories</h2><p className="report-subtitle">0 active categories</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add category</button></div><EmptyState /></section>
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Customize</p><h2>Categories</h2><p className="report-subtitle">{categories.length} active categories</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add category</button></div>
    <div className="category-grid">{categories.map((category) => {
      const count = usage.get(category.id) ?? 0
      return <div className="panel category-card" key={category.id}><div className="category-card-top"><span className="account-color" style={{ background: category.color }}><Settings size={17} /></span><button className="row-action danger" onClick={() => onArchive(category.id)} aria-label="Archive category"><Trash2 size={14} /></button></div><strong>{category.name}</strong><small>{count === 0 ? 'Unused' : `${count} transaction${count === 1 ? '' : 's'}`}</small></div>
    })}</div>
    <p className="report-subtitle">Categories already used by past transactions are archived, never deleted, to keep your history intact.</p>
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
