'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'

interface ThemeCtx {
  mode:     ThemeMode
  resolved: 'dark' | 'light'
  setMode:  (m: ThemeMode) => void
}

const Ctx = createContext<ThemeCtx>({ mode: 'dark', resolved: 'dark', setMode: () => {} })

export const useTheme = () => useContext(Ctx)

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(mode: ThemeMode): 'dark' | 'light' {
  const resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved
  }
  return resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [resolved, setResolved] = useState<'dark' | 'light'>('dark')

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = (localStorage.getItem('verdikt_theme') as ThemeMode | null) ?? 'dark'
    setModeState(stored)
    setResolved(apply(stored))
  }, [])

  // React to system changes while in system mode
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolved(apply('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    localStorage.setItem('verdikt_theme', m)
    setResolved(apply(m))
  }, [])

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>
}
