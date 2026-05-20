export const runtime = 'edge'

// app/api/jira/push-tcs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const TCSchema = z.object({
  id: z.string(),
  type: z.enum(['Standard', 'E2E', 'API']),
  title: z.string().optional().default(''),
  steps: z.string().optional().default(''),
  expected: z.string().optional().default(''),
  flow: z.string().optional().default(''),
  method: z.string().optional(),
  endpoint: z.string().optional(),
  priority: z.enum(['High', 'Med', 'Low']),
  aiGenerated: z.boolean().optional().default(false),
})

const InputSchema = z.object({
  tcs: z.array(TCSchema).min(1),
  projectKey: z.string().min(1),
  parentKey: z.string().optional(),
  // shared metadata
  workStream: z.string().optional(),
  release: z.string().optional(),
  squad: z.string().optional(),
  sprintId: z.string().optional(),
  createdBy: z.string().optional(),
  labels: z.array(z.string()).optional(),
  components: z.string().optional(),
  epicLink: z.string().optional(),
})

const PRIORITY_MAP: Record<string, string> = {
  High: 'High', Med: 'Medium', Low: 'Low',
}

function adfDoc(text: string) {
  return {
    type: 'doc', version: 1,
    content: text.split('\n\n').filter(Boolean).map(para => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para }],
    })),
  }
}

function tcDescription(tc: z.infer<typeof TCSchema>): string {
  if (tc.type === 'Standard') {
    return `*Steps:*\n${tc.steps}\n\n*Expected:*\n${tc.expected}`
  }
  if (tc.type === 'E2E') {
    return `*Flow:*\n${tc.flow}\n\n*Steps:*\n${tc.steps}`
  }
  return `*Endpoint:* ${tc.method} ${tc.endpoint}\n\n*Expected:*\n${tc.expected}`
}

function tcSummary(tc: z.infer<typeof TCSchema>): string {
  if (tc.type === 'API') return `${tc.id}: ${tc.method ?? 'GET'} ${tc.endpoint ?? ''}`
  return `${tc.id}: ${tc.title}`
}

function buildDescription(
  tc: z.infer<typeof TCSchema>,
  metaLines: string[],
): string {
  const header = metaLines.length > 0
    ? `[QA Metadata]\n${metaLines.join('\n')}\n\n`
    : ''
  return header + tcDescription(tc)
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

  const {
    tcs, projectKey, parentKey,
    workStream, release, squad, sprintId,
    labels: baseLabels, components, epicLink,
  } = parsed.data

  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL
  const issueType = process.env.JIRA_TC_ISSUE_TYPE ?? 'Task'

  if (!baseUrl || !token || !email) {
    return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 })
  }

  const credentials = btoa(`${email}:${token}`)
  const headers = {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  // Metadata description lines — included in every issue description
  const metaLines: string[] = [
    workStream ? `Work Stream: ${workStream}` : '',
    squad      ? `Squad: ${squad}` : '',
    release    ? `Release: ${release}` : '',
    sprintId   ? `Sprint: ${sprintId}` : '',
    epicLink   ? `Epic: ${epicLink}` : '',
  ].filter(Boolean)

  // Components array for Jira
  const componentArr = (components ?? '')
    .split(',').map(c => c.trim()).filter(Boolean)
    .map(name => ({ name }))

  // Fix versions (release)
  const fixVersionArr = release ? [{ name: release }] : []

  const results: { tcId: string; jiraKey?: string; error?: string }[] = []

  for (const tc of tcs) {
    // Labels: base labels + AI-generated if tc is AI-generated
    const sharedLabels = baseLabels ?? ['AI-generated']
    const tcLabels = tc.aiGenerated
      ? [...new Set([...sharedLabels, 'AI-generated'])]
      : sharedLabels

    const issueBody: Record<string, unknown> = {
      fields: {
        project: { key: projectKey },
        summary: tcSummary(tc),
        description: adfDoc(buildDescription(tc, metaLines)),
        issuetype: { name: issueType },
        priority: { name: PRIORITY_MAP[tc.priority] ?? 'Medium' },
        labels: tcLabels,
        ...(componentArr.length > 0 ? { components: componentArr } : {}),
        ...(fixVersionArr.length > 0 ? { fixVersions: fixVersionArr } : {}),
        ...(parentKey ? { parent: { key: parentKey } } : {}),
      },
    }

    try {
      const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers,
        body: JSON.stringify(issueBody),
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        results.push({ tcId: tc.id, error: `Jira returned ${res.status}` })
        continue
      }

      const created = await res.json() as { key: string }
      results.push({ tcId: tc.id, jiraKey: created.key })
    } catch (err) {
      results.push({ tcId: tc.id, error: err instanceof Error ? err.message : 'Request failed' })
    }
  }

  const pushed = results.filter(r => r.jiraKey)
  const failed = results.filter(r => r.error)

  return NextResponse.json({ results, pushed: pushed.length, failed: failed.length })
}
