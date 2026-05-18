export const runtime = 'edge'

// app/api/zephyr/execute/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const InputSchema = z.object({
  cycleId: z.string().min(1),
  tcKey: z.string().min(1),
  status: z.enum(['Pass', 'Fail', 'Skip', 'Blocked']),
})

const STATUS_MAP: Record<string, string> = {
  Pass: 'PASS',
  Fail: 'FAIL',
  Skip: 'NOT_EXECUTED',
  Blocked: 'BLOCKED',
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { cycleId, tcKey, status } = parsed.data
  const type = process.env.ZEPHYR_TYPE ?? ''
  const token = process.env.ZEPHYR_TOKEN ?? ''
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '') ?? ''

  if (!token || !type) {
    return NextResponse.json({ success: false, reason: 'Zephyr not configured' })
  }

  try {
    if (type === 'scale') {
      const res = await fetch('https://api.zephyrscale.smartbear.com/v2/testexecutions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          cycleId,
          testCaseKey: tcKey,
          statusName: STATUS_MAP[status] ?? 'NOT_EXECUTED',
        }),
        signal: AbortSignal.timeout(10_000),
      })
      return NextResponse.json({ success: res.ok })
    }

    if (type === 'squad' && baseUrl) {
      const res = await fetch(`${baseUrl}/rest/zapi/latest/execution`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cycleId,
          issueId: tcKey,
          status: STATUS_MAP[status] ?? '-1',
        }),
        signal: AbortSignal.timeout(10_000),
      })
      return NextResponse.json({ success: res.ok })
    }
  } catch {
    return NextResponse.json({ success: false, reason: 'Zephyr request failed' })
  }

  return NextResponse.json({ success: false, reason: 'Unknown Zephyr type' })
}
