export const runtime = 'edge'

// app/api/jira/create-issue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const InputSchema = z.object({
  projectKey: z.string().min(1),
  title: z.string().min(1),
  steps: z.string(),
  expected: z.string(),
  actual: z.string(),
  priority: z.enum(['Critical', 'High', 'Med', 'Low']),
  labels: z.array(z.string()),
  tcLinks: z.array(z.object({ key: z.string(), type: z.string() })).optional().default([]),
  sprintId: z.string().optional(),
  zephyrCycleId: z.string().optional(),
  storyKey: z.string().optional(),
  evidenceNotes: z.string().optional(),
})

function adfDoc(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: text
      .split('\n\n')
      .filter(Boolean)
      .map(para => ({
        type: 'paragraph',
        content: [{ type: 'text', text: para }],
      })),
  }
}

const PRIORITY_MAP: Record<string, string> = {
  Critical: 'Critical',
  High: 'High',
  Med: 'Medium',
  Low: 'Low',
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

  const d = parsed.data
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL

  if (!baseUrl || !token || !email) {
    return NextResponse.json({ error: 'Jira is not configured on this server' }, { status: 503 })
  }

  const credentials = btoa(`${email}:${token}`)
  const headers = {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const description = `*Steps to Reproduce:*\n${d.steps}\n\n*Expected Result:*\n${d.expected}\n\n*Actual Result:*\n${d.actual}${d.evidenceNotes ? `\n\n*Notes:*\n${d.evidenceNotes}` : ''}`

  const issueBody: Record<string, unknown> = {
    fields: {
      project: { key: d.projectKey },
      summary: d.title,
      description: adfDoc(description),
      issuetype: { name: 'Bug' },
      priority: { name: PRIORITY_MAP[d.priority] ?? 'High' },
      labels: d.labels,
    },
  }

  if (d.sprintId) {
    (issueBody.fields as Record<string, unknown>).customfield_10020 = { id: parseInt(d.sprintId) }
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify(issueBody),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach Jira' }, { status: 502 })
  }

  if (!res.ok) {
    const err = await res.text()
    console.error('[create-issue]', res.status, err)
    return NextResponse.json({ error: `Jira returned ${res.status}` }, { status: 502 })
  }

  const created = await res.json() as { key: string; id: string }

  // Create TC links
  for (const link of d.tcLinks) {
    if (!link.key) continue
    const linkTypeMap: Record<string, { name: string; direction: 'inward' | 'outward' }> = {
      'caused by': { name: 'Caused', direction: 'inward' },
      'related to': { name: 'Relates', direction: 'outward' },
      'blocks': { name: 'Blocks', direction: 'outward' },
    }
    const lt = linkTypeMap[link.type] ?? { name: 'Relates', direction: 'outward' }
    const linkBody = {
      type: { name: lt.name },
      [lt.direction === 'inward' ? 'inwardIssue' : 'outwardIssue']: { key: link.key },
      [lt.direction === 'inward' ? 'outwardIssue' : 'inwardIssue']: { key: created.key },
    }
    try {
      await fetch(`${baseUrl}/rest/api/3/issueLink`, {
        method: 'POST',
        headers,
        body: JSON.stringify(linkBody),
        signal: AbortSignal.timeout(10_000),
      })
    } catch { /* non-fatal */ }
  }

  // Story link
  if (d.storyKey) {
    try {
      await fetch(`${baseUrl}/rest/api/3/issueLink`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: { name: 'Relates' },
          outwardIssue: { key: created.key },
          inwardIssue: { key: d.storyKey },
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    key: created.key,
    url: `${baseUrl}/browse/${created.key}`,
  })
}
