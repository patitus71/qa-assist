// lib/response-differ.ts
// Adapted from robot-test-manager/lib/response-differ.ts

export interface DiffEntry {
  path: string
  status: 'match' | 'mismatch' | 'missing'
  expected?: unknown
  actual?: unknown
}

export function diffJSON(expected: unknown, actual: unknown, path = ''): DiffEntry[] {
  const results: DiffEntry[] = []

  // Primitive or null — direct comparison
  if (expected === null || typeof expected !== 'object') {
    results.push({
      path: path || '(root)',
      status: JSON.stringify(expected) === JSON.stringify(actual) ? 'match' : 'mismatch',
      expected,
      actual,
    })
    return results
  }

  // Array
  if (Array.isArray(expected)) {
    const actualArr = Array.isArray(actual) ? actual : []
    const len = Math.max(expected.length, actualArr.length)
    for (let i = 0; i < len; i++) {
      const p = `${path}[${i}]`
      if (i >= expected.length) {
        results.push({ path: p, status: 'mismatch', expected: undefined, actual: actualArr[i] })
      } else if (i >= actualArr.length) {
        results.push({ path: p, status: 'missing', expected: expected[i], actual: undefined })
      } else {
        results.push(...diffJSON(expected[i], actualArr[i], p))
      }
    }
    return results
  }

  // Object
  const expObj = expected as Record<string, unknown>
  const actObj: Record<string, unknown> =
    actual && typeof actual === 'object' && !Array.isArray(actual)
      ? (actual as Record<string, unknown>)
      : {}

  for (const key of Object.keys(expObj)) {
    const p = path ? `${path}.${key}` : key
    if (!(key in actObj)) {
      results.push({ path: p, status: 'missing', expected: expObj[key], actual: undefined })
    } else {
      results.push(...diffJSON(expObj[key], actObj[key], p))
    }
  }

  // Extra keys in actual not in expected
  for (const key of Object.keys(actObj)) {
    if (!(key in expObj)) {
      const p = path ? `${path}.${key}` : key
      results.push({ path: p, status: 'mismatch', expected: undefined, actual: actObj[key] })
    }
  }

  return results
}
