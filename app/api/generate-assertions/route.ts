export const runtime = 'nodejs'

// app/api/generate-assertions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { Assertion } from '@/lib/types'

const client = new Anthropic()

const InputSchema = z.object({
  exampleResponse: z.string().min(1).max(20000),
})

const SYSTEM = `You are a QA engineer generating API test assertions from an example JSON response.
Output ONLY valid JSON array. No explanation. No markdown.
Format: [{"type":"status|body|jsonpath|time","operator":"equals|contains|less_than","expected":"..."}]
Rules: add status 200 assertion first. For each JSON field create a jsonpath assertion using $ notation. For string/number fields with specific values add equals assertion. Always add time less_than 2000 at end.`

function extractJSON(text: string): unknown[] {
  try {
    const v = JSON.parse(text.trim())
    return Array.isArray(v) ? v : []
  } catch {}
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) {
    try {
      const v = JSON.parse(block[1].trim())
      return Array.isArray(v) ? v : []
    } catch {}
  }
  const arr = text.match(/\[[\s\S]*\]/)
  if (arr) {
    try {
      const v = JSON.parse(arr[0])
      return Array.isArray(v) ? v : []
    } catch {}
  }
  return []
}

function toAssertion(raw: unknown): (Assertion & { fromSpec: true }) | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (!['status', 'body', 'jsonpath', 'time'].includes(r.type as string)) return null
  if (!['equals', 'contains', 'less_than'].includes(r.operator as string)) return null
  return {
    type: r.type as Assertion['type'],
    operator: r.operator as Assertion['operator'],
    expected: typeof r.expected === 'string' ? r.expected : String(r.expected ?? ''),
    fromSpec: true,
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'exampleResponse is required' }, { status: 400 })
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: parsed.data.exampleResponse }],
    })

    const text =
      msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '[]'
    const raw = extractJSON(text)
    const assertions = raw.map(toAssertion).filter((a): a is Assertion & { fromSpec: true } => a !== null)

    return NextResponse.json({ assertions })
  } catch (err) {
    console.error('[/api/generate-assertions]', err)
    return NextResponse.json({ error: 'Assertion generation failed' }, { status: 500 })
  }
}
