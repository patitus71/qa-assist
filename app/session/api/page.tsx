// app/session/api/page.tsx
'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { APITCTable } from '@/app/components/APITCTable'
import { importTCsFromXlsx } from '@/lib/import-excel'
import type { APITC } from '@/lib/types'

export default function ApiPage() {
  const { apiTCs, setApiTCs } = useSession()
  const [importMsg, setImportMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

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
    <div className="p-8 max-w-5xl w-full">
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
            <Link href="/session/api/run" className="btn-primary">Run Tests →</Link>
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
