import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_OPTIONS, type Options } from '../converters/types'
import {
  DEFAULT_PROFILE_ID,
  createProfile,
  duplicateProfile,
  loadProfiles,
  makeDefaultProfile,
  saveProfiles,
  type Profile,
} from './profiles'

const OPTIONS_KEY = 'md2doku.options'
const THEME_KEY = 'md2doku.theme'

export type Theme = 'dark' | 'light' | 'system'

/** Carica le opzioni correnti (usate quando non ci sono profili). */
function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY)
    if (!raw) return DEFAULT_OPTIONS
    // Unione con i default: le opzioni nuove sono coperte anche con dati vecchi.
    return { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<Options>) }
  } catch {
    return DEFAULT_OPTIONS
  }
}

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* localStorage non disponibile */
  }
  return 'dark'
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Opzioni, profili e tema, persistiti in localStorage. */
export function usePersistentSettings() {
  // Le opzioni "vive" sono quelle del profilo attivo. Il profilo predefinito
  // adotta le opzioni salvate, così un aggiornamento non le perde.
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const stored = loadOptions()
    return loadProfiles().map((p) => (p.id === DEFAULT_PROFILE_ID ? { ...p, options: { ...p.options, ...stored } } : p))
  })
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_PROFILE_ID)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const [options, setOptions] = useState<Options>(() => {
    const stored = loadOptions()
    const list = loadProfiles()
    const active = list.find((p) => p.id === DEFAULT_PROFILE_ID) ?? list[0]
    return { ...active?.options, ...stored }
  })

  // Persistenza opzioni correnti.
  useEffect(() => {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options))
    } catch {
      /* ignora */
    }
  }, [options])

  // Persistenza profili.
  useEffect(() => {
    saveProfiles(profiles)
  }, [profiles])

  // Applica il tema (con supporto alla preferenza di sistema).
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'system' ? prefersDark() : theme === 'dark'
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    if (theme !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignora */
    }
  }, [theme])

  const update = useCallback(<K extends keyof Options>(key: K, value: Options[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }, [])

  const reset = useCallback(() => setOptions(DEFAULT_OPTIONS), [])

  // Salva le opzioni correnti nel profilo attivo.
  const saveToActiveProfile = useCallback(() => {
    setProfiles((prev) => prev.map((p) => (p.id === activeProfileId ? { ...p, options } : p)))
  }, [activeProfileId, options])

  const applyProfile = useCallback(
    (id: string) => {
      setActiveProfileId(id)
      const profile = profiles.find((p) => p.id === id)
      if (profile) setOptions({ ...profile.options })
    },
    [profiles],
  )

  const addProfile = useCallback(
    (name: string) => {
      const profile = createProfile(name, options)
      setProfiles((prev) => [...prev, profile])
      setActiveProfileId(profile.id)
      return profile
    },
    [options],
  )

  const removeProfile = useCallback(
    (id: string) => {
      if (id === DEFAULT_PROFILE_ID) return
      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id)
        if (id === activeProfileId) {
          const fallback = next[0] ?? makeDefaultProfile()
          setActiveProfileId(fallback.id)
          setOptions({ ...fallback.options })
        }
        return next.length > 0 ? next : [makeDefaultProfile()]
      })
    },
    [activeProfileId],
  )

  const renameProfile = useCallback((id: string, name: string) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)))
  }, [])

  const copyProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const profile = prev.find((p) => p.id === id)
      return profile ? [...prev, duplicateProfile(profile)] : prev
    })
  }, [])

  const replaceProfiles = useCallback((next: Profile[]) => {
    setProfiles(next.length > 0 ? next : [makeDefaultProfile()])
    const first = next[0] ?? makeDefaultProfile()
    setActiveProfileId(first.id)
    setOptions({ ...first.options })
  }, [])

  const cycleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark'))
  }, [])

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId],
  )

  return {
    options,
    update,
    reset,
    theme,
    setTheme,
    cycleTheme,
    profiles,
    activeProfileId,
    activeProfile,
    applyProfile,
    addProfile,
    removeProfile,
    renameProfile,
    copyProfile,
    replaceProfiles,
    saveToActiveProfile,
  }
}
