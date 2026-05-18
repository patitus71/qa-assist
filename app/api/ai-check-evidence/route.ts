export const runtime = 'nodejs'

// app/api/ai-check-evidence/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const InputSchema = z.object({
  expected: z.string().min(1),
  apiResponse: z.string().optional().default(''),
  dbResult: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  screenshots: z.array(z.string().max(2_500_000)).max(3).optional().default([]),
})

const SYSTEM = `You are a QA analyst verifying test evidence against expected results.
Output ONLY valid JSON. No explanation. No markdown.
Format: {"verdict":"pass|fail|inconclusive","reasoning":"one sentence"}`

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'expected is required' }, { status: 400 })
  }

  const { expected, apiResponse, dbResult, notes, screenshots } = parsed.data

  const userParts: Anthropic.MessageParam['content'] = []

  let textContent = `Expected result:\n${expected}`
  if (apiResponse) textContent += `\n\nAPI Response:\n${apiResponse}`
  if (dbResult) textContent += `\n\nDB Result:\n${dbResult}`
  if (notes) textContent += `\n\nNotes:\n${notes}`
  userParts.push({ type: 'text', text: textContent })

  for (const img of screenshots) {
    const data = img.includes(',') ? img.split(',')[1] : img
    userParts.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    } as Anthropic.ImageBlockParam)
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userParts }],
    })

    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}'
    let result: { verdict: string; reasoning: string }
    try {
      result = JSON.parse(text.trim()) as typeof result
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) as typeof result : { verdict: 'inconclusive', reasoning: 'Could not parse AI response' }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/ai-check-evidence]', err)
    return NextResponse.json({ error: 'AI check failed' }, { status: 500 })
  }
}
