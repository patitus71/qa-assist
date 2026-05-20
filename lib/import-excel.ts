// lib/import-excel.ts
// Read Zephyr-format .xlsx (same layout as export-xlsx.ts) back into TC objects.

import * as XLSX from 'xlsx-js-style'
import type { TC, StandardTC, E2ETC, APITC, E2EStep, Assertion, TCPriority } from './types'

// ── Column indices (mirrors ZEPHYR_ROW1 from export-xlsx.ts) ─────────────────

const C = {
  NAME:       0,  // "TC-001: Title"
  WORK_STREAM:1,
  SPRINT:     2,
  RELEASE:    3,
  SQUAD:      4,
  LABELS:     5,
  COMPONENTS: 6,
  SCENARIO:   7,
  TC_DESC:    8,
  PRIORITY:   9,
  POS_NEG:    10,
  PREREQ:     11,
  TEST_DATA:  12,
  STEP_NO:    13,
  STEP_DESC:  14,
  EXPECTED:   15,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function parsePriority(raw: string): TCPriority {
  if (raw === 'High') return 'High'
  if (raw === 'Medium' || raw === 'Med') return 'Med'
  return 'Low'
}

// "TC-001: Title text" → { id: 'TC-001', title: 'Title text' }
function splitNameId(tcName: string, fallbackType: string, idx: number): { id: string; title: string } {
  const sep = tcName.indexOf(': ')
  if (sep > 0) {
    const id = tcName.slice(0, sep).trim()
    const title = tcName.slice(sep + 2).trim()
    if (id && title) return { id, title }
  }
  const prefix = fallbackType === 'E2E' ? 'E2E' : fallbackType === 'API' ? 'API' : 'TC'
  return { id: `${prefix}-IMP${String(idx + 1).padStart(3, '0')}`, title: tcName }
}

// Detect TC type from the first step description
function detectType(firstDesc: string): 'Standard' | 'E2E' | 'API' {
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\/\S+\s+[—-]\s+assert\s+/i.test(firstDesc)) return 'API'
  if (/^\[(Action|Verify|Setup|DB)\]/i.test(firstDesc)) return 'E2E'
  return 'Standard'
}

// Parse API step: "POST /api/v1/deposit — assert status equals 200"
function parseApiStep(desc: string): { method: string; endpoint: string; assertion: Assertion } | null {
  const m = desc.match(
    /^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)\s+[—-]\s+assert\s+(\w+)\s+(\w+)\s+(.+)$/i,
  )
  if (!m) return null
  return {
    method: m[1].toUpperCase(),
    endpoint: m[2],
    assertion: {
      type: m[3] as Assertion['type'],
      operator: m[4] as Assertion['operator'],
      expected: m[5].trim(),
    },
  }
}

