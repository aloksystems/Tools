import { db } from './database'
import type { Debt, DebtPayment, Transaction } from './types'
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

export async function addDebt(debt: Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
  const now = nowIso()
  return db.debts.add({ ...debt, id: newId(), deleted: false, createdAt: now, updatedAt: now })
}

export async function updateDebt(id: string, changes: Partial<Omit<Debt, 'id' | 'createdAt'>>) {
  return db.debts.update(id, { ...changes, updatedAt: nowIso() })
}

/** Soft-deletes a debt (tombstone) so sync can propagate the removal. */
export async function deleteDebt(id: string) {
  return db.debts.update(id, { deleted: true, updatedAt: nowIso() })
}

export async function addDebtPayment(payment: Omit<DebtPayment, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>) {
  const now = nowIso()
  return db.debtPayments.add({ ...payment, id: newId(), deleted: false, createdAt: now, updatedAt: now })
}

/** Soft-deletes a payment (tombstone) so sync can propagate the removal. */
export async function deleteDebtPayment(id: string) {
  return db.debtPayments.update(id, { deleted: true, updatedAt: nowIso() })
}

/** Outstanding balance owed on a debt after all recorded repayments. */
export function outstandingPaise(debt: Debt, payments: DebtPayment[]): number {
  const paid = payments
    .filter((p) => p.debtId === debt.id && !p.deleted)
    .reduce((sum, p) => sum + p.amountPaise, 0)
  return Math.max(0, debt.amountPaise - paid)
}

export function monthKey(date: string) {
  return date.slice(0, 7)
}
