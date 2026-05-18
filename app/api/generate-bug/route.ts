export const runtime = 'nodejs'

// app/api/generate-bug/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { BugDraft } from '@/lib/types'

const client = new Anthropic()

const InputSchema = z.object({
  tcId: z.string(),
  tcTitle: z.string(),
  steps: z.string(),
  expected: z.string(),
  actual: z.string().optional().default(''),
  priority: z.enum(['High', 'Med', 'Low']).optional().default('High'),
})

const SYSTEM = `You are a QA engineer writing a Jira bug report.
Output ONLY valid JSON. No explanation. No markdown.
Format: {"title":"[BUG] ...","steps":"...","expected":"...","actual":"...","priority":"Critical|High|Med|Low","labels":["AI-generated"]}`

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
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { tcId, tcTitle, steps, expected, actual, priority } = parsed.data

  const userPrompt = `TC ID: ${tcId}
Title: ${tcTitle}
Steps: ${steps}
Expected: ${expected}
Actual: ${actual || 'Not specified'}
Priority: ${priority}`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
    const raw = extractJSON(text) as Record<string, unknown> | null

    if (!raw) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    const bug: BugDraft = {
      title: typeof raw.title === 'string' ? raw.title : `[BUG] ${tcTitle}`,
      steps: typeof raw.steps === 'string' ? raw.steps : steps,
      expected: typeof raw.expected === 'string' ? raw.expected : expected,
      actual: typeof raw.actual === 'string' ? raw.actual : actual,
      priority: (['Critical', 'High', 'Med', 'Low'] as const).includes(raw.priority as 'Critical')
        ? (raw.priority as BugDraft['priority'])
        : 'High',
      labels: Array.isArray(raw.labels) ? raw.labels.filter((l): l is string => typeof l === 'string') : ['AI-generated'],
    }

    return NextResponse.json({ bug })
  } catch (err) {
    console.error('[/api/generate-bug]', err)
    return NextResponse.json({ error: 'Bug generation failed' }, { status: 500 })
  }
}
