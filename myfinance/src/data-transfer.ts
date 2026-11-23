import { db } from './database'
import type { Debt, DebtPayment, Transaction } from './types'

export interface BackupPayload {
  version: 4
  exportedAt: string
  transactions: Transaction[]
  debts: Debt[]
  debtPayments: DebtPayment[]
}

export async function createBackup(): Promise<BackupPayload> {
  const [transactions, debts, debtPayments] = await Promise.all([
    db.transactions.toArray(),
    db.debts.toArray(),
    db.debtPayments.toArray(),
  ])
  return { version: 4, exportedAt: new Date().toISOString(), transactions, debts, debtPayments }
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function validateBackup(value: unknown): asserts value is BackupPayload {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 4) throw new Error('Unsupported backup format.')
  const backup = value as Partial<BackupPayload>
  if (![backup.transactions, backup.debts, backup.debtPayments].every(isArray)) {
    throw new Error('Backup is missing one or more data collections.')
  }
}

export async function restoreBackup(backup: BackupPayload) {
  validateBackup(backup)
  await db.transaction('rw', db.transactions, db.debts, db.debtPayments, async () => {
    await Promise.all([db.transactions.clear(), db.debts.clear(), db.debtPayments.clear()])
    await db.transactions.bulkAdd(backup.transactions)
    await db.debts.bulkAdd(backup.debts)
    await db.debtPayments.bulkAdd(backup.debtPayments)
  })
}
