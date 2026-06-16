export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as XLSX from 'xlsx-js-style'
import { buildTCMWorkbook } from '@/lib/tcm-exporter'
import type { TCMState } from '@/lib/types'

const RowSchema = z.object({
  id: z.string(),
  scenario: z.string(),
  checks: z.record(z.string(), z.record(z.string(), z.boolean())),
  posNeg: z.enum(['Positive', 'Negative']),
  priority: z.enum(['High', 'Med', 'Low']),
  isNew: z.boolean().optional(),
  rejected: z.boolean().optional(),
  sectionLabel: z.string().optional(),
  steps: z.string().optional(),
  reason: z.string().optional(),
})

const InputSchema = z.object({
  state: z.object({
    groups: z.array(z.object({
      id: z.string(),
      name: z.string(),
      values: z.array(z.string()),
    })).max(30),
    rows: z.array(RowSchema).max(500),
    type: z.enum(['standard', 'e2e', 'api']),
  }),
  filename: z.string().max(100).optional(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { state, filename = 'tcm-export.xlsx' } = parsed.data
  const wb = buildTCMWorkbook(state as TCMState)
  const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array
  // Slice to own ArrayBuffer so TypeScript's BodyInit constraint is satisfied
  const xlsxBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer

  const safeName = filename.replace(/[^a-z0-9\-_.]/gi, '_').replace(/^_+|_+$/g, '') || 'tcm-export.xlsx'

  return new NextResponse(xlsxBuf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  })
}
