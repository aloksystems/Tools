import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  Landmark,
  Lock,
  Menu,
  MonitorDown,
  Moon,
  Pencil,
  Plus,
  Receipt,
  RefreshCcw,
  Repeat,
  Search,
  Settings,
  Sun,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { addTransaction, deleteTransaction, formatRupees, getAccountBalances, monthKey, parseAmountToPaise, processDueRecurringTransactions, updateTransaction } from './accounting'
import { db, seedDatabase } from './database'
import { createBackup, restoreBackup, validateBackup } from './data-transfer'
import { getFirebaseAuth, initFirebase } from './firebase'
import { applyTheme, loadSettings, saveSettings, type AppSettings } from './settings-store'
import { pushAllLocal, syncNow } from './sync'
import { newId, type Account, type Budget, type Category, type Loan, type RecurringTransaction, type SavingsGoal, type Transaction, type TransactionType } from './types'
import './App.css'

const today = new Date().toISOString().slice(0, 10)
const currentDateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const currentMonth = today.slice(0, 7)

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function App() {
  const [accounts, setAccounts] = useState<(Account & { balancePaise: number })[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [isEditingBudget, setIsEditingBudget] = useState(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [isAddingRecurring, setIsAddingRecurring] = useState(false)
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([])
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [isAddingGoal, setIsAddingGoal] = useState(false)
  const [isAddingLoan, setIsAddingLoan] = useState(false)
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [locked, setLocked] = useState<boolean>(() => Boolean(loadSettings().pin))
  const backupInput = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<TransactionType>('expense')
  const [error, setError] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [activeView, setActiveView] = useState<'overview' | 'reports' | 'transactions' | 'accounts' | 'categories' | 'recurring' | 'goals' | 'loans'>('overview')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [appInstalled, setAppInstalled] = useState(false)
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
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
    await processDueRecurringTransactions()
    const [balances, nextCategories, nextTransactions, nextBudget, nextRecurring, nextGoals, nextLoans] = await Promise.all([
      getAccountBalances(),
      db.categories.filter((category) => !category.archived).toArray(),
      db.transactions.filter((item) => !item.deleted).toArray(),
      db.budgets.where('month').equals(currentMonth).first(),
      db.recurringTransactions.filter((item) => item.active && !item.deleted).toArray(),
      db.savingsGoals.filter((item) => !item.deleted).toArray(),
      db.loans.filter((item) => !item.deleted).toArray(),
    ])
    setAccounts(balances)
    setCategories(nextCategories)
    const sorted = [...nextTransactions].sort((a, b) => b.date.localeCompare(a.date))
    setAllTransactions(sorted)
    setTransactions(sorted.slice(0, 8))
    setBudget(nextBudget ?? null)
    setRecurring(nextRecurring)
    setGoals(nextGoals)
    setLoans(nextLoans)
  }

  useEffect(() => {
    seedDatabase().then(refresh).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not open local database.'))
  }, [])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  const updateSettings = (next: Partial<AppSettings>) => {
    setSettings((current) => {
      const merged: AppSettings = { ...current, ...next }
      saveSettings(merged)
      return merged
    })
  }

  const resetData = async () => {
    if (!window.confirm('This will permanently delete all local financial data. Continue?')) return
    await Promise.all([db.accounts.clear(), db.categories.clear(), db.transactions.clear(), db.budgets.clear(), db.recurringTransactions.clear(), db.savingsGoals.clear(), db.loans.clear()])
    await seedDatabase()
    await refresh()
    setIsSettingsOpen(false)
  }

  const archiveAccount = async (id?: string) => {
    if (!id) return
    await db.accounts.update(id, { archived: true, updatedAt: new Date().toISOString() })
    await refresh()
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
      await createUserWithEmailAndPassword(auth, email, password)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create account.')
    }
  }

  const handleSignOut = async () => {
    const auth = getFirebaseAuth()
    if (auth) await signOut(auth).catch(() => undefined)
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

  const toggleRecurring = async (item: RecurringTransaction) => {
    if (!item.id) return
    await db.recurringTransactions.update(item.id, { active: !item.active, updatedAt: new Date().toISOString() })
    await refresh()
  }

  const deleteRecurring = async (id?: string) => {
    if (!id || !window.confirm('Delete this recurring transaction?')) return
    await db.recurringTransactions.update(id, { deleted: true, updatedAt: new Date().toISOString() })
    await refresh()
  }

  const deleteGoal = async (id?: string) => {
    if (!id || !window.confirm('Delete this savings goal?')) return
    await db.savingsGoals.update(id, { deleted: true, updatedAt: new Date().toISOString() })
    await refresh()
  }

  const deleteLoan = async (id?: string) => {
    if (!id || !window.confirm('Delete this lending record?')) return
    await db.loans.update(id, { deleted: true, updatedAt: new Date().toISOString() })
    await refresh()
  }

  const monthTransactions = useMemo(() => allTransactions.filter((item) => monthKey(item.date) === currentMonth), [allTransactions])
  const monthIncome = monthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amountPaise, 0)
  const monthExpenses = monthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amountPaise, 0)
  const totalBalance = accounts.reduce((sum, account) => sum + account.balancePaise, 0)

  const submitTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const accountId = String(form.get('accountId') ?? '')
      const destinationAccountId = form.get('destinationAccountId') ? String(form.get('destinationAccountId')) : undefined
      if (type === 'transfer' && accountId === destinationAccountId) throw new Error('Choose a different destination account.')
      const values = {
        type,
        amountPaise: parseAmountToPaise(String(form.get('amount') ?? '')),
        accountId,
        destinationAccountId,
        categoryId: type === 'transfer' ? undefined : String(form.get('categoryId') ?? ''),
        description: String(form.get('description') ?? '').trim() || (type === 'transfer' ? 'Account transfer' : 'Untitled transaction'),
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

  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const openingBalance = Number(String(form.get('openingBalance') ?? '0').replace(/,/g, ''))
      if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new Error('Opening balance must be zero or greater.')
      await db.accounts.add({
        id: newId(),
        name: String(form.get('name') ?? '').trim() || 'New account',
        type: String(form.get('type') ?? 'other') as Account['type'],
        openingBalancePaise: Math.round(openingBalance * 100),
        color: String(form.get('color') ?? '#14b8a6'),
        archived: false,
        createdAt: new Date().toISOString(),
        deleted: false,
        updatedAt: new Date().toISOString(),
      })
      setIsAddingAccount(false)
      setError('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save account.')
    }
  }

  const submitCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await db.categories.add({
        id: newId(),
        name: String(form.get('name') ?? '').trim() || 'New category',
        type: String(form.get('type') ?? 'expense') as Category['type'],
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

  const submitBudget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const amount = Number(String(form.get('amount') ?? '').replace(/,/g, ''))
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Budget must be greater than zero.')
      if (budget?.id) await db.budgets.update(budget.id, { amountPaise: Math.round(amount * 100), updatedAt: new Date().toISOString() })
      else await db.budgets.add({ id: newId(), month: currentMonth, amountPaise: Math.round(amount * 100), deleted: false, updatedAt: new Date().toISOString() })
      setError('')
      setIsEditingBudget(false)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save budget.')
    }
  }

  if (settings.pin && locked) {
    return <PinScreen onUnlock={() => setLocked(false)} />
  }

  return (
    <div className="app-shell">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><div className="brand-mark"><CircleDollarSign size={23} /></div><span>myfinance</span></div>
        <nav>
          <button className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => setActiveView('overview')}><BarChart3 size={18} /> Overview</button>
          <button className={`nav-item ${activeView === 'transactions' ? 'active' : ''}`} onClick={() => setActiveView('transactions')}><Receipt size={18} /> Transactions</button>
          <button className={`nav-item ${activeView === 'recurring' ? 'active' : ''}`} onClick={() => setActiveView('recurring')}><Repeat size={18} /> Recurring <span className="nav-badge">{recurring.length}</span></button>
          <button className={`nav-item ${activeView === 'accounts' ? 'active' : ''}`} onClick={() => setActiveView('accounts')}><Wallet size={18} /> Accounts</button>
          <button className={`nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => setActiveView('reports')}><Landmark size={18} /> Reports</button>
          <button className={`nav-item ${activeView === 'goals' ? 'active' : ''}`} onClick={() => setActiveView('goals')}><Wallet size={18} /> Savings goals <span className="nav-badge">{goals.length}</span></button>
          <button className={`nav-item ${activeView === 'loans' ? 'active' : ''}`} onClick={() => setActiveView('loans')}><Landmark size={18} /> Lending & loans <span className="nav-badge">{loans.length}</span></button>
        </nav>
        <div className="sidebar-bottom">
          {deferredPrompt && !appInstalled && <button className="nav-item" onClick={promptInstall}><MonitorDown size={18} /> Install app</button>}
          {appInstalled && <div className="installed-note"><Check size={15} /> Installed</div>}
          <button className={`nav-item ${activeView === 'categories' ? 'active' : ''}`} onClick={() => setActiveView('categories')}><Settings size={18} /> Categories</button>
          <button className="nav-item" onClick={() => setIsDataModalOpen(true)}><Download size={18} /> Backup & import</button>
          <button className="nav-item" onClick={() => setIsSyncOpen(true)}><RefreshCcw size={18} /> Sync {user ? <span className="nav-badge">on</span> : null}</button>
          <div className="profile"><div className="avatar">AK</div><div><strong>My finances</strong><small>Local workspace</small></div></div>
        </div>
      </aside>
      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><p className="eyebrow">{currentDateLabel}</p><h1>Good evening, Alok</h1></div><div className="top-actions"><span className="offline-dot">● Local & private</span><button className="icon-button" onClick={() => setIsSettingsOpen(true)} aria-label="Settings"><Settings size={19} /></button><div className="avatar">AK</div></div></header>
        {error && <div className="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {activeView === 'overview' ? <><section className="hero-grid">
          <div className="balance-card"><div className="card-label">Total balance <span className="pill">INR</span></div><div className="total-balance">{formatRupees(totalBalance)}</div><div className="balance-meta"><span className="positive">↑ 0.0%</span><span> this month</span></div><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></div>
          <MetricCard title="Income this month" value={formatRupees(monthIncome)} icon={<ArrowDownLeft size={18} />} tone="green" />
          <MetricCard title="Expenses this month" value={formatRupees(monthExpenses)} icon={<ArrowUpRight size={18} />} tone="red" />
          <div className="quick-card"><span className="card-label">Quick actions</span><button onClick={() => { setType('expense'); setIsAdding(true) }}><span className="quick-icon expense"><ArrowUpRight size={18} /></span>Add expense <ChevronRight size={16} /></button><button onClick={() => { setType('income'); setIsAdding(true) }}><span className="quick-icon income"><ArrowDownLeft size={18} /></span>Add income <ChevronRight size={16} /></button></div>
        </section>
        <section className="content-grid">
          <div className="panel transactions-panel"><div className="panel-heading"><div><p className="eyebrow">Activity</p><h2>Recent transactions</h2></div><button className="text-button">View all <ChevronRight size={15} /></button></div>{transactions.length === 0 ? <EmptyState /> : <div className="transaction-list">{transactions.map((transaction) => { const category = categories.find((item) => item.id === transaction.categoryId); const account = accounts.find((item) => item.id === transaction.accountId); return <div className="transaction-row" key={transaction.id}><div className={`transaction-icon ${transaction.type}`}><Receipt size={17} /></div><div className="transaction-info"><strong>{transaction.description}</strong><small>{category?.name ?? (transaction.type === 'transfer' ? 'Transfer' : 'Uncategorized')} · {account?.name ?? 'Account'}</small></div><time>{new Date(`${transaction.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</time><strong className={transaction.type === 'income' || transaction.type === 'transfer' ? 'positive amount' : 'amount'}>{transaction.type === 'income' ? '+' : transaction.type === 'transfer' ? '↔ ' : '-'}{formatRupees(transaction.amountPaise)}</strong><button className="delete-button" onClick={() => { setEditingTransaction(transaction); setType(transaction.type); setIsAdding(true) }} aria-label={`Edit ${transaction.description}`}><Settings size={15} /></button><button className="delete-button" onClick={() => transaction.id && deleteTransaction(transaction.id).then(refresh)} aria-label={`Delete ${transaction.description}`}><Trash2 size={15} /></button></div> })}</div>}<button className="add-transaction" onClick={() => { setEditingTransaction(null); setType('expense'); setIsAdding(true) }}><Plus size={17} /> Add transaction</button></div>
          <div className="right-column"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Where your money lives</p><h2>Accounts</h2></div><button className="icon-button" onClick={() => setIsAddingAccount(true)} aria-label="Add account"><Plus size={18} /></button></div><div className="account-list">{accounts.map((account) => <div className="account-row" key={account.id}><span className="account-color" style={{ background: account.color }}><Wallet size={17} /></span><div><strong>{account.name}</strong><small>{account.type.replace('-', ' ')}</small></div><b>{formatRupees(account.balancePaise)}</b></div>)}</div></div><div className="panel budget-panel"><div className="panel-heading"><div><p className="eyebrow">{new Date(`${currentMonth}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p><h2>Monthly budget</h2></div><button className="icon-button" onClick={() => setIsEditingBudget(true)} aria-label="Edit budget"><Settings size={16} /></button></div>{budget ? <><span className="budget-percent">{Math.round((monthExpenses / budget.amountPaise) * 100)}%</span><div className="progress-track"><div style={{ width: `${Math.min((monthExpenses / budget.amountPaise) * 100, 100)}%` }} /></div><div className="budget-footer"><span>{formatRupees(monthExpenses)} spent</span><span>of {formatRupees(budget.amountPaise)}</span></div></> : <><p className="budget-empty">Set a monthly limit to track spending.</p><button className="add-transaction" onClick={() => setIsEditingBudget(true)}>Set budget</button></>}</div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Automation</p><h2>Recurring</h2></div><button className="icon-button" onClick={() => setIsAddingRecurring(true)} aria-label="Add recurring transaction"><Plus size={18} /></button></div>{recurring.length === 0 ? <p className="budget-empty">No recurring payments yet.</p> : recurring.slice(0, 3).map((item) => <div className="account-row" key={item.id}><span className="account-color" style={{ background: item.type === 'income' ? '#dff5e9' : '#fdebe8', color: item.type === 'income' ? '#278c6c' : '#dc7168' }}><Repeat size={16} /></span><div><strong>{item.description}</strong><small>{item.frequency} · next {item.nextDueDate}</small></div><b>{formatRupees(item.amountPaise)}</b></div>)}</div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Targets</p><h2>Savings goals</h2></div><button className="icon-button" onClick={() => setIsAddingGoal(true)} aria-label="Add savings goal"><Plus size={18} /></button></div>{goals.length === 0 ? <p className="budget-empty">Create your first savings goal.</p> : goals.slice(0, 3).map((goal) => <div className="goal-row" key={goal.id}><div className="goal-heading"><strong>{goal.name}</strong><span>{Math.round((goal.savedPaise / goal.targetPaise) * 100)}% <button className="row-action" onClick={() => { setEditingGoal(goal); setIsAddingGoal(true) }} aria-label={`Manage ${goal.name}`}><Pencil size={12} /></button></span></div><div className="progress-track"><div style={{ width: `${Math.min((goal.savedPaise / goal.targetPaise) * 100, 100)}%`, background: goal.color }} /></div><small>{formatRupees(goal.savedPaise)} of {formatRupees(goal.targetPaise)}</small></div>)}</div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">People</p><h2>Lending & loans</h2></div><button className="icon-button" onClick={() => setIsAddingLoan(true)} aria-label="Add loan"><Plus size={18} /></button></div>{loans.length === 0 ? <p className="budget-empty">Track money lent or borrowed.</p> : loans.slice(0, 3).map((loan) => <div className="account-row" key={loan.id}><span className="account-color" style={{ background: loan.direction === 'lent' ? '#e5f6ed' : '#fff0ed', color: loan.direction === 'lent' ? '#278c6c' : '#dc7168' }}><Landmark size={16} /></span><div><strong>{loan.person}</strong><small>{loan.direction} · outstanding {formatRupees(loan.principalPaise - loan.repaidPaise)}</small></div><b>{loan.dueDate ?? 'No due date'}</b><button className="row-action" onClick={() => { setEditingLoan(loan); setIsAddingLoan(true) }} aria-label={`Manage ${loan.person}`}><Pencil size={13} /></button></div>)}</div></div>
        </section></> : activeView === 'transactions'
          ? <TransactionsView transactions={allTransactions} categories={categories} accounts={accounts} onEdit={(t) => { setEditingTransaction(t); setType(t.type); setIsAdding(true) }} onDelete={(id) => { if (id == null) return; deleteTransaction(id).then(refresh) }} />
          : activeView === 'accounts'
            ? <AccountsView accounts={accounts} onAdd={() => setIsAddingAccount(true)} onArchive={archiveAccount} />
            : activeView === 'categories'
              ? <CategoriesView categories={categories} transactions={allTransactions} onAdd={() => setIsAddingCategory(true)} onArchive={archiveCategory} />
              : activeView === 'recurring'
              ? <RecurringView recurring={recurring} onAdd={() => setIsAddingRecurring(true)} onToggle={toggleRecurring} onDelete={deleteRecurring} />
              : activeView === 'goals'
                ? <GoalsView goals={goals} onAdd={() => { setEditingGoal(null); setIsAddingGoal(true) }} onManage={(g) => { setEditingGoal(g); setIsAddingGoal(true) }} onDelete={deleteGoal} />
                : activeView === 'loans'
                  ? <LoansView loans={loans} onAdd={() => { setEditingLoan(null); setIsAddingLoan(true) }} onManage={(l) => { setEditingLoan(l); setIsAddingLoan(true) }} onDelete={deleteLoan} />
                  : <ReportView transactions={allTransactions} categories={categories} />}
      </main>
      {isAdding && <div className="modal-backdrop" onClick={() => { setIsAdding(false); setEditingTransaction(null) }}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{editingTransaction ? 'Edit entry' : 'New entry'}</p><h2>{editingTransaction ? 'Edit transaction' : 'Add transaction'}</h2></div><button className="icon-button" onClick={() => { setIsAdding(false); setEditingTransaction(null) }} aria-label="Close"><X /></button></div><div className="type-switcher">{(['expense', 'income', 'transfer'] as TransactionType[]).map((option) => <button key={option} className={type === option ? 'selected' : ''} onClick={() => setType(option)} type="button">{option[0].toUpperCase() + option.slice(1)}</button>)}</div><form onSubmit={submitTransaction}><label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={editingTransaction ? (editingTransaction.amountPaise / 100).toFixed(2) : ''} autoFocus required /></label><div className="form-grid"><label>Account<select name="accountId" defaultValue={editingTransaction?.accountId} required>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>{type === 'transfer' ? <label>To account<select name="destinationAccountId" defaultValue={editingTransaction?.destinationAccountId} required>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label> : <label>Category<select name="categoryId" defaultValue={editingTransaction?.categoryId} required>{categories.filter((category) => category.type === type).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>}</div><div className="form-grid"><label>Date<input name="date" type="date" defaultValue={editingTransaction?.date ?? today} required /></label><label>Description<input name="description" defaultValue={editingTransaction?.description ?? ''} placeholder="e.g. Morning coffee" /></label></div><button className="primary-button" type="submit">{editingTransaction ? 'Update transaction' : 'Save transaction'}</button></form></div></div>}
      {isAddingAccount && <div className="modal-backdrop" onClick={() => setIsAddingAccount(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">New account</p><h2>Add account</h2></div><button className="icon-button" onClick={() => setIsAddingAccount(false)} aria-label="Close"><X /></button></div><form onSubmit={submitAccount}><label>Account name<input name="name" placeholder="e.g. HDFC savings" autoFocus required /></label><div className="form-grid"><label>Type<select name="type" defaultValue="savings"><option value="cash">Cash wallet</option><option value="savings">Savings bank</option><option value="current">Current bank</option><option value="credit-card">Credit card</option><option value="wallet">Digital wallet</option><option value="other">Other</option></select></label><label>Opening balance<input name="openingBalance" inputMode="decimal" defaultValue="0" required /></label></div><label>Color<input name="color" type="color" defaultValue="#14b8a6" /></label><button className="primary-button" type="submit">Save account</button></form></div></div>}
      {isAddingCategory && <div className="modal-backdrop" onClick={() => setIsAddingCategory(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Customize</p><h2>Add category</h2></div><button className="icon-button" onClick={() => setIsAddingCategory(false)} aria-label="Close"><X /></button></div><form onSubmit={submitCategory}><label>Category name<input name="name" placeholder="e.g. Pet care" autoFocus required /></label><div className="form-grid"><label>Type<select name="type" defaultValue="expense"><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Color<input name="color" type="color" defaultValue="#64748b" /></label></div><button className="primary-button" type="submit">Save category</button></form></div></div>}
      {isEditingBudget && <div className="modal-backdrop" onClick={() => setIsEditingBudget(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Monthly planning</p><h2>{budget ? 'Edit budget' : 'Set budget'}</h2></div><button className="icon-button" onClick={() => setIsEditingBudget(false)} aria-label="Close"><X /></button></div><form onSubmit={submitBudget}><label>Monthly limit<input name="amount" inputMode="decimal" defaultValue={budget ? (budget.amountPaise / 100).toFixed(2) : ''} placeholder="5000" autoFocus required /></label><button className="primary-button" type="submit">Save budget</button></form></div></div>}
      {isAddingRecurring && <RecurringModal accounts={accounts} categories={categories} onClose={() => setIsAddingRecurring(false)} onSaved={refresh} />}
      {isAddingGoal && <GoalModal goal={editingGoal} onClose={() => { setIsAddingGoal(false); setEditingGoal(null) }} onSaved={refresh} />}
      {isAddingLoan && <LoanModal loan={editingLoan} onClose={() => { setIsAddingLoan(false); setEditingLoan(null) }} onSaved={refresh} />}
      {isDataModalOpen && <DataModal inputRef={backupInput} onClose={() => setIsDataModalOpen(false)} onRestored={refresh} />}
      {isSettingsOpen && <SettingsModal settings={settings} onChange={updateSettings} onReset={resetData} onClose={() => setIsSettingsOpen(false)} onLock={() => { setLocked(true); setIsSettingsOpen(false) }} />}
      {isSyncOpen && <SyncModal user={user} status={syncStatus} onClose={() => setIsSyncOpen(false)} onSignIn={handleSignIn} onSignUp={handleSignUp} onSignOut={handleSignOut} onSync={handleManualSync} />}
    </div>
  )
}

function MetricCard({ title, value, icon, tone }: { title: string; value: string; icon: ReactNode; tone: 'green' | 'red' }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span className="card-label">{title}</span><strong>{value}</strong><small className={tone === 'green' ? 'positive' : 'muted'}>{tone === 'green' ? '↑ Income received' : '↓ Spending tracked'}</small></div>
}

function EmptyState() {
  return <div className="empty-state"><Receipt size={30} /><strong>Your activity will appear here</strong><span>Add your first expense or income to get started.</span></div>
}

function RecurringModal({ accounts, categories, onClose, onSaved }: { accounts: Account[]; categories: Category[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = parseAmountToPaise(String(form.get('amount') ?? ''))
    await db.recurringTransactions.add({
      type,
      amountPaise: amount,
      accountId: String(form.get('accountId')),
      categoryId: String(form.get('categoryId')),
      description: String(form.get('description') ?? '').trim() || 'Recurring transaction',
      frequency: String(form.get('frequency') ?? 'monthly') as RecurringTransaction['frequency'],
      nextDueDate: String(form.get('nextDueDate') ?? today),
      active: true,
      id: newId(),
      deleted: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
    await onSaved()
    onClose()
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Automation</p><h2>New recurring transaction</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div><div className="type-switcher"><button className={type === 'expense' ? 'selected' : ''} onClick={() => setType('expense')} type="button">Expense</button><button className={type === 'income' ? 'selected' : ''} onClick={() => setType('income')} type="button">Income</button></div><form onSubmit={save}><label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" autoFocus required /></label><div className="form-grid"><label>Account<select name="accountId" required>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>Category<select name="categoryId" required>{categories.filter((category) => category.type === type).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><div className="form-grid"><label>Frequency<select name="frequency" defaultValue="monthly"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label>Next due date<input name="nextDueDate" type="date" defaultValue={today} required /></label></div><label>Description<input name="description" placeholder="e.g. Internet bill" /></label><button className="primary-button" type="submit">Save recurring transaction</button></form></div></div>
}

function GoalModal({ goal, onClose, onSaved }: { goal: SavingsGoal | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [adjust, setAdjust] = useState<'contribute' | 'withdraw' | 'none'>('none')
  const [message, setMessage] = useState('')
  const saveGoal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const target = parseAmountToPaise(String(form.get('target') ?? ''))
    const data = { name: String(form.get('name') ?? '').trim() || 'Savings goal', targetPaise: target, targetDate: String(form.get('targetDate') ?? '') || undefined, color: String(form.get('color') ?? '#43b58d') }
    if (goal?.id) await db.savingsGoals.update(goal.id, { ...data, updatedAt: new Date().toISOString() })
    else await db.savingsGoals.add({ ...data, savedPaise: 0, id: newId(), deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    await onSaved()
    onClose()
  }
  const adjustBalance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!goal?.id) return
    try {
      const form = new FormData(event.currentTarget)
      const amount = parseAmountToPaise(String(form.get('amount') ?? ''))
      const next = adjust === 'contribute'
        ? Math.min(goal.targetPaise, goal.savedPaise + amount)
        : Math.max(0, goal.savedPaise - amount)
      await db.savingsGoals.update(goal.id, { savedPaise: next, updatedAt: new Date().toISOString() })
      await onSaved()
      onClose()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Invalid amount.')
    }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Plan ahead</p><h2>{goal ? 'Manage savings goal' : 'New savings goal'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
    {goal && <div className="track-summary"><div className="progress-track"><div style={{ width: `${Math.min((goal.savedPaise / goal.targetPaise) * 100, 100)}%`, background: goal.color }} /></div><small>{formatRupees(goal.savedPaise)} of {formatRupees(goal.targetPaise)} saved</small></div>}
    {message && <div className="alert">{message}<button onClick={() => setMessage('')} aria-label="Dismiss"><X size={14} /></button></div>}
    {goal && <div className="type-switcher"><button className={adjust === 'contribute' ? 'selected' : ''} type="button" onClick={() => setAdjust('contribute')}>Contribute</button><button className={adjust === 'withdraw' ? 'selected' : ''} type="button" onClick={() => setAdjust('withdraw')}>Withdraw</button><button className={adjust === 'none' ? 'selected' : ''} type="button" onClick={() => setAdjust('none')}>Details</button></div>}
    {goal && adjust !== 'none'
      ? <form onSubmit={adjustBalance}><label>{adjust === 'contribute' ? 'Add to savings' : 'Withdraw from savings'}<input name="amount" inputMode="decimal" placeholder="0.00" autoFocus required /></label><button className="primary-button" type="submit">{adjust === 'contribute' ? 'Add contribution' : 'Withdraw'}</button></form>
      : <form onSubmit={saveGoal}><label>Goal name<input name="name" defaultValue={goal?.name ?? ''} placeholder="e.g. Emergency fund" autoFocus required /></label><label>Target amount<input name="target" inputMode="decimal" defaultValue={goal ? (goal.targetPaise / 100).toFixed(2) : ''} placeholder="80000" required /></label><div className="form-grid"><label>Target date<input name="targetDate" type="date" defaultValue={goal?.targetDate ?? ''} /></label><label>Color<input name="color" type="color" defaultValue={goal?.color ?? '#43b58d'} /></label></div><button className="primary-button" type="submit">{goal ? 'Update goal' : 'Save goal'}</button></form>}
  </div></div>
}

function LoanModal({ loan, onClose, onSaved }: { loan: Loan | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [tab, setTab] = useState<'record' | 'repay'>('record')
  const [message, setMessage] = useState('')
  const outstanding = loan ? Math.max(0, loan.principalPaise - loan.repaidPaise) : 0
  const saveLoan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const data = { direction: String(form.get('direction') ?? 'lent') as Loan['direction'], person: String(form.get('person') ?? '').trim() || 'Unnamed person', principalPaise: parseAmountToPaise(String(form.get('amount') ?? '')), dueDate: String(form.get('dueDate') ?? '') || undefined, notes: String(form.get('notes') ?? '') }
    if (loan?.id) await db.loans.update(loan.id, { ...data, updatedAt: new Date().toISOString() })
    else await db.loans.add({ ...data, repaidPaise: 0, id: newId(), deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    await onSaved()
    onClose()
  }
  const recordRepayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!loan?.id) return
    try {
      const form = new FormData(event.currentTarget)
      const amount = parseAmountToPaise(String(form.get('amount') ?? ''))
      if (amount > outstanding) throw new Error('Repayment exceeds the outstanding balance.')
      await db.loans.update(loan.id, { repaidPaise: loan.repaidPaise + amount, updatedAt: new Date().toISOString() })
      await onSaved()
      onClose()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Invalid amount.')
    }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">People & money</p><h2>{loan ? 'Manage lending / borrowing' : 'Track lending or borrowing'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
    {loan && <div className="track-summary"><div className="report-card compact"><span>Outstanding</span><strong>{formatRupees(outstanding)}</strong><small>{formatRupees(loan.repaidPaise)} repaid of {formatRupees(loan.principalPaise)}</small></div></div>}
    {message && <div className="alert">{message}<button onClick={() => setMessage('')} aria-label="Dismiss"><X size={14} /></button></div>}
    {loan && <div className="type-switcher"><button className={tab === 'repay' ? 'selected' : ''} type="button" onClick={() => setTab('repay')}>Record repayment</button><button className={tab === 'record' ? 'selected' : ''} type="button" onClick={() => setTab('record')}>Details</button></div>}
    {loan && tab === 'repay'
      ? <form onSubmit={recordRepayment}><label>Repayment amount<input name="amount" inputMode="decimal" placeholder="0.00" autoFocus required /></label><button className="primary-button" type="submit">Record repayment</button></form>
      : <form onSubmit={saveLoan}><div className="form-grid"><label>Direction<select name="direction" defaultValue={loan?.direction ?? 'lent'}><option value="lent">Money lent</option><option value="borrowed">Money borrowed</option></select></label><label>Person<input name="person" defaultValue={loan?.person ?? ''} placeholder="Name" required /></label></div><label>Total amount<input name="amount" inputMode="decimal" defaultValue={loan ? (loan.principalPaise / 100).toFixed(2) : ''} placeholder="0.00" required /></label><div className="form-grid"><label>Due date<input name="dueDate" type="date" defaultValue={loan?.dueDate ?? ''} /></label><label>Notes<input name="notes" defaultValue={loan?.notes ?? ''} placeholder="Optional notes" /></label></div><button className="primary-button" type="submit">{loan ? 'Update record' : 'Save record'}</button></form>}
  </div></div>
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
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Local data</p><h2>Backup & restore</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div><p className="budget-empty">Download every account, category, transaction, budget, schedule, goal, and loan as one validated JSON backup.</p><div className="data-actions"><button className="primary-button" onClick={downloadBackup}><Download size={15} /> Download backup</button><button className="secondary-button" onClick={() => inputRef.current?.click()}>Restore JSON backup</button><input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={restore} /></div>{message && <div className="alert">{message}</div>}</div></div>
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
  const expenses = filtered.filter((item) => item.type === 'expense')
  const income = filtered.filter((item) => item.type === 'income')
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amountPaise, 0)
  const incomeTotal = income.reduce((sum, item) => sum + item.amountPaise, 0)
  const categoryTotals = categories
    .filter((category) => category.type === 'expense')
    .map((category) => ({ ...category, total: expenses.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amountPaise, 0) }))
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total)
  const exportCsv = () => {
    const rows = [['Date', 'Type', 'Description', 'Category', 'Amount']]
    filtered.forEach((item) => rows.push([item.date, item.type, item.description, categories.find((category) => category.id === item.categoryId)?.name ?? 'Transfer', (item.amountPaise / 100).toFixed(2)]))
    const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `myfinance-report-${range}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Analytics</p><h2>Financial reports</h2><p className="report-subtitle">A clear view of your real spending activity.</p></div><div className="report-actions"><select value={range} onChange={(event) => setRange(event.target.value as typeof range)}><option value="month">This month</option><option value="year">This year</option><option value="all">All time</option></select><button className="export-button" onClick={exportCsv}><Download size={15} /> Export CSV</button></div></div>
    <div className="report-summary"><div className="report-card"><span>Income</span><strong className="positive">{formatRupees(incomeTotal)}</strong><small>{income.length} entries</small></div><div className="report-card"><span>Expenses</span><strong className="negative">{formatRupees(expenseTotal)}</strong><small>{expenses.length} entries</small></div><div className="report-card"><span>Net savings</span><strong className={incomeTotal - expenseTotal >= 0 ? 'positive' : 'negative'}>{formatRupees(incomeTotal - expenseTotal)}</strong><small>{incomeTotal ? `${Math.round(((incomeTotal - expenseTotal) / incomeTotal) * 100)}% savings rate` : 'No income recorded'}</small></div></div>
    <div className="report-columns"><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Breakdown</p><h2>Spending by category</h2></div></div>{categoryTotals.length === 0 ? <EmptyState /> : <div className="category-bars">{categoryTotals.map((category) => <div className="category-bar" key={category.id}><div><span>{category.name}</span><b>{formatRupees(category.total)}</b></div><div className="bar-track"><div style={{ width: `${(category.total / categoryTotals[0].total) * 100}%`, background: category.color }} /></div></div>)}</div>}</div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Ledger</p><h2>Report transactions</h2></div></div><div className="report-rows">{filtered.slice(0, 10).map((item) => <div className="report-row" key={item.id}><span>{item.date}</span><strong>{item.description}</strong><b className={item.type === 'income' ? 'positive' : item.type === 'expense' ? 'negative' : ''}>{item.type === 'income' ? '+' : item.type === 'expense' ? '-' : '↔'}{formatRupees(item.amountPaise)}</b></div>)}{filtered.length === 0 && <p className="budget-empty">No transactions in this period.</p>}</div></div></div>
  </section>
}

function TransactionsView({ transactions, categories, accounts, onEdit, onDelete }: { transactions: Transaction[]; categories: Category[]; accounts: Account[]; onEdit: (t: Transaction) => void; onDelete: (id?: string) => void }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'amount'>('newest')
  const filtered = useMemo(() => {
    let rows = transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (accountFilter !== 'all' && t.accountId !== accountFilter && t.destinationAccountId !== accountFilter) return false
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
  }, [transactions, query, typeFilter, accountFilter, sort, categories])
  const total = filtered.reduce((sum, t) => sum + t.amountPaise, 0)
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Ledger</p><h2>All transactions</h2><p className="report-subtitle">{filtered.length} entries · {formatRupees(total)} total volume</p></div></div>
    <div className="history-toolbar">
      <div className="search-box"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description or category" /></div>
      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}><option value="all">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select>
      <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}><option value="all">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Highest amount</option></select>
    </div>
    <div className="panel"><div className="report-rows">{filtered.length === 0 ? <EmptyState /> : filtered.map((item) => {
      const category = categories.find((c) => c.id === item.categoryId)
      const account = accounts.find((a) => a.id === item.accountId)
      return <div className="history-row" key={item.id}><div className="transaction-info"><strong>{item.description}</strong><small>{category?.name ?? (item.type === 'transfer' ? 'Transfer' : 'Uncategorized')} · {account?.name ?? 'Account'} · {item.date}</small></div><b className={item.type === 'income' ? 'positive' : item.type === 'expense' ? 'negative' : ''}>{item.type === 'income' ? '+' : item.type === 'expense' ? '-' : '↔'}{formatRupees(item.amountPaise)}</b><button className="row-action" onClick={() => onEdit(item)} aria-label="Edit"><Pencil size={14} /></button><button className="row-action danger" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 size={14} /></button></div>
    })}</div></div>
  </section>
}

