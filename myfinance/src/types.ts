/** Common fields every synchronizable record carries for last-write-wins sync. */
export interface SyncFields {
  updatedAt: string
  deleted: boolean
}

export interface Transaction extends SyncFields {
  id: string
  amountPaise: number
  /** Name of the item or thing bought. */
  item: string
  /** Optional extra note. */
  description?: string
  date: string
  createdAt: string
}

/** A debt between you and another person. */
export interface Debt extends SyncFields {
  id: string
  person: string
  /** 'owing' = you owe them (you borrowed); 'lent' = they owe you (you lent). */
  direction: 'owing' | 'lent'
  amountPaise: number
  note?: string
  date: string
  createdAt: string
}

/** A repayment against a debt, reducing its outstanding balance. */
export interface DebtPayment extends SyncFields {
  id: string
  debtId: string
  amountPaise: number
  date: string
  createdAt: string
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
