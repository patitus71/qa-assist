// app/session/e2e/page.tsx
'use client'

import Link from 'next/link'
import { useSession } from '@/lib/session-context'
import { E2ETCTable } from '@/app/components/E2ETCTable'
import type { E2ETC } from '@/lib/types'

export default function E2EPage() {
  const { e2eTCs, setE2eTCs } = useSession()

  return (
    <div className="p-3 md:p-4 lg:p-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">E2E Test Cases</h1>
          <p className="text-ink-500 text-sm mt-0.5">
            {e2eTCs.length > 0 ? `${e2eTCs.length} E2E flows — click row to edit steps` : 'No E2E test cases yet'}
          </p>
        </div>
        {e2eTCs.length > 0 && (
          <Link href="/session/e2e/run" className="btn-primary">Run Tests →</Link>
        )}
      </div>

      {e2eTCs.length > 0 ? (
        <E2ETCTable tcs={e2eTCs} onChange={(tcs: E2ETC[]) => setE2eTCs(tcs)} />
      ) : (
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm mb-3">Generate E2E flows to begin.</p>
          <Link href="/session/generate" className="btn-primary text-sm">Generate E2E</Link>
        </div>
      )}
    </div>
  )
}
