export const runtime = 'edge'

// app/api/jira/xlsx-meta/route.ts
// Returns Jira fields useful for pre-populating the xlsx export modal.
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get('key')?.trim()
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL

  if (!baseUrl || !token || !email) {
    return NextResponse.json({ error: 'Jira integration is not configured' }, { status: 503 })
  }

  let res: Response
  try {
    const credentials = btoa(`${email}:${token}`)
    res = await fetch(`${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const msg = err instanceof Error && err.name === 'TimeoutError'
      ? 'Jira request timed out'
      : 'Could not reach Jira'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!res.ok) {
    if (res.status === 404) return NextResponse.json({ error: `Issue ${key} not found` }, { status: 404 })
    if (res.status === 401) return NextResponse.json({ error: 'Jira authentication failed' }, { status: 502 })
    return NextResponse.json({ error: `Jira returned ${res.status}` }, { status: 502 })
  }

  const data = await res.json() as Record<string, unknown>
  const f = data.fields as Record<string, unknown> | undefined ?? {}

  // Sprint
  const sprintArr = f.customfield_10020
  const sprint = Array.isArray(sprintArr) && sprintArr.length > 0
    ? String((sprintArr[0] as Record<string, unknown>).name ?? '')
    : ''

  // Fix versions → Release
  const versions = f.fixVersions
  const release = Array.isArray(versions) && versions.length > 0
    ? String((versions[0] as Record<string, unknown>).name ?? '')
    : ''

  // Components
  const comps = f.components
  const components = Array.isArray(comps)
    ? comps.map((c: unknown) => String((c as Record<string, unknown>).name ?? '')).filter(Boolean).join(', ')
    : ''

  // Parent issue (Next-gen) and epic link (Classic customfield_10014)
  const parent = f.parent as Record<string, unknown> | undefined
  const parentKey = parent?.key ? String(parent.key) : ''
  const parentFields = parent?.fields as Record<string, unknown> | undefined
  const parentSummary = typeof parentFields?.summary === 'string' ? parentFields.summary : ''
  const parentIssuetype = parentFields?.issuetype as Record<string, unknown> | undefined
  const parentType = typeof parentIssuetype?.name === 'string' ? parentIssuetype.name : ''

  // epicLink prefers classic customfield_10014, falls back to parent key
  const epicLink = typeof f.customfield_10014 === 'string' && f.customfield_10014
    ? f.customfield_10014
    : parentKey

  // Reporter
  const reporter = f.reporter as Record<string, unknown> | undefined
  const reporterName = reporter?.displayName ? String(reporter.displayName)
    : reporter?.emailAddress ? String(reporter.emailAddress)
    : ''

  // Labels
  const rawLabels = f.labels
  const labels: string[] = Array.isArray(rawLabels)
    ? rawLabels.map(String).filter(Boolean)
    : []

  return NextResponse.json({
    sprint, release, components, epicLink, reporter: reporterName, labels,
    parentKey, parentSummary, parentType,
  })
}
