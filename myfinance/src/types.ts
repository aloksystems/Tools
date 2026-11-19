export type TransactionType = 'expense' | 'income' | 'transfer'

export type AccountType =
  | 'cash'
  | 'savings'
  | 'current'
  | 'credit-card'
  | 'wallet'
  | 'other'

/** Common fields every synchronizable record carries for last-write-wins sync. */
export interface SyncFields {
  updatedAt: string
  deleted: boolean
}

export interface Account extends SyncFields {
  id: string
  name: string
  type: AccountType
  openingBalancePaise: number
  color: string
  archived: boolean
  createdAt: string
}

export interface Category extends SyncFields {
  id: string
  name: string
  type: 'expense' | 'income'
  color: string
  archived: boolean
}

export interface Transaction extends SyncFields {
  id: string
  type: TransactionType
  amountPaise: number
  categoryId?: string
  accountId: string
  destinationAccountId?: string
  description: string
  date: string
  createdAt: string
  recurringId?: string
  occurrenceDate?: string
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringTransaction extends SyncFields {
  id: string
  type: 'expense' | 'income'
  amountPaise: number
  categoryId: string
  accountId: string
  description: string
  frequency: RecurrenceFrequency
  nextDueDate: string
  active: boolean
  createdAt: string
}

export interface SavingsGoal extends SyncFields {
  id: string
  name: string
  targetPaise: number
  savedPaise: number
  targetDate?: string
  color: string
  createdAt: string
}

export interface Loan extends SyncFields {
  id: string
  direction: 'lent' | 'borrowed'
  person: string
  principalPaise: number
  repaidPaise: number
  dueDate?: string
  notes: string
  createdAt: string
}

export interface Budget extends SyncFields {
  id: string
  month: string
  amountPaise: number
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
