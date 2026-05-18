export const runtime = 'edge'

// app/api/zephyr/cycles/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const type = process.env.ZEPHYR_TYPE ?? ''
  const token = process.env.ZEPHYR_TOKEN ?? ''
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '') ?? ''

  if (!token || !type) return NextResponse.json({ cycles: [] })

  try {
    if (type === 'scale') {
      // Zephyr Scale (cloud)
      const res = await fetch('https://api.zephyrscale.smartbear.com/v2/testcycles?maxResults=50&status=Active', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return NextResponse.json({ cycles: [] })
      const data = await res.json() as { values?: { id: string; name: string; status: string }[] }
      return NextResponse.json({
        cycles: (data.values ?? []).map(c => ({ id: String(c.id), name: c.name, status: c.status })),
      })
    }

    if (type === 'squad' && baseUrl) {
      // Zephyr Squad (server/DC)
      const res = await fetch(`${baseUrl}/rest/zapi/latest/cycle?versionId=-1`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return NextResponse.json({ cycles: [] })
      const data = await res.json() as Record<string, { name: string }>
      const cycles = Object.entries(data)
        .filter(([k]) => k !== 'recordsCount')
        .map(([id, v]) => ({ id, name: v.name, status: 'Active' }))
      return NextResponse.json({ cycles })
    }
  } catch {
    // Zephyr not reachable — return empty, UI will hide selector
  }

  return NextResponse.json({ cycles: [] })
}