function SettingsModal({ settings, onChange, onReset, onClose, onLock }: { settings: AppSettings; onChange: (next: Partial<AppSettings>) => void; onReset: () => Promise<void>; onClose: () => void; onLock: () => void }) {
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const savePin = () => {
    if (pinInput.length < 4) { setPinError('PIN must be at least 4 digits.'); return }
    onChange({ pin: pinInput })
    setPinInput('')
    setPinError('')
  }
  const clearPin = () => { onChange({ pin: null }); setPinInput(''); setPinError('') }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Preferences</p><h2>Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></div>
    <div className="settings-section"><h3>Appearance</h3><div className="type-switcher two"><button className={settings.theme === 'light' ? 'selected' : ''} type="button" onClick={() => onChange({ theme: 'light' })}><Sun size={15} /> Light</button><button className={settings.theme === 'dark' ? 'selected' : ''} type="button" onClick={() => onChange({ theme: 'dark' })}><Moon size={15} /> Dark</button></div></div>
    <div className="settings-section"><h3>Privacy</h3>{settings.pin ? <><p className="report-subtitle">A PIN is enabled to open this app.</p><div className="data-actions"><button className="secondary-button" onClick={onLock}><Lock size={15} /> Lock now</button><button className="danger-button" onClick={clearPin}>Remove PIN</button></div></> : <><p className="report-subtitle">Lock the app behind a 4+ digit PIN. This protects access but does not encrypt data on disk.</p><div className="pin-row"><input inputMode="numeric" maxLength={6} value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))} placeholder="New PIN" /><button className="primary-button" onClick={savePin}>Set PIN</button></div>{pinError && <div className="alert">{pinError}</div>}</>}</div>
    <div className="settings-section"><h3>Data</h3><div className="data-actions"><button className="danger-button" onClick={onReset}><RefreshCcw size={15} /> Reset all data</button></div></div>
  </div></div>
}

function PinScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const settings = loadSettings()
    if (settings.pin && value === settings.pin) onUnlock()
    else setError('Incorrect PIN.')
  }
  return <div className="pin-screen"><div className="pin-card"><div className="brand" style={{ justifyContent: 'center', paddingBottom: 12 }}><div className="brand-mark"><CircleDollarSign size={23} /></div><span>myfinance</span></div><h2>Enter your PIN</h2><form onSubmit={submit}><input inputMode="numeric" autoFocus type="password" maxLength={8} value={value} onChange={(e) => setValue(e.target.value)} placeholder="••••" /><button className="primary-button" type="submit">Unlock</button></form>{error && <div className="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}</div></div>
}

function AccountsView({ accounts, onAdd, onArchive }: { accounts: (Account & { balancePaise: number })[]; onAdd: () => void; onArchive: (id?: string) => void }) {
  const total = accounts.reduce((sum, a) => sum + a.balancePaise, 0)
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Cash & banks</p><h2>Accounts</h2><p className="report-subtitle">{accounts.length} accounts · {formatRupees(total)} combined</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add account</button></div>
    <div className="account-grid">{accounts.length === 0 ? <EmptyState /> : accounts.map((account) => <div className="panel account-card" key={account.id}><div className="account-card-top"><span className="account-color" style={{ background: account.color }}><Wallet size={17} /></span><button className="row-action danger" onClick={() => onArchive(account.id)} aria-label="Archive account"><Trash2 size={14} /></button></div><strong className="account-card-name">{account.name}</strong><small className="account-card-type">{account.type.replace('-', ' ')}</small><div className="account-card-balance">{formatRupees(account.balancePaise)}</div></div>)}</div>
  </section>
}

