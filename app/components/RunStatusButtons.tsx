// app/components/RunStatusButtons.tsx
'use client'

import type { TCStatus } from '@/lib/types'

const STATUSES: TCStatus[] = ['Pass', 'Fail', 'Skip', 'Blocked']

const IDLE: Record<TCStatus, string> = {
  Pass: 'border-green-300 text-success hover:bg-green-50',
  Fail: 'border-red-300 text-danger hover:bg-red-50',
  Skip: 'border-ink-300 text-ink-500 hover:bg-ink-50',
  Blocked: 'border-amber-300 text-warn hover:bg-amber-50',
  Pending: 'border-ink-200 text-ink-400',
}

const ACTIVE: Record<TCStatus, string> = {
  Pass: 'bg-success border-success text-white',
  Fail: 'bg-danger border-danger text-white',
  Skip: 'bg-ink-500 border-ink-500 text-white',
  Blocked: 'bg-warn border-warn text-white',
  Pending: 'bg-ink-200 border-ink-200 text-ink-600',
}

interface Props {
  status: TCStatus
  onChange: (s: TCStatus) => void
  disabled?: boolean
}

export function RunStatusButtons({ status, onChange, disabled }: Props) {
  return (
    <div className="flex gap-1">
      {STATUSES.map(s => (
        <button
          key={s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={`font-mono text-[11px] px-2.5 py-1 rounded border whitespace-nowrap transition-all disabled:opacity-50 ${
            status === s ? ACTIVE[s] : IDLE[s]
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
