import { db } from './database'
import type { Category, Transaction } from './types'

export interface BackupPayload {
  version: 3
  exportedAt: string
  categories: Category[]
  transactions: Transaction[]
}

export async function createBackup(): Promise<BackupPayload> {
  const [categories, transactions] = await Promise.all([
    db.categories.toArray(),
    db.transactions.toArray(),
  ])
  return { version: 3, exportedAt: new Date().toISOString(), categories, transactions }
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function validateBackup(value: unknown): asserts value is BackupPayload {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 3) throw new Error('Unsupported backup format.')
  const backup = value as Partial<BackupPayload>
  if (![backup.categories, backup.transactions].every(isArray)) {
    throw new Error('Backup is missing one or more data collections.')
  }
}

export async function restoreBackup(backup: BackupPayload) {
  validateBackup(backup)
  await db.transaction('rw', db.categories, db.transactions, async () => {
    await Promise.all([db.categories.clear(), db.transactions.clear()])
    await db.categories.bulkAdd(backup.categories)
    await db.transactions.bulkAdd(backup.transactions)
  })
}
