export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { classify } from '@/lib/classifier'
import type { TCMRow, TCPriority } from '@/lib/types'

const client = new Anthropic()

const InputSchema = z.object({
  requirement: z.string().min(1).max(10000),
  tcm: z.object({
    groups: z.array(z.object({
      name: z.string(),
      values: z.array(z.string()),
    })).max(20),
    existingTCs: z.array(z.object({
      title: z.string(),
    })).max(100).optional().default([]),
  }),
})

const SYSTEM = `You are a senior QA engineer specializing in Thai banking applications.
Given an existing TCM structure and a requirement, generate ONLY the missing test scenarios not yet covered.
Each scenario must include test steps and a reason explaining what risk or edge case it covers.
Return ONLY valid JSON — no markdown, no explanation.
Schema: {"rows":[{"id":"GEN-01","scenario":"string","steps":"step 1\\nstep 2","reason":"string","checks":{"GroupName":{"Value1":true,"Value2":false}},"posNeg":"Positive|Negative","priority":"High|Med|Low","isNew":true}]}
Rules:
- Use EXACT group names and values from the provided TCM groups — never invent new ones
- checks must include every group name and every value for that group (true/false)
- steps: newline-separated test actions, concise, max 5 lines
- reason: 1-2 sentences on the risk, edge case, or compliance requirement this scenario covers
- priority: High for critical/security flows, Med for standard flows, Low for edge cases
- Generate max 15 rows — no duplicates of existing scenarios
- Every row must have "isNew": true`

function extractJSON(text: string): Record<string, unknown> {
  const t = text.trim()
  try { return JSON.parse(t) as Record<string, unknown> } catch { /* try next */ }
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) { try { return JSON.parse(block[1].trim()) as Record<string, unknown> } catch { /* try next */ } }
  const obj = t.match(/\{[\s\S]*\}/)
  if (obj) { try { return JSON.parse(obj[0]) as Record<string, unknown> } catch { /* try next */ } }
  return {}
}

const PRIORITIES = ['High', 'Med', 'Low'] as const
const isPriority = (v: unknown): v is TCPriority => PRIORITIES.includes(v as TCPriority)

type GroupLookup = Map<string, Set<string>>

function buildGroupLookup(groups: { name: string; values: string[] }[]): GroupLookup {
  const lookup = new Map<string, Set<string>>()
  for (const g of groups) lookup.set(g.name, new Set(g.values))
  return lookup
}

// Strip hallucinated group/value names — initializes all known pairs to false,
// then applies only the AI-provided values that exist in our lookup.
function validateChecks(
  rawChecks: unknown,
  lookup: GroupLookup,
): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {}
  for (const [gName, vals] of lookup) {
    result[gName] = {}
    for (const v of vals) result[gName][v] = false
  }
  if (!rawChecks || typeof rawChecks !== 'object' || Array.isArray(rawChecks)) return result
  for (const [gName, vals] of Object.entries(rawChecks as Record<string, unknown>)) {
    if (!lookup.has(gName) || !vals || typeof vals !== 'object' || Array.isArray(vals)) continue
    const validVals = lookup.get(gName)!
    for (const [v, checked] of Object.entries(vals as Record<string, unknown>)) {
      if (validVals.has(v)) result[gName][v] = !!checked
    }
  }
  return result
}

function toRow(raw: unknown, i: number, lookup: GroupLookup): TCMRow {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `GEN-${String(i + 1).padStart(2, '0')}`,
    scenario: typeof r.scenario === 'string' ? r.scenario.trim() : '',
    steps: typeof r.steps === 'string' && r.steps.trim() ? r.steps.trim() : undefined,
    reason: typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : undefined,
    checks: validateChecks(r.checks, lookup),
    posNeg: r.posNeg === 'Negative' ? 'Negative' : 'Positive',
    priority: isPriority(r.priority) ? r.priority : 'Med',
    isNew: true,
  }
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

  const { requirement, tcm } = parsed.data

  const check = classify(requirement)
  if (!check.safe) {
    return NextResponse.json({ error: `Blocked: ${check.warnings[0]}` }, { status: 400 })
  }

  const lookup = buildGroupLookup(tcm.groups)

  const groupsSummary = tcm.groups
    .map(g => `- ${g.name}: ${g.values.join(', ')}`)
    .join('\n')

  const existingList = tcm.existingTCs
    .slice(0, 60)
    .map((tc, i) => `${i + 1}. ${tc.title}`)
    .join('\n')

  const userText = `Requirement:\n${requirement}\n\nTCM Groups:\n${groupsSummary}${
    existingList ? `\n\nAlready covered (do NOT duplicate):\n${existingList}` : ''
  }\n\nGenerate ONLY missing scenarios with steps and reason.`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    })

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
    const rawData = extractJSON(text)

    const rows: TCMRow[] = Array.isArray(rawData.rows)
      ? rawData.rows
          .map((r, i) => toRow(r, i, lookup))
          .filter(r => r.scenario.length > 0)
      : []

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[/api/generate-from-tcm]', err)
    return NextResponse.json({ error: 'Generation failed — verify ANTHROPIC_API_KEY is set' }, { status: 500 })
  }
}
