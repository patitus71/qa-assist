// lib/session-context.tsx
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { StandardTC, E2ETC, APITC, TC } from './types'
import { saveSession } from './autosave'

interface SessionState {
  requirement: string
  jiraKey: string | null
  images: string[]
  standardTCs: StandardTC[]
  e2eTCs: E2ETC[]
  apiTCs: APITC[]
}

interface SessionContextValue extends SessionState {
  setRequirement: (text: string, jiraKey?: string) => void
  setImages: (images: string[]) => void
  setStandardTCs: (tcs: StandardTC[]) => void
  setE2eTCs: (tcs: E2ETC[]) => void
  setApiTCs: (tcs: APITC[]) => void
  updateTC: (tc: TC) => void
  clearAll: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

const INITIAL_STATE: SessionState = {
  requirement: '',
  jiraKey: null,
  images: [],
  standardTCs: [],
  e2eTCs: [],
  apiTCs: [],
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE)

  const setRequirement = useCallback((text: string, jiraKey?: string) => {
    setState(s => ({ ...s, requirement: text, jiraKey: jiraKey ?? null }))
  }, [])

  const setImages = useCallback((images: string[]) => {
    setState(s => ({ ...s, images }))
  }, [])

  const setStandardTCs = useCallback((tcs: StandardTC[]) => {
    setState(s => {
      const next = { ...s, standardTCs: tcs }
      saveSession([...tcs, ...s.e2eTCs, ...s.apiTCs])
      return next
    })
  }, [])

  const setE2eTCs = useCallback((tcs: E2ETC[]) => {
    setState(s => {
      const next = { ...s, e2eTCs: tcs }
      saveSession([...s.standardTCs, ...tcs, ...s.apiTCs])
      return next
    })
  }, [])

  const setApiTCs = useCallback((tcs: APITC[]) => {
    setState(s => {
      const next = { ...s, apiTCs: tcs }
      saveSession([...s.standardTCs, ...s.e2eTCs, ...tcs])
      return next
    })
  }, [])

  const updateTC = useCallback((tc: TC) => {
    setState(s => {
      let next = { ...s }
      if (tc.type === 'Standard') {
        next.standardTCs = s.standardTCs.map(t => (t.id === tc.id ? tc : t))
      } else if (tc.type === 'E2E') {
        next.e2eTCs = s.e2eTCs.map(t => (t.id === tc.id ? tc : t))
      } else {
        next.apiTCs = s.apiTCs.map(t => (t.id === tc.id ? tc : t))
      }
      saveSession([...next.standardTCs, ...next.e2eTCs, ...next.apiTCs])
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return (
    <SessionContext.Provider
      value={{
        ...state,
        setRequirement,
        setImages,
        setStandardTCs,
        setE2eTCs,
        setApiTCs,
        updateTC,
        clearAll,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
