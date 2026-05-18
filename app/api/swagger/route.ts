export const runtime = 'edge'

// app/api/swagger/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const QuerySchema = z.object({
  url: z.string().url('Must be a valid URL'),
})

export async function GET(req: NextRequest) {
  const raw = { url: new URL(req.url).searchParams.get('url') ?? '' }
  const parsed = QuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 })
  }

  let response: Response
  try {
    response = await fetch(parsed.data.url, {
      headers: { Accept: 'application/json, application/yaml, text/yaml' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Request timed out'
        : 'Could not reach the URL'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({ error: `URL returned ${response.status}` }, { status: 502 })
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read response body' }, { status: 502 })
  }

  // Truncate to token-budget-safe size (~4000 chars) and return as context
  const content = text.length > 4000 ? text.slice(0, 4000) + '\n...(truncated)' : text

  // Try to parse as JSON to extract just paths
  try {
    const spec = JSON.parse(text) as Record<string, unknown>
    const paths = spec.paths
    if (paths && typeof paths === 'object') {
      const summary = JSON.stringify({ paths }, null, 2)
      return NextResponse.json({
        content: summary.length > 4000 ? summary.slice(0, 4000) + '\n...' : summary,
        title: typeof spec.info === 'object' && spec.info !== null
          ? (spec.info as Record<string, unknown>).title as string | undefined
          : undefined,
      })
    }
  } catch {
    // Not JSON (likely YAML) — return raw text truncated
  }

  return NextResponse.json({ content })
}
