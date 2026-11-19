import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCN5pPgVagRS352g58m5G_4a-0iWuQmg5c',
  authDomain: 'myfinance-bd4ef.firebaseapp.com',
  projectId: 'myfinance-bd4ef',
  storageBucket: 'myfinance-bd4ef.firebasestorage.app',
  messagingSenderId: '315749712246',
  appId: '1:315749712246:web:8c4e1d296cf8bf96c83a57',
  measurementId: 'G-FX8CTP4ZPL',
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let firestore: Firestore | null = null

/** Lazily initializes Firebase. Safe to call offline (returns null if unavailable). */
export function initFirebase(): boolean {
  try {
    if (!app) {
      app = initializeApp(firebaseConfig)
      auth = getAuth(app)
      firestore = getFirestore(app)
    }
    return true
  } catch {
    return false
  }
}

export function getFirebaseAuth(): Auth | null {
  return auth
}

export function getFirestoreDb(): Firestore | null {
  return firestore
}
