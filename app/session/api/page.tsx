// app/session/api/page.tsx
'use client'

import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { APITCTable } from '@/app/components/APITCTable'
import type { APITC } from '@/lib/types'

export default function ApiPage() {
  const { apiTCs, setApiTCs } = useSession()

  return (
    <div className="p-8 max-w-5xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">API Test Cases</h1>
          <p className="text-ink-500 text-sm mt-0.5">
            {apiTCs.length > 0 ? `${apiTCs.length} API test cases — click row to edit assertions` : 'No API test cases yet'}
          </p>
        </div>
        {apiTCs.length > 0 && (
          <Link href="/session/api/run" className="btn-primary">Run Tests →</Link>
        )}
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
