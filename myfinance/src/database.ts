import Dexie, { type Table } from 'dexie'
import observable from 'dexie-observable'
import type { Debt, DebtPayment, Transaction } from './types'

// The observable add-on provides db.on('changes'), which we use to push local
// writes to Firestore in real time. It must be registered before any Dexie
// instance is created.
Dexie.addons.push(observable as never)

export class FinanceDatabase extends Dexie {
  transactions!: Table<Transaction, string>
  debts!: Table<Debt, string>
  debtPayments!: Table<DebtPayment, string>

  constructor() {
    super('myfinance')
    this.version(2).stores({
      transactions: 'id, date, updatedAt, deleted',
      debts: 'id, person, updatedAt, deleted',
      debtPayments: 'id, debtId, date, updatedAt, deleted',
    })
  }
}

export const db = new FinanceDatabase()

/**
 * Opens the local database. IndexedDB already holds the current schema, so
 * we simply open it. If for any reason the on-disk database cannot be opened
 * (e.g. an incompatible legacy schema), it is rebuilt cleanly.
 */
export async function openDatabase() {
  try {
    await db.open()
  } catch {
    await db.delete()
    await db.open()
  }
}
