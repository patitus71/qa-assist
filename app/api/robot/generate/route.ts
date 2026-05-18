export const runtime = 'nodejs'

// app/api/robot/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { generateDefaultRobot, DEFAULT_SETTINGS, DEFAULT_VARIABLES, DEFAULT_KEYWORDS } from '@/lib/export-robot'
import type { TC } from '@/lib/types'

const client = new Anthropic()

const TemplateSchema = z.object({
  settings: z.string(),
  variables: z.string(),
  testcases: z.string(),
  keywords: z.string(),
})

const InputSchema = z.object({
  tcs: z.array(z.unknown()),
  mode: z.enum(['default', 'custom']),
  template: TemplateSchema.optional(),
  scope: z.array(z.string()),
  selectedIds: z.array(z.string()).optional(),
})

// Minimal TC summary for AI prompt (avoid sending huge payloads)
function tcSummary(tc: unknown): string {
  const t = tc as Record<string, unknown>
  if (t.type === 'Standard') {
    return `TC ID: ${t.id}\nTitle: ${t.title}\nSteps: ${t.steps}\nExpected: ${t.expected}\nPriority: ${t.priority}`
  }
  if (t.type === 'E2E') {
    const steps = Array.isArray(t.steps) ? t.steps.map((s: Record<string, unknown>) => `${s.num}. ${s.keyword} ${s.args}`).join('\n') : String(t.steps ?? '')
    return `TC ID: ${t.id}\nTitle: ${t.title}\nFlow: ${t.flow}\nSteps:\n${steps}\nPriority: ${t.priority}`
  }
  // API
  const assertions = Array.isArray(t.assertions) ? t.assertions.map((a: Record<string, unknown>) => `${a.type} ${a.operator} ${a.expected}`).join('; ') : ''
  return `TC ID: ${t.id}\nMethod: ${t.method}\nEndpoint: ${t.endpoint}\nAssertions: ${assertions}\nPriority: ${t.priority}`
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

  const { tcs, mode, template, selectedIds } = parsed.data

  // Filter by selectedIds if provided
  const filteredTCs = selectedIds?.length
    ? tcs.filter(tc => selectedIds.includes((tc as Record<string, unknown>).id as string))
    : tcs

  if (mode === 'default') {
    try {
      const content = generateDefaultRobot(filteredTCs as TC[])
      return NextResponse.json({ content })
    } catch (err) {
      console.error('[robot/generate default]', err)
      return NextResponse.json({ error: 'Failed to generate default template' }, { status: 500 })
    }
  }

  // Custom mode — use AI
  if (!template) {
    return NextResponse.json({ error: 'template is required for custom mode' }, { status: 400 })
  }

  const tcList = filteredTCs.map(tcSummary).join('\n\n---\n\n')

  const systemPrompt = `You are a Robot Framework expert. Write test cases following EXACTLY the format, keywords, and style from this template:

*** Settings ***
${template.settings}

*** Keywords ***
${template.keywords}

Use only the keywords defined above. Match the naming convention, indentation (4 spaces), and tag style exactly.
Output ONLY valid Robot Framework *** Test Cases *** section content. No explanation. No other sections. No *** delimiters.`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Generate Robot Framework test cases for these ${filteredTCs.length} test cases:\n\n${tcList}` }],
    })

    const testCasesBody = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''

    // Build the full .robot file using the custom template's sections + AI-generated test cases
    const usedSettings = template.settings || DEFAULT_SETTINGS.replace('*** Settings ***\n', '')
    const usedVariables = template.variables || DEFAULT_VARIABLES.replace('*** Variables ***\n', '')
    const usedKeywords = template.keywords || DEFAULT_KEYWORDS.replace('*** Keywords ***\n', '')

    const content = [
      `*** Settings ***\n${usedSettings}`,
      `*** Variables ***\n${usedVariables}`,
      `*** Test Cases ***\n${testCasesBody.trim()}`,
      `*** Keywords ***\n${usedKeywords}`,
    ].join('\n\n\n')

    return NextResponse.json({ content })
  } catch (err) {
    console.error('[robot/generate custom]', err)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}
