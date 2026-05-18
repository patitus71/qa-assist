export const runtime = 'nodejs'

// app/api/generate-report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { TestReport } from '@/lib/types'

const client = new Anthropic()

const TCStatusSchema = z.enum(['Pending', 'Pass', 'Fail', 'Skip', 'Blocked'])

const InputSchema = z.object({
  standardTCs: z.array(z.object({
    id: z.string(), title: z.string(), status: TCStatusSchema, bugTicket: z.string().optional(),
  })),
  e2eTCs: z.array(z.object({
    id: z.string(), title: z.string(), status: TCStatusSchema, bugTicket: z.string().optional(),
  })),
  apiTCs: z.array(z.object({
    id: z.string(), method: z.string(), endpoint: z.string(), status: TCStatusSchema, bugTicket: z.string().optional(),
  })),
})

const SYSTEM = `You are a QA lead writing a test execution report.
Output ONLY valid JSON. No explanation. No markdown.
Format: {"summary":"...","passRate":0,"totalTC":0,"passed":0,"failed":0,"blocked":0,"failedTCs":[{"id":"...","issue":"..."}],"recommendation":"..."}`

function countStatuses(tcs: { status: string }[]) {
  return {
    pass: tcs.filter(t => t.status === 'Pass').length,
    fail: tcs.filter(t => t.status === 'Fail').length,
    blocked: tcs.filter(t => t.status === 'Blocked').length,
    skip: tcs.filter(t => t.status === 'Skip').length,
    pending: tcs.filter(t => t.status === 'Pending').length,
  }
}

function extractJSON(text: string): unknown {
  try { return JSON.parse(text.trim()) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { standardTCs, e2eTCs, apiTCs } = parsed.data
  const allTCs = [...standardTCs, ...e2eTCs, ...apiTCs]

  if (allTCs.length === 0) {
    return NextResponse.json({ error: 'No test cases to report on' }, { status: 400 })
  }

  const std = countStatuses(standardTCs)
  const e2e = countStatuses(e2eTCs)
  const api = countStatuses(apiTCs)
  const all = countStatuses(allTCs)

  const failedList = [
    ...standardTCs.filter(t => t.status === 'Fail' || t.status === 'Blocked').map(t => `- ${t.id}: ${t.title} [${t.status}]${t.bugTicket ? ` → Bug: ${t.bugTicket}` : ''}`),
    ...e2eTCs.filter(t => t.status === 'Fail' || t.status === 'Blocked').map(t => `- ${t.id}: ${t.title} [${t.status}]`),
    ...apiTCs.filter(t => t.status === 'Fail' || t.status === 'Blocked').map(t => `- ${t.id}: ${t.method} ${t.endpoint} [${t.status}]`),
  ].join('\n')

  const userMessage = `Test execution summary — ${new Date().toLocaleDateString()}

Total: ${allTCs.length} test cases
Overall: ${all.pass} Pass, ${all.fail} Fail, ${all.blocked} Blocked, ${all.skip} Skip, ${all.pending} Pending

Standard TCs (${standardTCs.length}): ${std.pass} Pass, ${std.fail} Fail, ${std.blocked} Blocked, ${std.pending} Pending
E2E TCs (${e2eTCs.length}): ${e2e.pass} Pass, ${e2e.fail} Fail, ${e2e.blocked} Blocked, ${e2e.pending} Pending
API TCs (${apiTCs.length}): ${api.pass} Pass, ${api.fail} Fail, ${api.blocked} Blocked, ${api.pending} Pending

${failedList ? `Failed/Blocked TCs:\n${failedList}` : 'No failed or blocked test cases.'}`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
    const raw = extractJSON(text) as Record<string, unknown> | null

    if (!raw) {
      return NextResponse.json({ error: 'Failed to parse AI report' }, { status: 500 })
    }

    // Compute accurate stats (don't trust AI's numbers)
    const executed = all.pass + all.fail + all.blocked + all.skip
    const passRate = executed > 0 ? Math.round((all.pass / executed) * 100) : 0

    const report: TestReport = {
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      passRate,
      totalTC: allTCs.length,
      passed: all.pass,
      failed: all.fail,
      blocked: all.blocked,
      failedTCs: Array.isArray(raw.failedTCs)
        ? (raw.failedTCs as unknown[]).map(item => {
            const r = item as Record<string, unknown>
            return { id: String(r.id ?? ''), issue: String(r.issue ?? '') }
          })
        : [],
      recommendation: typeof raw.recommendation === 'string' ? raw.recommendation : '',
    }

    return NextResponse.json(report)
  } catch (err) {
    console.error('[/api/generate-report]', err)
    return NextResponse.json({ error: 'Report generation failed — verify ANTHROPIC_API_KEY' }, { status: 500 })
  }
}
