import { db } from './database'
import type { Account, Budget, Category, Loan, RecurringTransaction, SavingsGoal, Transaction } from './types'

export interface BackupPayload {
  version: 2
  exportedAt: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  recurringTransactions: RecurringTransaction[]
  savingsGoals: SavingsGoal[]
  loans: Loan[]
}

export async function createBackup(): Promise<BackupPayload> {
  const [accounts, categories, transactions, budgets, recurringTransactions, savingsGoals, loans] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.recurringTransactions.toArray(),
    db.savingsGoals.toArray(),
    db.loans.toArray(),
  ])
  return { version: 2, exportedAt: new Date().toISOString(), accounts, categories, transactions, budgets, recurringTransactions, savingsGoals, loans }
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function validateBackup(value: unknown): asserts value is BackupPayload {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 2) throw new Error('Unsupported backup format.')
  const backup = value as Partial<BackupPayload>
  if (![backup.accounts, backup.categories, backup.transactions, backup.budgets, backup.recurringTransactions, backup.savingsGoals, backup.loans].every(isArray)) {
    throw new Error('Backup is missing one or more data collections.')
  }
}

export async function restoreBackup(backup: BackupPayload) {
  validateBackup(backup)
  await db.transaction('rw', db.accounts, db.categories, db.transactions, db.budgets, async () => {
    await Promise.all([db.accounts.clear(), db.categories.clear(), db.transactions.clear(), db.budgets.clear()])
    await db.accounts.bulkAdd(backup.accounts)
    await db.categories.bulkAdd(backup.categories)
    await db.transactions.bulkAdd(backup.transactions)
    await db.budgets.bulkAdd(backup.budgets)
  })
  await db.transaction('rw', db.recurringTransactions, db.savingsGoals, db.loans, async () => {
    await Promise.all([db.recurringTransactions.clear(), db.savingsGoals.clear(), db.loans.clear()])
    await db.recurringTransactions.bulkAdd(backup.recurringTransactions)
    await db.savingsGoals.bulkAdd(backup.savingsGoals)
    await db.loans.bulkAdd(backup.loans)
  })
}
