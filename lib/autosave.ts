// lib/autosave.ts

import type { AutoSaveTC, TC, TCPriority, TCStatus, TCType } from './types'

const STORAGE_KEY = 'qa_assist_session'

function toAutoSave(tc: TC): AutoSaveTC {
  const title = tc.type === 'API' ? tc.endpoint : tc.title
  return {
    id: tc.id,
    title,
    priority: tc.priority,
    status: tc.status,
    type: tc.type as TCType,
    aiGenerated: tc.aiGenerated,
  }
}

export function saveSession(tcs: TC[]): void {
  try {
    const payload: AutoSaveTC[] = tcs.map(toAutoSave)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tcs: payload, savedAt: new Date().toISOString() })
    )
  } catch {
    // Storage may be full or unavailable — fail silently
  }
}

export interface SavedSession {
  tcs: AutoSaveTC[]
  savedAt: string
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedSession
    if (!Array.isArray(parsed.tcs)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Fail silently
  }
}

export function isValidAutoSaveTC(obj: unknown): obj is AutoSaveTC {
  if (typeof obj !== 'object' || obj === null) return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    ['High', 'Med', 'Low'].includes(o.priority as string) &&
    ['Pending', 'Pass', 'Fail', 'Skip', 'Blocked'].includes(o.status as string) &&
    ['Standard', 'E2E', 'API'].includes(o.type as string)
  )
}
