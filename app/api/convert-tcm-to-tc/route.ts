export const runtime = 'nodejs'

// app/api/convert-tcm-to-tc/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { classify } from '@/lib/classifier'
import type { StandardTC, E2ETC, APITC, E2EStep, Assertion, TCPriority } from '@/lib/types'

const client = new Anthropic()

const TCMRowSchema = z.object({
  id: z.string(),
  scenario: z.string(),
  checks: z.record(z.string(), z.record(z.string(), z.boolean())),
  posNeg: z.enum(['Positive', 'Negative']),
  priority: z.enum(['High', 'Med', 'Low']),
})

const InputSchema = z.object({
  requirement: z.string().min(1).max(10000),
  type: z.enum(['standard', 'e2e', 'api']),
  groups: z.array(z.object({ id: z.string(), name: z.string(), values: z.array(z.string()) })).max(20),
  tcmRows: z.array(TCMRowSchema).min(1).max(60),
})

function extractJSON(text: string): unknown[] {
  const t = text.trim()
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : [] } catch { /* try next */ }
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) { try { const v = JSON.parse(block[1].trim()); return Array.isArray(v) ? v : [] } catch { /* try next */ } }
  const arr = t.match(/\[[\s\S]*\]/)
  if (arr) { try { const v = JSON.parse(arr[0]); return Array.isArray(v) ? v : [] } catch { /* try next */ } }
  return []
}

const PRIORITIES = ['High', 'Med', 'Low'] as const
const isPriority = (v: unknown): v is TCPriority => PRIORITIES.includes(v as TCPriority)

function rowToTestData(
  checks: Record<string, Record<string, boolean>>,
  groups: { name: string; values: string[] }[]
): string {
  return groups
    .map(g => {
      const ticked = g.values.filter(v => checks[g.name]?.[v])
      return ticked.length ? `${g.name}=${ticked.join('+')}` : null
    })
    .filter(Boolean)
    .join(', ')
}

// ── Standard ──────────────────────────────────────────────────────────────────

const SYSTEM_STANDARD = `You are a QA engineer. Convert TCM rows into detailed Standard test cases.
Return ONLY a valid JSON array. No markdown. No explanation.
Format: [{"id":"TC-01","title":"string","steps":"step 1\\nstep 2","expected":"string","priority":"High|Med|Low","testData":"string","prerequisite":"string","positiveNegative":"Positive|Negative"}]
- title = scenario text exactly as given
- steps = plain steps, one per line, no numbering
- expected = clear expected result
- testData = will be provided per row — use it as-is
- prerequisite = system state required before the test`

function toStandard(raw: unknown, i: number, rows: z.infer<typeof TCMRowSchema>[], groups: { name: string; values: string[] }[]): StandardTC {
  const r = (raw ?? {}) as Record<string, unknown>
  const srcRow = rows[i]
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `TC-${String(i + 1).padStart(2, '0')}`,
    type: 'Standard',
    title: typeof r.title === 'string' ? r.title : (srcRow?.scenario ?? ''),
    steps: typeof r.steps === 'string'
      ? r.steps.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean).join('\n')
      : '',
    expected: typeof r.expected === 'string' ? r.expected : '',
    priority: isPriority(r.priority) ? r.priority : (srcRow?.priority ?? 'Med'),
    testData: typeof r.testData === 'string' ? r.testData : rowToTestData(srcRow?.checks ?? {} as Record<string, Record<string, boolean>>, groups),
    prerequisite: typeof r.prerequisite === 'string' ? r.prerequisite : '',
    positiveNegative: r.positiveNegative === 'Negative' ? 'Negative' : (srcRow?.posNeg ?? 'Positive'),
    aiGenerated: true,
    source: 'tcm-generated' as 'ai',
    status: 'Pending',
  }
}

// ── E2E ───────────────────────────────────────────────────────────────────────

const SYSTEM_E2E = `You are a QA engineer. Convert TCM rows into E2E test flows.
Return ONLY a valid JSON array. No markdown. No explanation.
Format: [{"id":"TC-E2E-01","title":"string","flow":"string","steps":[{"num":1,"keyword":"string","args":"string","type":"Action|Verify|Setup|DB","note":"string"}],"priority":"High|Med|Low"}]
- title = scenario text
- flow = brief description of the user journey
- steps = 4-8 keyword-driven steps`

