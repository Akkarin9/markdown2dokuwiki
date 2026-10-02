/**
 * Cronologia locale delle conversioni in IndexedDB (ultime N).
 * Nessun dato esce dal browser. Le funzioni degradano silenziosamente se
 * IndexedDB non è disponibile (es. in modalità privata o nei test).
 */

export interface HistoryEntry {
  id?: number
  /** Timestamp di creazione (ms). */
  at: number
  direction: 'md-to-doku' | 'doku-to-md'
  input: string
  output: string
  label: string
}

const DB_NAME = 'md2doku'
const STORE = 'history'
const VERSION = 1
const MAX_ENTRIES = 30

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('at', 'at')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

/** Aggiunge una voce e fa rispettare il limite di `MAX_ENTRIES`. */
export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  store.add(entry)
  await txDone(tx)

  // Potatura: mantiene le ultime MAX_ENTRIES.
  const readTx = db.transaction(STORE, 'readwrite')
  const readStore = readTx.objectStore(STORE)
  const all = readStore.getAll()
  all.onsuccess = () => {
    const rows = (all.result as HistoryEntry[]).sort((a, b) => a.at - b.at)
    const excess = rows.length - MAX_ENTRIES
    for (let i = 0; i < excess; i += 1) {
      if (rows[i].id !== undefined) readStore.delete(rows[i].id as number)
    }
  }
  await txDone(readTx)
  db.close()
}

/** Elenca le voci, dalla più recente. */
export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await openDb()
  if (!db) return []
  const tx = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  const request = store.getAll()
  const rows = await new Promise<HistoryEntry[]>((resolve) => {
    request.onsuccess = () => resolve((request.result as HistoryEntry[]) ?? [])
    request.onerror = () => resolve([])
  })
  db.close()
  return rows.sort((a, b) => b.at - a.at)
}

export async function clearHistory(): Promise<void> {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).clear()
  await txDone(tx)
  db.close()
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
  db.close()
}
