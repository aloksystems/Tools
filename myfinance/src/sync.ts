import { collection, getDocs, setDoc, doc } from 'firebase/firestore'
import { db, type FinanceDatabase } from './database'
import { getFirestoreDb } from './firebase'

/**
 * Local-first sync engine.
 * - Records are keyed by globally-unique string ids (UUIDs).
 * - Winning record = the one with the newer `updatedAt` (last-write-wins).
 * - Deletions are tombstones (`deleted: true`); a received tombstone hard-deletes locally.
 * - Each user's data lives in Firestore subcollections: users/{uid}/{table}.
 */

type SyncableTable = keyof Pick<
  FinanceDatabase,
  'accounts' | 'categories' | 'transactions' | 'budgets' | 'recurringTransactions' | 'savingsGoals' | 'loans'
>

const TABLES: SyncableTable[] = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'recurringTransactions',
  'savingsGoals',
  'loans',
]

interface SyncableRecord {
  id: string
  updatedAt: string
  deleted?: boolean
}

function isNewer(a?: SyncableRecord, b?: SyncableRecord): boolean {
  if (!a) return false
  if (!b) return true
  return (a.updatedAt ?? '') > (b.updatedAt ?? '')
}

async function pullTable(tableName: SyncableTable, uid: string) {
  const firestore = getFirestoreDb()
  if (!firestore) return
  const col = collection(firestore, 'users', uid, tableName)
  const snapshot = await getDocs(col)
  const remote = new Map<string, SyncableRecord>()
  snapshot.forEach((entry) => {
    remote.set(entry.id, entry.data() as SyncableRecord)
  })

  const localRows = (await db[tableName].toArray()) as unknown as SyncableRecord[]
  for (const remoteRow of remote.values()) {
    const local = localRows.find((r) => r.id === remoteRow.id)
    if (isNewer(remoteRow, local)) {
      if (remoteRow.deleted) {
        await db[tableName].delete(remoteRow.id)
      } else {
        await db[tableName].put(remoteRow as never)
      }
    }
  }
}

async function pushTable(tableName: SyncableTable, uid: string) {
  const firestore = getFirestoreDb()
  if (!firestore) return
  const col = collection(firestore, 'users', uid, tableName)
  const localRows = (await db[tableName].toArray()) as unknown as SyncableRecord[]

  const snapshot = await getDocs(col)
  const remote = new Map<string, SyncableRecord>()
  snapshot.forEach((entry) => {
    remote.set(entry.id, entry.data() as SyncableRecord)
  })

  for (const localRow of localRows) {
    const remoteRow = remote.get(localRow.id)
    if (isNewer(localRow, remoteRow)) {
      if (localRow.deleted) {
        await setDoc(doc(col, localRow.id), { deleted: true, updatedAt: localRow.updatedAt })
      } else {
        await setDoc(doc(col, localRow.id), localRow)
      }
    }
  }
}

export async function syncNow(uid: string) {
  let pushed = 0
  let pulled = 0
  for (const tableName of TABLES) {
    try {
      await pullTable(tableName, uid)
      pulled += 1
      await pushTable(tableName, uid)
      pushed += 1
    } catch {
      // One table failing (e.g. missing permissions) should not block the others.
      continue
    }
  }
  return { pushed, pulled }
}

/** Bulk-push every local record (used on first sync after sign-in). */
export async function pushAllLocal(uid: string) {
  for (const tableName of TABLES) {
    await pushTable(tableName, uid)
  }
}
