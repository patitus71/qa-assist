export const runtime = 'edge'

// app/api/jira/add-comment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const InputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid issue key'),
  body: z.string().min(1).max(32000),
})

// Convert plain text to Atlassian Document Format (ADF)
function textToADF(text: string) {
  const content = text
    .split('\n\n')
    .filter(Boolean)
    .map(block => {
      // Check if it's a list item block (lines starting with • or -)
      if (block.includes('\n') && block.split('\n').every(l => /^[•\-\*]\s/.test(l.trim()) || !l.trim())) {
        const items = block.split('\n').filter(l => /^[•\-\*]\s/.test(l.trim()))
        return {
          type: 'bulletList',
          content: items.map(item => ({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: item.replace(/^[•\-\*]\s/, '').trim() }],
            }],
          })),
        }
      }
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: block }],
      }
    })

  return { type: 'doc', version: 1, content }
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

  const { issueKey, body: commentText } = parsed.data
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL

  if (!baseUrl || !token || !email) {
    return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 })
  }

  const credentials = btoa(`${email}:${token}`)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ body: textToADF(commentText) }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach Jira' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Jira returned ${res.status}` }, { status: 502 })
  }

  const created = await res.json() as { id: string }
  return NextResponse.json({ success: true, commentId: created.id })
}