function RecurringView({ recurring, onAdd, onToggle, onDelete }: { recurring: RecurringTransaction[]; onAdd: () => void; onToggle: (item: RecurringTransaction) => void; onDelete: (id?: string) => void }) {
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Automation</p><h2>Recurring transactions</h2><p className="report-subtitle">{recurring.length} active schedules</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add recurring</button></div>
    <div className="panel"><div className="report-rows">{recurring.length === 0 ? <EmptyState /> : recurring.map((item) => <div className="history-row" key={item.id}><div className="transaction-info"><strong>{item.description}</strong><small>{item.frequency} · next due {item.nextDueDate}</small></div><b className={item.type === 'income' ? 'positive' : 'negative'}>{item.type === 'income' ? '+' : '-'}{formatRupees(item.amountPaise)}</b><button className="row-action" onClick={() => onToggle(item)} aria-label="Pause or resume"><Repeat size={15} /></button><button className="row-action danger" onClick={() => onDelete(item.id)} aria-label="Delete"><Trash2 size={14} /></button></div>)}</div></div>
  </section>
}

function GoalsView({ goals, onAdd, onManage, onDelete }: { goals: SavingsGoal[]; onAdd: () => void; onManage: (goal: SavingsGoal) => void; onDelete: (id?: string) => void }) {
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Targets</p><h2>Savings goals</h2><p className="report-subtitle">{goals.length} goals</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> New goal</button></div>
    <div className="account-grid">{goals.length === 0 ? <EmptyState /> : goals.map((goal) => <div className="panel goal-card" key={goal.id}><div className="goal-heading"><strong>{goal.name}</strong><span>{Math.round((goal.savedPaise / goal.targetPaise) * 100)}%</span></div><div className="progress-track"><div style={{ width: `${Math.min((goal.savedPaise / goal.targetPaise) * 100, 100)}%`, background: goal.color }} /></div><small className="goal-sub">{formatRupees(goal.savedPaise)} of {formatRupees(goal.targetPaise)} saved</small><div className="card-actions"><button className="secondary-button" onClick={() => onManage(goal)}>Manage</button><button className="row-action danger" onClick={() => onDelete(goal.id)} aria-label="Delete"><Trash2 size={15} /></button></div></div>)}</div>
  </section>
}

