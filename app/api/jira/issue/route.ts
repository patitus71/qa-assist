export const runtime = 'edge'

// app/api/jira/issue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const QuerySchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira issue key format (expected e.g. PROJ-1042)'),
})

// Convert Atlassian Document Format nodes to plain text
function adfToText(node: unknown, depth = 0): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text
  }

  if (Array.isArray(n.content)) {
    const sep =
      n.type === 'paragraph' || n.type === 'heading'
        ? '\n'
        : n.type === 'bulletList' || n.type === 'orderedList'
        ? ''
        : ''
    return (n.content as unknown[])
      .map(child => {
        const text = adfToText(child, depth + 1)
        if (n.type === 'listItem' && depth === 0) return `• ${text}`
        if ((n.type === 'bulletList' || n.type === 'orderedList') && typeof child === 'object' && child !== null) {
          return `• ${text}`
        }
        return text
      })
      .join(sep)
  }

  return ''
}

function extractText(field: unknown): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  return adfToText(field).replace(/\n{3,}/g, '\n\n').trim()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = { key: searchParams.get('key') ?? '' }

  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }

  const { key } = parsed.data
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL

  if (!baseUrl || !token || !email) {
    return NextResponse.json(
      { error: 'Jira integration is not configured on this server' },
      { status: 503 }
    )
  }

  let response: Response
  try {
    const credentials = btoa(`${email}:${token}`)
    response = await fetch(`${baseUrl}/rest/api/3/issue/${key}`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
      // 10-second timeout via AbortSignal
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const message = err instanceof Error && err.name === 'TimeoutError'
      ? 'Jira request timed out'
      : 'Could not reach Jira — check network connectivity'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  if (!response.ok) {
    if (response.status === 401) {
      return NextResponse.json({ error: 'Jira authentication failed — check JIRA_API_TOKEN' }, { status: 502 })
    }
    if (response.status === 404) {
      return NextResponse.json({ error: `Issue ${key} not found` }, { status: 404 })
    }
    return NextResponse.json({ error: `Jira returned ${response.status}` }, { status: 502 })
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Jira returned an unexpected response' }, { status: 502 })
  }

  const fields = data.fields as Record<string, unknown> | undefined

  const title = typeof fields?.summary === 'string' ? fields.summary : ''
  const description = extractText(fields?.description)

  // Try common Jira custom fields for Acceptance Criteria
  const acceptanceCriteria =
    extractText(fields?.customfield_10016) ||
    extractText(fields?.customfield_10014) ||
    extractText(fields?.customfield_10028) ||
    ''

  return NextResponse.json({ key, title, description, acceptanceCriteria })
}
