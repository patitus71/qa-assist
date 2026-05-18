export const runtime = 'edge'

// app/api/jira/issue-with-tcs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const QuerySchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid issue key'),
})

function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(adfToText).join(n.type === 'paragraph' ? '\n' : '')
  }
  return ''
}

export async function GET(req: NextRequest) {
  const raw = { key: new URL(req.url).searchParams.get('key') ?? '' }
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid issue key' }, { status: 400 })
  }

  const { key } = parsed.data
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL

  if (!baseUrl || !token || !email) {
    return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 })
  }

  const credentials = btoa(`${email}:${token}`)
  const headers = { Authorization: `Basic ${credentials}`, Accept: 'application/json' }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/rest/api/3/issue/${key}?expand=issuelinks,subtasks`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach Jira' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: res.status === 404 ? `Issue ${key} not found` : `Jira returned ${res.status}` },
      { status: res.status === 404 ? 404 : 502 }
    )
  }

  const data = await res.json() as Record<string, unknown>
  const fields = data.fields as Record<string, unknown>

  const title = typeof fields?.summary === 'string' ? fields.summary : ''
  const description = adfToText(fields?.description).replace(/\n{3,}/g, '\n\n').trim()
  const acceptanceCriteria = adfToText(fields?.customfield_10016 ?? fields?.customfield_10014 ?? '').trim()

  // Extract sprint
  const sprintField = fields?.customfield_10020
  const sprint = Array.isArray(sprintField) && sprintField.length > 0
    ? (sprintField[0] as Record<string, unknown>)?.name as string | undefined
    : undefined

  // Collect linked test case tickets (subtasks + issue links)
  interface SimpleTC { key: string; title: string; type: string }
  const existingTCs: SimpleTC[] = []

  const subtasks = fields?.subtasks as { key: string; fields: { summary: string; issuetype: { name: string } } }[] | undefined
  if (Array.isArray(subtasks)) {
    for (const sub of subtasks) {
      if (sub.fields?.issuetype?.name?.toLowerCase().includes('test')) {
        existingTCs.push({ key: sub.key, title: sub.fields.summary, type: 'Test' })
      }
    }
  }

  const issueLinks = fields?.issuelinks as {
    type: { name: string }
    outwardIssue?: { key: string; fields: { summary: string; issuetype: { name: string } } }
    inwardIssue?: { key: string; fields: { summary: string; issuetype: { name: string } } }
  }[] | undefined

  if (Array.isArray(issueLinks)) {
    for (const link of issueLinks) {
      const linked = link.outwardIssue ?? link.inwardIssue
      if (linked && linked.fields?.issuetype?.name?.toLowerCase().includes('test')) {
        existingTCs.push({ key: linked.key, title: linked.fields.summary, type: link.type?.name ?? 'Test' })
      }
    }
  }

  return NextResponse.json({
    issue: { key, title, description, acceptanceCriteria, sprint },
    existingTCs,
  })
}
