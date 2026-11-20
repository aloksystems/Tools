/** Common fields every synchronizable record carries for last-write-wins sync. */
export interface SyncFields {
  updatedAt: string
  deleted: boolean
}

export interface Category extends SyncFields {
  id: string
  name: string
  color: string
  archived: boolean
}

export interface Transaction extends SyncFields {
  id: string
  amountPaise: number
  categoryId?: string
  description: string
  date: string
  createdAt: string
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
