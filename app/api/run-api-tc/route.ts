export const runtime = 'edge'

// app/api/run-api-tc/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { APITC, Assertion, AssertionResult, APIRunResult } from '@/lib/types'

const InputSchema = z.object({
  tc: z.object({
    id: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    endpoint: z.string(),
    body: z.record(z.string(), z.unknown()).optional().default({}),
    assertions: z.array(z.object({
      type: z.enum(['status', 'body', 'jsonpath', 'time']),
      operator: z.enum(['equals', 'contains', 'less_than']),
      expected: z.string(),
    })),
  }),
  environment: z.enum(['dev', 'staging', 'uat']),
})

function evalJsonPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/^\$\.?/, '').split(/[.[\]]+/).filter(Boolean)
  let cur = obj
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function evaluateAssertion(a: Assertion, code: number, body: unknown, ms: number): AssertionResult {
  let actual = ''
  let passed = false

  if (a.type === 'status') {
    actual = String(code)
    passed = a.operator === 'equals' ? actual === a.expected : actual.includes(a.expected)
  } else if (a.type === 'time') {
    actual = `${ms}ms`
    const expected = Number(a.expected)
    passed = a.operator === 'less_than' ? ms < expected : ms === expected
  } else if (a.type === 'body') {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    actual = bodyStr.slice(0, 200)
    passed = a.operator === 'contains' ? bodyStr.includes(a.expected) : bodyStr === a.expected
  } else if (a.type === 'jsonpath') {
    const val = evalJsonPath(body, a.expected)
    actual = val !== undefined ? JSON.stringify(val) : '(not found)'
    passed = val !== undefined && val !== null
  }

  return { assertion: a, passed, actual }
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

  const { tc, environment } = parsed.data

  const envKey = environment.toUpperCase()
  const baseUrl = (process.env[`${envKey}_API_URL`] ?? '').replace(/\/$/, '')

  if (!baseUrl) {
    return NextResponse.json(
      { error: `${envKey}_API_URL is not configured` },
      { status: 503 }
    )
  }

  const token = process.env[`${envKey}_API_TOKEN`] ?? ''
  const fullUrl = `${baseUrl}${tc.endpoint}`

  const start = Date.now()
  let statusCode = 0
  let responseBody: unknown = null

  try {
    const res = await fetch(fullUrl, {
      method: tc.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: tc.method !== 'GET' ? JSON.stringify(tc.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })

    statusCode = res.status
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      responseBody = await res.json()
    } else {
      responseBody = await res.text()
    }
  } catch (err) {
    const ms = Date.now() - start
    const result: APIRunResult = {
      statusCode: 0,
      responseBody: null,
      responseTimeMs: ms,
      assertionResults: [],
      error: err instanceof Error ? err.message : 'Request failed',
    }
    return NextResponse.json(result)
  }

  const ms = Date.now() - start
  const assertionResults = (tc.assertions as APITC['assertions']).map(a =>
    evaluateAssertion(a, statusCode, responseBody, ms)
  )

  const result: APIRunResult = { statusCode, responseBody, responseTimeMs: ms, assertionResults }
  return NextResponse.json(result)
}
