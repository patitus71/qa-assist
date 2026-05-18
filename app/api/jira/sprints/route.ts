export const runtime = 'edge'

// app/api/jira/sprints/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const token = process.env.JIRA_API_TOKEN
  const email = process.env.JIRA_EMAIL
  const boardId = process.env.JIRA_BOARD_ID

  if (!baseUrl || !token || !email) {
    return NextResponse.json({ sprints: [] })
  }

  const credentials = btoa(`${email}:${token}`)

  // If no board ID, try to get any active sprint via the sprint search API
  const url = boardId
    ? `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active,future`
    : `${baseUrl}/rest/agile/1.0/sprint/search?state=active`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return NextResponse.json({ sprints: [] })
  }

  if (!res.ok) return NextResponse.json({ sprints: [] })

  const data = await res.json() as { values?: { id: number; name: string; state: string }[] }
  const sprints = (data.values ?? []).map(s => ({
    id: String(s.id),
    name: s.name,
    state: s.state,
  }))

  return NextResponse.json({ sprints })
}