// Parse E2E step: "[Action] Click Element    id=btn # note"
function parseE2EStep(desc: string, num: number): E2EStep | null {
  const m = desc.match(/^\[(Action|Verify|Setup|DB)\]\s+(.+?)(?:\s+#\s+(.+))?$/)
  if (!m) return null
  const parts = m[2].split(/\s{2,}/)
  return {
    num,
    keyword: parts[0] ?? m[2],
    args: parts.slice(1).join('    '),
    type: m[1] as E2EStep['type'],
    note: m[3] ?? '',
  }
}

// ── Row grouping ──────────────────────────────────────────────────────────────

interface RawGroup {
  meta: string[]  // first row of the TC (cols 0-15)
  extra: string[][] // additional step rows
}

function groupRows(rows: unknown[][]): RawGroup[] {
  const groups: RawGroup[] = []
  let current: RawGroup | null = null
  let prevName = ''

  for (const rawRow of rows) {
    const row = rawRow.map(c => str(c))
    const name = row[C.NAME] ?? ''

    if (name && name !== prevName) {
      // New TC
      prevName = name
      current = { meta: row, extra: [] }
      groups.push(current)
    } else if (current) {
      // Continuation (empty col 0 or merged-cell repeat)
      current.extra.push(row)
    }
  }

  return groups
}

// ── TC builders ───────────────────────────────────────────────────────────────

function buildStandardTC(g: RawGroup, idx: number): StandardTC {
  const allStepDescs = [
    str(g.meta[C.STEP_DESC]),
    ...g.extra.map(r => str(r[C.STEP_DESC])),
  ].filter(Boolean)

  const { id, title } = splitNameId(str(g.meta[C.NAME]), 'Standard', idx)

  return {
    id,
    type: 'Standard',
    title,
    steps: allStepDescs.join('\n'),
    stepItems: allStepDescs.map(kw => ({ keyword: kw, args: '', note: '' })),
    expected: str(g.meta[C.EXPECTED]),
    priority: parsePriority(str(g.meta[C.PRIORITY])),
    positiveNegative: (str(g.meta[C.POS_NEG]) as 'Positive' | 'Negative') || 'Positive',
    prerequisite: str(g.meta[C.PREREQ]),
    testData: str(g.meta[C.TEST_DATA]),
    source: 'manual',
    status: 'Pending',
  }
}

function buildE2ETC(g: RawGroup, idx: number): E2ETC {
  const allDescs = [
    str(g.meta[C.STEP_DESC]),
    ...g.extra.map(r => str(r[C.STEP_DESC])),
  ].filter(Boolean)

  const steps: E2EStep[] = allDescs
    .map((desc, i) => parseE2EStep(desc, i + 1))
    .filter((s): s is E2EStep => s !== null)

  const { id, title } = splitNameId(str(g.meta[C.NAME]), 'E2E', idx)

  return {
    id,
    type: 'E2E',
    title,
    flow: str(g.meta[C.TC_DESC]) || str(g.meta[C.SCENARIO]),
    steps,
    priority: parsePriority(str(g.meta[C.PRIORITY])),
    source: 'manual',
    status: 'Pending',
  }
}

function buildAPITC(g: RawGroup, idx: number): APITC | null {
  const allDescs = [
    str(g.meta[C.STEP_DESC]),
    ...g.extra.map(r => str(r[C.STEP_DESC])),
  ].filter(Boolean)

  const parsed = allDescs.map(d => parseApiStep(d)).filter((p): p is NonNullable<typeof p> => p !== null)
  if (parsed.length === 0) return null

  const first = parsed[0]
  const { id } = splitNameId(str(g.meta[C.NAME]), 'API', idx)

  return {
    id,
    type: 'API',
    method: first.method as APITC['method'],
    endpoint: first.endpoint,
    body: {},
    assertions: parsed.map(p => p.assertion),
    priority: parsePriority(str(g.meta[C.PRIORITY])),
    source: 'manual',
    status: 'Pending',
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ImportResult {
  tcs: TC[]
  warnings: string[]
}

export async function importTCsFromXlsx(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { tcs: [], warnings: ['Excel file has no sheets'] }

  const ws = workbook.Sheets[sheetName]
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  // Rows 0 and 1 are Zephyr headers — skip them
  const dataRows = allRows.slice(2).filter(row => (row as unknown[]).some(c => String(c ?? '').trim()))

  const groups = groupRows(dataRows as unknown[][])
  const tcs: TC[] = []
  const warnings: string[] = []

  groups.forEach((g, idx) => {
    const firstDesc = str(g.meta[C.STEP_DESC])
    const type = firstDesc ? detectType(firstDesc) : 'Standard'

    try {
      if (type === 'API') {
        const tc = buildAPITC(g, idx)
        if (tc) tcs.push(tc)
        else warnings.push(`Row ${idx + 3}: could not parse API assertions — skipped`)
      } else if (type === 'E2E') {
        tcs.push(buildE2ETC(g, idx))
      } else {
        tcs.push(buildStandardTC(g, idx))
      }
    } catch (e) {
      warnings.push(`Row ${idx + 3}: ${e instanceof Error ? e.message : 'parse error'} — skipped`)
    }
  })

  return { tcs, warnings }
}
