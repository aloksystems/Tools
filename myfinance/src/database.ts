import Dexie, { type Table, type Transaction as DexieTransaction } from 'dexie'
import type { Account, Budget, Category, Loan, RecurringTransaction, SavingsGoal, Transaction } from './types'
import { newId } from './types'

export class FinanceDatabase extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
  recurringTransactions!: Table<RecurringTransaction, string>
  savingsGoals!: Table<SavingsGoal, string>
  loans!: Table<Loan, string>

  constructor() {
    super('myfinance')
    this.version(3).stores({
      accounts: '++id, name, archived',
      categories: '++id, type, archived',
      transactions: '++id, date, type, accountId, destinationAccountId, categoryId, [recurringId+occurrenceDate]',
      budgets: '++id, &month',
      recurringTransactions: '++id, nextDueDate, active',
      savingsGoals: '++id, targetDate',
      loans: '++id, direction, dueDate',
    })
    this.version(4)
      .stores({
        accounts: 'id, updatedAt, archived',
        categories: 'id, type, updatedAt, archived',
        transactions: 'id, date, type, accountId, destinationAccountId, categoryId, updatedAt, [recurringId+occurrenceDate]',
        budgets: 'id, month, updatedAt',
        recurringTransactions: 'id, nextDueDate, active, updatedAt',
        savingsGoals: 'id, targetDate, updatedAt',
        loans: 'id, direction, dueDate, updatedAt',
      })
      .upgrade((tx) => upgradeToV4(tx))
  }
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * Migrates v3 data (numeric autoincrement ids) to v4 string UUID ids.
 * Rekeys every record and remaps cross-table references so no data is lost.
 */
async function upgradeToV4(tx: DexieTransaction) {
  const idMap = new Map<number, string>()

  const rekey = async (tableName: string, refs: string[]) => {
    const table = tx.table(tableName)
    const rows: Record<string, unknown>[] = (await table.toArray()) as Record<string, unknown>[]
    for (const row of rows) {
      const oldId = row.id
      if (typeof oldId === 'number') {
        const newUuid = newId()
        idMap.set(oldId, newUuid)
        row.id = newUuid
        row.updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : nowIso()
        row.deleted = false
        for (const ref of refs) {
          const value = row[ref]
          if (typeof value === 'number' && idMap.has(value)) row[ref] = idMap.get(value)
        }
      } else {
        row.updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : nowIso()
        row.deleted = false
      }
    }
    await table.clear()
    if (rows.length) await table.bulkAdd(rows as never[])
  }

  await rekey('accounts', [])
  await rekey('categories', [])
  // Transactions may reference accounts/categories which must already be rekeyed.
  await rekey('transactions', ['accountId', 'destinationAccountId', 'categoryId', 'recurringId'])
  await rekey('budgets', [])
  await rekey('recurringTransactions', ['accountId', 'categoryId'])
  await rekey('savingsGoals', [])
  await rekey('loans', [])
}

export const db = new FinanceDatabase()

const defaultCategories: Category[] = [
  ['Food & Dining', 'expense', '#f97316'],
  ['Groceries', 'expense', '#22c55e'],
  ['Transportation', 'expense', '#3b82f6'],
  ['Bills & Utilities', 'expense', '#8b5cf6'],
  ['Shopping', 'expense', '#ec4899'],
  ['Health', 'expense', '#ef4444'],
  ['Entertainment', 'expense', '#eab308'],
  ['Other', 'expense', '#64748b'],
  ['Salary', 'income', '#10b981'],
  ['Freelancing', 'income', '#14b8a6'],
  ['Interest', 'income', '#06b6d4'],
  ['Other income', 'income', '#6366f1'],
].map(([name, type, color]) => ({ id: newId(), name, type: type as Category['type'], color, archived: false, deleted: false, updatedAt: nowIso() }))

export async function seedDatabase() {
  if ((await db.accounts.count()) === 0) {
    await db.accounts.add({
      id: newId(),
      name: 'Cash wallet',
      type: 'cash',
      openingBalancePaise: 0,
      color: '#14b8a6',
      archived: false,
      deleted: false,
      updatedAt: nowIso(),
      createdAt: nowIso(),
    })
  }
  if ((await db.categories.count()) === 0) {
    await db.categories.bulkAdd(defaultCategories)
  }
}
