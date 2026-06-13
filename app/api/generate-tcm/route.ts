export const runtime = 'nodejs'

// app/api/generate-tcm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { classify } from '@/lib/classifier'
import type { TCMGroup, TCMRow, TCPriority } from '@/lib/types'

const client = new Anthropic()

const InputSchema = z.object({
  type: z.enum(['standard', 'e2e', 'api']),
  requirement: z.string().min(1).max(10000),
  images: z.array(z.string().max(2_500_000)).max(5).optional().default([]),
  existingTCM: z.object({
    groups: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).max(20),
    existingTCs: z.array(z.object({
      title: z.string(),
      combinations: z.record(z.string(), z.array(z.string())).optional(),
    })).max(100),
  }).optional(),
})

const SYSTEM_FRESH = `You are a senior QA engineer. Generate a Test Case Matrix (TCM) for the given requirement.
Return ONLY valid JSON — no markdown, no explanation.
Schema: {"groups":[{"name":"string","values":["string"]}],"rows":[{"id":"TCM-01","scenario":"string","checks":{"GroupName":{"Value1":true,"Value2":false}},"posNeg":"Positive|Negative","priority":"High|Med|Low"}]}
Rules:
- Identify 2-5 test dimensions (groups), each with 2-6 distinct values
- Generate 10-20 scenario rows covering meaningful, non-redundant combinations
- checks must include every group name and every value for that group (true/false)
- posNeg: exactly "Positive" or "Negative"
- priority: exactly "High", "Med", or "Low"`

const SYSTEM_GAP = `You are a senior QA engineer performing gap analysis on an existing Test Case Matrix.
Generate ONLY missing test scenarios not covered by the existing TCM.
Return ONLY valid JSON — no markdown, no explanation.
Schema: {"rows":[{"id":"TCM-new-01","scenario":"string","checks":{"GroupName":{"Value1":true,"Value2":false}},"posNeg":"Positive|Negative","priority":"High|Med|Low","isNew":true}]}
Rules:
- Use the EXACT same group names and values as the existing TCM (do not invent new groups)
- checks must include every group name and every value (true/false)
- Generate max 15 new rows for uncovered combinations
- Every row MUST have "isNew": true`

function extractJSONObject(text: string): Record<string, unknown> {
  const t = text.trim()
  try { return JSON.parse(t) as Record<string, unknown> } catch { /* try next */ }
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) {
    try { return JSON.parse(block[1].trim()) as Record<string, unknown> } catch { /* try next */ }
  }
  const obj = t.match(/\{[\s\S]*\}/)
  if (obj) {
    try { return JSON.parse(obj[0]) as Record<string, unknown> } catch { /* try next */ }
  }
  return {}
}

const PRIORITIES = ['High', 'Med', 'Low'] as const
const isPriority = (v: unknown): v is TCPriority => PRIORITIES.includes(v as TCPriority)

function toTCMRow(raw: unknown, i: number, forceNew: boolean): TCMRow {
  const r = (raw ?? {}) as Record<string, unknown>
  const rawChecks = (r.checks && typeof r.checks === 'object' && !Array.isArray(r.checks))
    ? (r.checks as Record<string, Record<string, boolean>>)
    : {}
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `TCM-${String(i + 1).padStart(2, '0')}`,
    scenario: typeof r.scenario === 'string' ? r.scenario : '',
    checks: rawChecks,
    posNeg: r.posNeg === 'Negative' ? 'Negative' : 'Positive',
    priority: isPriority(r.priority) ? r.priority : 'Med',
    isNew: forceNew || r.isNew === true,
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

  const { type, requirement, images, existingTCM } = parsed.data

  const check = classify(requirement)
  if (!check.safe) {
    return NextResponse.json({ error: `Blocked: ${check.warnings[0]}` }, { status: 400 })
  }

  const hasExisting = !!existingTCM && existingTCM.groups.length > 0
  const system = hasExisting ? SYSTEM_GAP : SYSTEM_FRESH

  let userText = `Requirement (type: ${type}):\n${requirement}`
  if (hasExisting) {
    const groupsSummary = existingTCM!.groups
      .map(g => `- ${g.name}: ${g.values.join(', ')}`)
      .join('\n')
    const existingList = existingTCM!.existingTCs
      .slice(0, 60)
      .map((tc, i) => {
        const combos = tc.combinations
          ? Object.entries(tc.combinations)
              .filter(([, vals]) => (vals as string[]).length > 0)
              .map(([g, vals]) => `${g}: ${(vals as string[]).join('+')}`)
              .join(' | ')
          : ''
        return `${i + 1}. ${tc.title}${combos ? ` [${combos}]` : ''}`
      })
      .join('\n')
    userText +=
      `\n\nExisting TCM groups:\n${groupsSummary}` +
      `\n\nAlready covered (do NOT duplicate):\n${existingList}` +
      `\n\nGenerate ONLY missing combinations.`
  }

  const content: Anthropic.MessageParam['content'] = [{ type: 'text', text: userText }]
  for (const img of images) {
    const data = img.includes(',') ? img.split(',')[1] : img
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    } as Anthropic.ImageBlockParam)
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    })

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
    const rawData = extractJSONObject(text)

    if (hasExisting) {
      const rows: TCMRow[] = Array.isArray(rawData.rows)
        ? rawData.rows.map((r, i) => toTCMRow(r, i, true))
        : []
      const groups: TCMGroup[] = existingTCM!.groups.map((g, i) => ({
        id: `g-${i}`,
        name: g.name,
        values: g.values,
      }))
      return NextResponse.json({ groups, rows })
    }

    const groups: TCMGroup[] = Array.isArray(rawData.groups)
      ? rawData.groups.map((g, i) => {
          const gr = (g ?? {}) as Record<string, unknown>
          return {
            id: `g-${i}`,
            name: typeof gr.name === 'string' ? gr.name : '',
            values: Array.isArray(gr.values) ? gr.values.map(String) : [],
          }
        }).filter(g => g.name)
      : []

    const rows: TCMRow[] = Array.isArray(rawData.rows)
      ? rawData.rows.map((r, i) => toTCMRow(r, i, false))
      : []

    return NextResponse.json({ groups, rows })
  } catch (err) {
    console.error('[/api/generate-tcm]', err)
    return NextResponse.json({ error: 'TCM generation failed — verify ANTHROPIC_API_KEY is set' }, { status: 500 })
  }
}