function toStep(raw: unknown, i: number): E2EStep {
  const r = (raw ?? {}) as Record<string, unknown>
  const stepTypes = ['Action', 'Verify', 'Setup', 'DB'] as const
  return {
    num: typeof r.num === 'number' ? r.num : i + 1,
    keyword: typeof r.keyword === 'string' ? r.keyword : '',
    args: typeof r.args === 'string' ? r.args : '',
    type: stepTypes.includes(r.type as 'Action') ? (r.type as E2EStep['type']) : 'Action',
    note: typeof r.note === 'string' ? r.note : '',
  }
}

function toE2E(raw: unknown, i: number, rows: z.infer<typeof TCMRowSchema>[]): E2ETC {
  const r = (raw ?? {}) as Record<string, unknown>
  const srcRow = rows[i]
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `TC-E2E-${String(i + 1).padStart(2, '0')}`,
    type: 'E2E',
    title: typeof r.title === 'string' ? r.title : (srcRow?.scenario ?? ''),
    flow: typeof r.flow === 'string' ? r.flow : '',
    steps: Array.isArray(r.steps) ? r.steps.map((s, j) => toStep(s, j)) : [],
    priority: isPriority(r.priority) ? r.priority : (srcRow?.priority ?? 'Med'),
    aiGenerated: true,
    source: 'tcm-generated' as 'ai',
    status: 'Pending',
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

const SYSTEM_API = `You are a QA engineer. Convert TCM rows into API test cases.
Return ONLY a valid JSON array. No markdown. No explanation.
Format: [{"id":"ATC-01","method":"GET|POST|PUT|DELETE","endpoint":"string","body":{},"assertions":[{"type":"status|body|jsonpath|time","operator":"equals|contains|less_than","expected":"string"}],"priority":"High|Med|Low"}]`

function toAssertion(raw: unknown): Assertion | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (!['status', 'body', 'jsonpath', 'time'].includes(r.type as string)) return null
  if (!['equals', 'contains', 'less_than'].includes(r.operator as string)) return null
  return {
    type: r.type as Assertion['type'],
    operator: r.operator as Assertion['operator'],
    expected: typeof r.expected === 'string' ? r.expected : String(r.expected ?? ''),
  }
}

function toAPI(raw: unknown, i: number, rows: z.infer<typeof TCMRowSchema>[]): APITC {
  const r = (raw ?? {}) as Record<string, unknown>
  const srcRow = rows[i]
  const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `ATC-${String(i + 1).padStart(2, '0')}`,
    type: 'API',
    method: methods.includes(r.method as 'GET') ? (r.method as APITC['method']) : 'GET',
    endpoint: typeof r.endpoint === 'string' ? r.endpoint : '',
    body: r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? (r.body as Record<string, unknown>) : {},
    assertions: Array.isArray(r.assertions)
      ? r.assertions.map(toAssertion).filter((a): a is Assertion => a !== null)
      : [],
    priority: isPriority(r.priority) ? r.priority : (srcRow?.priority ?? 'Med'),
    aiGenerated: true,
    source: 'tcm-generated' as 'ai',
    status: 'Pending',
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { requirement, type, groups, tcmRows } = parsed.data

  const check = classify(requirement)
  if (!check.safe) {
    return NextResponse.json({ error: `Blocked: ${check.warnings[0]}` }, { status: 400 })
  }

  const systemMap = { standard: SYSTEM_STANDARD, e2e: SYSTEM_E2E, api: SYSTEM_API }

  const rowsContext = tcmRows
    .map((row, i) => {
      const testData = rowToTestData(row.checks, groups)
      return `Row ${i + 1}: ${row.scenario} [${testData}] (${row.posNeg}, ${row.priority})`
    })
    .join('\n')

  const userText = `Requirement:\n${requirement}\n\nConvert these ${tcmRows.length} TCM rows to ${type} test cases:\n${rowsContext}\n\nReturn exactly ${tcmRows.length} test cases in the same order.`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: [{ type: 'text', text: systemMap[type], cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
    })

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '[]'
    const rawArr = extractJSON(text)

    if (type === 'standard') {
      return NextResponse.json({ standard: rawArr.map((r, i) => toStandard(r, i, tcmRows, groups)) })
    }
    if (type === 'e2e') {
      return NextResponse.json({ e2e: rawArr.map((r, i) => toE2E(r, i, tcmRows)) })
    }
    return NextResponse.json({ api: rawArr.map((r, i) => toAPI(r, i, tcmRows)) })
  } catch (err) {
    console.error('[/api/convert-tcm-to-tc]', err)
    return NextResponse.json({ error: 'Conversion failed — verify ANTHROPIC_API_KEY is set' }, { status: 500 })
  }
}
