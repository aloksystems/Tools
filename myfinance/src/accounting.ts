import { db } from './database'
import type { Transaction } from './types'
import { newId } from './types'

export function parseAmountToPaise(value: string): number {
  const amount = Number(value.replace(/,/g, '').trim())
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.')
  return Math.round(amount * 100)
}

export function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100)
}

function nowIso() {
  return new Date().toISOString()
}

export async function addTransaction(transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
  const now = nowIso()
  return db.transactions.add({ ...transaction, id: newId(), deleted: false, createdAt: now, updatedAt: now })
}

export async function updateTransaction(id: string, changes: Partial<Omit<Transaction, 'id' | 'createdAt'>>) {
  return db.transactions.update(id, { ...changes, updatedAt: nowIso() })
}

/** Soft-deletes a transaction (tombstone) so sync can propagate the removal. */
export async function deleteTransaction(id: string) {
  return db.transactions.update(id, { deleted: true, updatedAt: nowIso() })
}

export function monthKey(date: string) {
  return date.slice(0, 7)
}