function LoansView({ loans, onAdd, onManage, onDelete }: { loans: Loan[]; onAdd: () => void; onManage: (loan: Loan) => void; onDelete: (id?: string) => void }) {
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">People</p><h2>Lending & loans</h2><p className="report-subtitle">{loans.length} records</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Track money</button></div>
    <div className="panel"><div className="report-rows">{loans.length === 0 ? <EmptyState /> : loans.map((loan) => { const outstanding = Math.max(0, loan.principalPaise - loan.repaidPaise); return <div className="history-row" key={loan.id}><div className="transaction-info"><strong>{loan.person}</strong><small>{loan.direction} · {loan.dueDate ? `due ${loan.dueDate}` : 'no due date'}</small></div><b className={loan.direction === 'lent' ? 'positive' : 'negative'}>{formatRupees(outstanding)}</b><button className="row-action" onClick={() => onManage(loan)} aria-label="Manage"><Pencil size={14} /></button><button className="row-action danger" onClick={() => onDelete(loan.id)} aria-label="Delete"><Trash2 size={14} /></button></div> })}</div></div>
  </section>
}

function CategoriesView({ categories, transactions, onAdd, onArchive }: { categories: Category[]; transactions: Transaction[]; onAdd: () => void; onArchive: (id?: string) => void }) {
  const usage = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) if (t.categoryId) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + 1)
    return map
  }, [transactions])
  const renderGroup = (type: Category['type']) => {
    const group = categories.filter((c) => c.type === type)
    if (group.length === 0) return <EmptyState />
    return <div className="category-grid">{group.map((category) => {
      const count = usage.get(category.id) ?? 0
      return <div className="panel category-card" key={category.id}><div className="category-card-top"><span className="account-color" style={{ background: category.color }}><Settings size={17} /></span><button className="row-action danger" onClick={() => onArchive(category.id)} aria-label="Archive category"><Trash2 size={14} /></button></div><strong>{category.name}</strong><small>{count === 0 ? 'Unused' : `${count} transaction${count === 1 ? '' : 's'}`}</small></div>
    })}</div>
  }
  return <section className="reports-view">
    <div className="report-toolbar"><div><p className="eyebrow">Customize</p><h2>Categories</h2><p className="report-subtitle">{categories.length} active categories</p></div><button className="primary-button add-button" onClick={onAdd}><Plus size={15} /> Add category</button></div>
    <div className="settings-section"><h3>Expense categories</h3>{renderGroup('expense')}</div>
    <div className="settings-section"><h3>Income categories</h3>{renderGroup('income')}</div>
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
