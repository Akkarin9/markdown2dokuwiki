/**
 * Profili di conversione: un profilo è una configurazione `Options` con un nome.
 * Viene salvato in `localStorage` e può essere esportato/importato come JSON.
 *
 * Funzioni pure (nessuna dipendenza da React o dal DOM) tranne il caricamento
 * dei profili da `localStorage`, isolato in fondo.
 */

import { DEFAULT_OPTIONS, type Options } from '../converters/types'

export interface Profile {
  /** Identificatore stabile (non è il nome, che può cambiare). */
  id: string
  name: string
  options: Options
}

/** Profilo "di fabbrica", sempre disponibile e non eliminabile. */
export const DEFAULT_PROFILE_ID = 'default'

export function makeDefaultProfile(): Profile {
  return { id: DEFAULT_PROFILE_ID, name: 'Predefinito', options: { ...DEFAULT_OPTIONS } }
}

/** Id univoco senza dipendere da `crypto` (che non c'è nei test). */
function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Crea un nuovo profilo con nome (id generato). */
export function createProfile(name: string, options: Options = DEFAULT_OPTIONS): Profile {
  return { id: newId(), name: name.trim() || 'Nuovo profilo', options: { ...options } }
}

/** Duplica un profilo con un nome "copia". */
export function duplicateProfile(profile: Profile): Profile {
  return { id: newId(), name: `${profile.name} (copia)`, options: { ...profile.options } }
}

/** Serializza i profili in JSON (per l'export su file). */
export function exportProfiles(profiles: Profile[]): string {
  return JSON.stringify({ version: 1, profiles }, null, 2)
}

/**
 * Importa profili da JSON. Unisce i default alle opzioni parziali presenti
 * (file esportati da versioni precedenti restano validi) e scarta le voci
 * malformate. Restituisce `null` se il JSON non è utilizzabile.
 */
export function importProfiles(raw: string): Profile[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const list =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { profiles?: unknown }).profiles)
      ? ((parsed as { profiles: unknown[] }).profiles)
      : Array.isArray(parsed)
        ? parsed
        : null
  if (!list) return null

  const out: Profile[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const record = item as { id?: unknown; name?: unknown; options?: unknown }
    if (typeof record.name !== 'string') continue
    const options =
      record.options && typeof record.options === 'object'
        ? { ...DEFAULT_OPTIONS, ...(record.options as Partial<Options>) }
        : { ...DEFAULT_OPTIONS }
    // Conserva l'id quando presente (round-trip dei profili salvati),
    // altrimenti ne genera uno nuovo (import da file esterni).
    const id = typeof record.id === 'string' && record.id ? record.id : newId()
    out.push({ id, name: record.name, options })
  }
  return out.length > 0 ? out : null
}

const PROFILES_KEY = 'md2doku.profiles'

/** Carica i profili salvati, garantendo sempre il profilo predefinito. */
export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (raw) {
      const parsed = importProfiles(raw)
      if (parsed && parsed.length > 0) {
        if (!parsed.some((p) => p.id === DEFAULT_PROFILE_ID)) {
          return [makeDefaultProfile(), ...parsed]
        }
        return parsed
      }
    }
  } catch {
    /* localStorage non disponibile */
  }
  return [makeDefaultProfile()]
}

export function saveProfiles(profiles: Profile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, exportProfiles(profiles))
  } catch {
    /* ignora */
  }
}
