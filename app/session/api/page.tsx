// app/session/api/page.tsx
'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { APITCTable } from '@/app/components/APITCTable'
import { importTCsFromXlsx } from '@/lib/import-excel'
import type { APITC } from '@/lib/types'

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 4V2.5C5 2.224 5.224 2 5.5 2h5c.276 0 .5.224.5.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 4l.75 9A1.5 1.5 0 0 0 4.25 14.5h7.5A1.5 1.5 0 0 0 13.25 13L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function ApiPage() {
  const { apiTCs, setApiTCs } = useSession()
  const [importMsg, setImportMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  function handleClearAll() {
    const count = apiTCs.length
    setApiTCs([])
    setClearModalOpen(false)
    showToast(`${count} test case${count !== 1 ? 's' : ''} cleared`)
  }

  async function handleImport(file: File) {
    const { tcs, warnings } = await importTCsFromXlsx(file)
    const imported = tcs.filter(t => t.type === 'API') as APITC[]
    if (imported.length === 0) { setImportMsg('No API TCs found in file'); return }
    const existingIds = new Set(apiTCs.map(t => t.id))
    const merged = [
      ...apiTCs.filter(t => !imported.some(i => i.id === t.id)),
      ...imported,
    ]
    setApiTCs(merged)
    const warnStr = warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''
    const newCount = imported.filter(t => !existingIds.has(t.id)).length
    const updCount = imported.length - newCount
    setImportMsg(`Imported ${newCount} new + ${updCount} updated${warnStr}`)
    setTimeout(() => setImportMsg(''), 4000)
  }

  const importButton = (
    <>
      <input
        ref={importRef} type="file" accept=".xlsx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
      />
      <button onClick={() => importRef.current?.click()} className="btn-ghost text-sm flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v9M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Import .xlsx
      </button>
    </>
  )

  return (
    <div className="p-3 md:p-4 lg:p-8 w-full">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full mx-4">
            <h2 className="text-base font-semibold text-ink-900 mb-2">Clear all test cases?</h2>
            <p className="text-sm text-ink-500 mb-5">
              This will remove all {apiTCs.length} API TCs from this session. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setClearModalOpen(false)} className="btn-ghost text-sm">Cancel</button>
              <button onClick={handleClearAll} className="text-sm px-4 py-2 rounded-lg bg-danger text-white font-medium hover:opacity-90 transition-opacity">Clear all</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">API Test Cases</h1>
          <p className="text-ink-500 text-sm mt-0.5">
            {apiTCs.length > 0
              ? `${apiTCs.length} API test cases — click row to edit assertions`
              : 'No API test cases yet'}
            {importMsg && <span className="ml-2 text-success font-mono text-xs">✓ {importMsg}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {importButton}
          {apiTCs.length > 0 && (
            <>
              <button
                onClick={() => setClearModalOpen(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-danger/30 text-danger bg-transparent hover:bg-danger/10 transition-colors"
              >
                <TrashIcon />
                Clear all
              </button>
              <Link href="/session/api/run" className="btn-primary">Run Tests →</Link>
            </>
          )}
        </div>
      </div>

      {apiTCs.length > 0 ? (
        <APITCTable tcs={apiTCs} onChange={(tcs: APITC[]) => setApiTCs(tcs)} />
      ) : (
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm mb-3">Generate API test cases to begin.</p>
          <Link href="/session/generate" className="btn-primary text-sm">Generate API tests</Link>
        </div>
      )}
    </div>
  )
}
