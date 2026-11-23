import { collection, getDocs, setDoc, doc, onSnapshot, deleteDoc, type Unsubscribe, type Firestore } from 'firebase/firestore'
import { db, type FinanceDatabase } from './database'
import { getFirestoreDb } from './firebase'

/**
 * Local-first sync engine.
 * - Records are keyed by globally-unique string ids (UUIDs).
 * - Winning record = the one with the newer `updatedAt` (last-write-wins).
 * - Deletions are tombstones (`deleted: true`); a received tombstone hard-deletes locally.
 * - Each user's data lives in Firestore subcollections: users/{uid}/{table}.
 */

type SyncableTable = keyof Pick<FinanceDatabase, 'transactions' | 'debts' | 'debtPayments'>

const TABLES: SyncableTable[] = ['transactions', 'debts', 'debtPayments']

interface SyncableRecord {
  id: string
  updatedAt: string
  deleted?: boolean
}

function tableCollection(firestore: Firestore, uid: string, tableName: SyncableTable) {
  return collection(firestore, 'users', uid, tableName)
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

/** True while we are writing remote data into the local database, so we skip echoing it back up. */
let applyingRemote = false

/**
 * Subscribes to live Firestore changes for every table and merges them into the
 * local IndexedDB (last-write-wins). `onChange` fires whenever remote data was
 * applied so the UI can refresh. Returns an unsubscribe function.
 */
export function subscribeToRemote(uid: string, onChange?: () => void): Unsubscribe {
  const firestore = getFirestoreDb()
  if (!firestore) return () => {}
  const unsubscribers = TABLES.map((tableName) => {
    const col = tableCollection(firestore, uid, tableName)
    return onSnapshot(
      col,
      async (snapshot) => {
        for (const change of snapshot.docChanges()) {
          const row = change.doc.data() as SyncableRecord
          if (change.type === 'removed') {
            await db[tableName].delete(row.id)
            continue
          }
          const local = await db[tableName].get(row.id)
          if (!isNewer(row, local)) continue
          applyingRemote = true
          try {
            if (row.deleted) {
              await db[tableName].delete(row.id)
            } else {
              await db[tableName].put(row as never)
            }
          } finally {
            applyingRemote = false
          }
        }
        if (onChange) onChange()
      },
      (error) => {
        // Ignore transient real-time errors; manual sync still works.
        console.error('Realtime sync error:', error)
      },
    )
  })
  return () => unsubscribers.forEach((unsub) => unsub())
}

interface LocalChange {
  table: string
  key: unknown
  type: number
  obj?: SyncableRecord
  oldObj?: SyncableRecord
}

/**
 * Watches local Dexie writes and pushes them to Firestore immediately, so
 * changes made on this device appear live on every other device.
 */
export function watchLocalChanges(uid: string): () => void {
  const firestore = getFirestoreDb()
  if (!firestore) return () => {}
  const listener = (changes: LocalChange[]) => {
    if (applyingRemote) return
    for (const change of changes) {
      const tableName = change.table as SyncableTable
      if (!TABLES.includes(tableName)) continue
      const col = tableCollection(firestore, uid, tableName)
      const ref = doc(col, String(change.key))
      if (change.obj) {
        void setDoc(ref, change.obj).catch(() => {})
      } else if (change.oldObj) {
        // Hard removal locally -> push a tombstone so other devices clear it too.
        void setDoc(ref, { deleted: true, updatedAt: change.oldObj.updatedAt }).catch(() => {})
      } else {
        void deleteDoc(ref).catch(() => {})
      }
    }
  }
  // Dexie exposes the changes event through its event-set API; the typed
  // overloads don't cover it, so we access the event object directly.
  const changesEvent = db.on('changes') as unknown as {
    subscribe(fn: (changes: LocalChange[]) => void): void
    unsubscribe(fn: (changes: LocalChange[]) => void): void
  }
  changesEvent.subscribe(listener)
  return () => {
    changesEvent.unsubscribe(listener)
  }
}
