export const runtime = 'nodejs'

// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { classify } from '@/lib/classifier'
import type { StandardTC, E2ETC, APITC, E2EStep, Assertion } from '@/lib/types'

const client = new Anthropic()

const InputSchema = z.object({
  type: z.enum(['standard', 'e2e', 'api', 'all']),
  requirement: z.string().min(1).max(10000),
  images: z.array(z.string().max(2_500_000)).max(5).optional().default([]),
  swaggerContext: z.string().max(5000).optional(),
})

const SYSTEM: Record<'standard' | 'e2e' | 'api', string> = {
  standard: `You are a QA engineer for a banking system.
Output ONLY valid JSON array. No explanation. No markdown.
Format: [{"id":"TC-01","title":"...","steps":"...","expected":"...","priority":"High|Med|Low","testData":"...","prerequisite":"...","positiveNegative":"Positive|Negative"}]
Max 8 test cases. Cover functional, boundary, security, and negative scenarios.`,
  e2e: `You are a QA engineer writing E2E test flows.
Output ONLY valid JSON array. No explanation. No markdown.
Format: [{"id":"TC-E2E-01","title":"...","flow":"...","steps":[{"num":1,"keyword":"...","args":"...","type":"Action|Verify|Setup|DB","note":"..."}],"priority":"High|Med|Low"}]
Max 3 E2E flows. Focus on critical user journeys across modules.`,
  api: `You are a QA engineer writing API test cases.
Output ONLY valid JSON array. No explanation. No markdown.
Format: [{"id":"ATC-01","method":"GET|POST|PUT|DELETE","endpoint":"...","body":{},"assertions":[{"type":"status|body|jsonpath|time","operator":"equals|contains|less_than","expected":"..."}],"priority":"High|Med|Low"}]`,
}

function extractJSON(text: string): unknown[] {
  const t = text.trim()
  try {
    const v = JSON.parse(t)
    return Array.isArray(v) ? v : []
  } catch {}
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) {
    try {
      const v = JSON.parse(block[1].trim())
      return Array.isArray(v) ? v : []
    } catch {}
  }
  const arr = t.match(/\[[\s\S]*\]/)
  if (arr) {
    try {
      const v = JSON.parse(arr[0])
      return Array.isArray(v) ? v : []
    } catch {}
  }
  return []
}

function buildContent(
  requirement: string,
  images: string[],
  swaggerContext?: string
): Anthropic.MessageParam['content'] {
  const userText = swaggerContext
    ? `${requirement}\n\n## API Spec Reference\n\`\`\`json\n${swaggerContext}\n\`\`\``
    : requirement

  const blocks: Anthropic.MessageParam['content'] = [{ type: 'text', text: userText }]

  for (const img of images) {
    const data = img.includes(',') ? img.split(',')[1] : img
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    } as Anthropic.ImageBlockParam)
  }

  return blocks
}

async function callAI(
  type: 'standard' | 'e2e' | 'api',
  requirement: string,
  images: string[],
  swaggerContext?: string
): Promise<unknown[]> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM[type], cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildContent(requirement, images, swaggerContext) }],
  })
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '[]'
  return extractJSON(text)
}

// ── Type converters ──────────────────────────────────────────────────────────

const PRIORITIES = ['High', 'Med', 'Low'] as const
type Priority = (typeof PRIORITIES)[number]
const isPriority = (v: unknown): v is Priority => PRIORITIES.includes(v as Priority)

function toStandard(raw: unknown, i: number): StandardTC {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `TC-${String(i + 1).padStart(2, '0')}`,
    type: 'Standard',
    title: typeof r.title === 'string' ? r.title : '',
    steps: typeof r.steps === 'string' ? r.steps : '',
    expected: typeof r.expected === 'string' ? r.expected : '',
    priority: isPriority(r.priority) ? r.priority : 'Med',
    testData: typeof r.testData === 'string' ? r.testData : '',
    prerequisite: typeof r.prerequisite === 'string' ? r.prerequisite : '',
    positiveNegative: r.positiveNegative === 'Negative' ? 'Negative' : 'Positive',
    aiGenerated: true,
    source: 'ai',
    status: 'Pending',
  }
}

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

function toE2E(raw: unknown, i: number): E2ETC {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `TC-E2E-${String(i + 1).padStart(2, '0')}`,
    type: 'E2E',
    title: typeof r.title === 'string' ? r.title : '',
    flow: typeof r.flow === 'string' ? r.flow : '',
    steps: Array.isArray(r.steps) ? r.steps.map((s, j) => toStep(s, j)) : [],
    priority: isPriority(r.priority) ? r.priority : 'Med',
    aiGenerated: true,
    source: 'ai',
    status: 'Pending',
  }
}

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

function toAPI(raw: unknown, i: number): APITC {
  const r = (raw ?? {}) as Record<string, unknown>
  const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `ATC-${String(i + 1).padStart(2, '0')}`,
    type: 'API',
    method: methods.includes(r.method as 'GET') ? (r.method as APITC['method']) : 'GET',
    endpoint: typeof r.endpoint === 'string' ? r.endpoint : '',
    body:
      r.body && typeof r.body === 'object' && !Array.isArray(r.body)
        ? (r.body as Record<string, unknown>)
        : {},
    assertions: Array.isArray(r.assertions)
      ? r.assertions.map(toAssertion).filter((a): a is Assertion => a !== null)
      : [],
    priority: isPriority(r.priority) ? r.priority : 'Med',
    aiGenerated: true,
    source: 'ai',
    status: 'Pending',
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { type, requirement, images, swaggerContext } = parsed.data

  const check = classify(requirement)
  if (!check.safe) {
    return NextResponse.json({ error: `Blocked: ${check.warnings[0]}` }, { status: 400 })
  }

  try {
    if (type === 'all') {
      const [std, e2e, api] = await Promise.allSettled([
        callAI('standard', requirement, images, swaggerContext),
        callAI('e2e', requirement, images, swaggerContext),
        callAI('api', requirement, images, swaggerContext),
      ])
      return NextResponse.json({
        standard: std.status === 'fulfilled' ? std.value.map(toStandard) : [],
        e2e: e2e.status === 'fulfilled' ? e2e.value.map(toE2E) : [],
        api: api.status === 'fulfilled' ? api.value.map(toAPI) : [],
      })
    }

    const raw = await callAI(type, requirement, images, swaggerContext)
    if (type === 'standard') return NextResponse.json({ standard: raw.map(toStandard) })
    if (type === 'e2e') return NextResponse.json({ e2e: raw.map(toE2E) })
    return NextResponse.json({ api: raw.map(toAPI) })
  } catch (err) {
    console.error('[/api/generate]', err)
    return NextResponse.json(
      { error: 'AI generation failed — verify ANTHROPIC_API_KEY is set' },
      { status: 500 }
    )
  }
}
