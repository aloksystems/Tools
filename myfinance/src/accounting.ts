import { db } from './database'
import type { RecurringTransaction, Transaction } from './types'
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

export async function getAccountBalances() {
  const [accounts, transactions] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.filter((t) => !t.deleted).toArray(),
  ])
  return accounts.map((account) => {
    const balance = transactions.reduce((total, transaction) => {
      if (transaction.accountId === account.id) {
        total += transaction.type === 'income' ? transaction.amountPaise : -transaction.amountPaise
      }
      if (transaction.type === 'transfer' && transaction.destinationAccountId === account.id) {
        total += transaction.amountPaise
      }
      return total
    }, account.openingBalancePaise)
    return { ...account, balancePaise: balance }
  })
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

function advanceDate(date: string, frequency: RecurringTransaction['frequency']) {
  const next = new Date(`${date}T12:00:00`)
  if (frequency === 'daily') next.setDate(next.getDate() + 1)
  if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  if (frequency === 'monthly') next.setMonth(next.getMonth() + 1)
  if (frequency === 'yearly') next.setFullYear(next.getFullYear() + 1)
  return next.toISOString().slice(0, 10)
}

export async function processDueRecurringTransactions(today = new Date().toISOString().slice(0, 10)) {
  const due = await db.recurringTransactions.filter((item) => item.active && item.nextDueDate <= today && !item.deleted).toArray()
  for (const schedule of due) {
    const recurringId = schedule.id
    await db.transaction('rw', db.transactions, db.recurringTransactions, async () => {
      let occurrenceDate = schedule.nextDueDate
      while (occurrenceDate <= today) {
        const duplicate = await db.transactions.filter((item) => item.recurringId === recurringId && item.occurrenceDate === occurrenceDate).first()
        if (!duplicate) {
          const now = nowIso()
          await db.transactions.add({
            id: newId(),
            type: schedule.type,
            amountPaise: schedule.amountPaise,
            accountId: schedule.accountId,
            categoryId: schedule.categoryId,
            description: schedule.description,
            date: occurrenceDate,
            recurringId,
            occurrenceDate,
            deleted: false,
            createdAt: now,
            updatedAt: now,
          })
        }
        occurrenceDate = advanceDate(occurrenceDate, schedule.frequency)
      }
      await db.recurringTransactions.update(recurringId, { nextDueDate: occurrenceDate, updatedAt: nowIso() })
    })
  }
}

export function monthKey(date: string) {
  return date.slice(0, 7)
}
