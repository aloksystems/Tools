import Dexie, { type Table } from 'dexie'
import type { Category, Transaction } from './types'
import { newId } from './types'

export class FinanceDatabase extends Dexie {
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>

  constructor() {
    super('myfinance')
    this.version(1).stores({
      categories: 'id, updatedAt, deleted',
      transactions: 'id, date, categoryId, updatedAt, deleted',
    })
  }
}

function nowIso() {
  return new Date().toISOString()
}

export const db = new FinanceDatabase()

/**
 * Opens the database, resetting any legacy schema left behind by older
 * pre-release builds. Upgrades that changed primary keys are unsupported by
 * Dexie, so an incompatible on-disk database is rebuilt cleanly instead.
 */
export async function openDatabase() {
  try {
    let legacyVersion: number | undefined
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases()
      const existing = databases.find((d) => d.name === 'myfinance')
      legacyVersion = existing?.version
    }
    if (legacyVersion != null && legacyVersion !== db.verno) {
      await db.delete()
    }
    await db.open()
  } catch {
    await db.delete()
    await db.open()
  }
}

const defaultCategories: Category[] = [
  ['Food & Dining', '#f97316'],
  ['Groceries', '#22c55e'],
  ['Transportation', '#3b82f6'],
  ['Bills & Utilities', '#8b5cf6'],
  ['Shopping', '#ec4899'],
  ['Health', '#ef4444'],
  ['Entertainment', '#eab308'],
  ['Other', '#64748b'],
].map(([name, color]) => ({ id: newId(), name, color, archived: false, deleted: false, updatedAt: nowIso() }))

let currentSeed: Promise<void> | null = null

export function seedDatabase(): Promise<void> {
  if (!currentSeed) {
    currentSeed = (async () => {
      if ((await db.categories.count()) === 0) {
        await db.categories.bulkAdd(defaultCategories)
      }
    })().finally(() => {
      currentSeed = null
    })
  }
  return currentSeed
}
