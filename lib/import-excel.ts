// lib/import-excel.ts
// Read Zephyr-format or Testcase.xlsx back into TC objects.
// Uses dynamic header detection — no hardcoded column indices.

import * as XLSX from 'xlsx-js-style'
import type { TC, StandardTC, E2ETC, APITC, E2EStep, Assertion, TCPriority, StandardStep, ExportMeta } from './types'

// ── Header aliases → canonical keys ──────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'test case name*': 'name',      'test case name': 'name',      'name': 'name',
  'work stream*':    'workStream', 'work stream':    'workStream',
  'sprint id':       'sprintId',   'sprint':         'sprintId',
  'release*':        'release',    'release':        'release',
  'squad*':          'squad',      'squad':          'squad',
  'component':       'component',  'components':     'component',
  'labels':          'labels',     'label':          'labels',
  'test scenario description': 'scenario', 'scenario': 'scenario',
  'test case description':     'tcDescription', 'description': 'tcDescription',
  'priority*':       'priority',   'priority':       'priority',
  'positive/negative': 'posNeg',   'test case type': 'posNeg',
  'prerequisite':    'prereq',     'comment':        'prereq',
  'test data':       'testData',
  'test step no':    'stepNo',     'step no':        'stepNo',     'no.': 'stepNo',
  'test step description': 'stepDesc', 'steps': 'stepDesc', 'step description': 'stepDesc',
  'expected result': 'expected',   'results': 'expected',
  'automation status': 'automationStatus',
  'epic (en)':       'epicLink',   'epic link':      'epicLink',
  'relates to':      'relatesTo',
  'issues key to link': 'issueKey', 'link': 'issueKey',
  'created by':      'createdBy',  'reporter':       'createdBy',
}

// Strings that identify a "description / sub-header" second row rather than a data row
const KNOWN_DESCRIPTIONS = new Set([
  'workstream the test case belongs to',
  'name of sprint',
  'release version',
  'squad that owns the test case',
  'component being tested',
  'labels for categorization',
  'scenario description',
  'test case description',
  'priority level',
  'positive or negative test',
  'prerequisite conditions',
  'test data required',
  'step number',
  'step description',
  'expected outcome',
  'manual or automated',
  'epic link',
  'related issue',
  'issue key to link',
  'person who created the test case',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function parsePriority(raw: string): TCPriority {
  if (raw === 'High') return 'High'
  if (raw === 'Medium' || raw === 'Med') return 'Med'
  return 'Low'
}

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

function detectType(firstDesc: string): 'Standard' | 'E2E' | 'API' {
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\/\S+\s+[—-]\s+assert\s+/i.test(firstDesc)) return 'API'
  if (/^\[(Action|Verify|Setup|DB)\]/i.test(firstDesc)) return 'E2E'
  return 'Standard'
}

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

// ── Dynamic column detection ──────────────────────────────────────────────────

interface ColMap {
  [key: string]: number   // canonical key → column index
}

function buildColMap(headerRow: unknown[]): ColMap {
  const colMap: ColMap = {}
  headerRow.forEach((cell, i) => {
    const key = HEADER_MAP[str(cell).toLowerCase()]
    if (key && !(key in colMap)) colMap[key] = i
  })
  return colMap
}

function gv(row: unknown[], col: number | undefined): string {
  if (col === undefined || col < 0) return ''
  return str(row[col])
}

// ── Row grouping ──────────────────────────────────────────────────────────────

interface RawGroup {
  meta: unknown[]
  extra: unknown[][]
}

function groupRows(rows: unknown[][], nameCol: number): RawGroup[] {
  const groups: RawGroup[] = []
  let current: RawGroup | null = null
  let prevName = ''

  for (const row of rows) {
    const name = str(row[nameCol])
    if (name && name !== prevName) {
      prevName = name
      current = { meta: row, extra: [] }
      groups.push(current)
    } else if (current) {
      current.extra.push(row)
    }
  }
  return groups
}

// ── TC builders ───────────────────────────────────────────────────────────────

function buildStandardTC(g: RawGroup, idx: number, cols: ColMap): StandardTC {
  const stepDescCol = cols.stepDesc
  const expectedCol = cols.expected

  const allSteps = [
    { desc: gv(g.meta, stepDescCol), expected: gv(g.meta, expectedCol) },
    ...g.extra.map(r => ({ desc: gv(r, stepDescCol), expected: gv(r, expectedCol) })),
  ].filter(s => s.desc)
   .map(s => ({ ...s, desc: s.desc.replace(/^\d+\.\s*/, '').trim() }))

  const rawName = gv(g.meta, cols.name)
  const { id, title } = splitNameId(rawName, 'Standard', idx)

  const standardSteps: StandardStep[] = allSteps.map((s, i) => ({
    no: i + 1,
    description: s.desc,
    expected: s.expected || undefined,
  }))

  const exportMeta: ExportMeta = {
    workStream:  gv(g.meta, cols.workStream)  || undefined,
    sprintId:    gv(g.meta, cols.sprintId)    || undefined,
    release:     gv(g.meta, cols.release)     || undefined,
    squad:       gv(g.meta, cols.squad)       || undefined,
    component:   gv(g.meta, cols.component)   || undefined,
    labels:      gv(g.meta, cols.labels)      || undefined,
    epicLink:    gv(g.meta, cols.epicLink)    || undefined,
    relatesTo:   gv(g.meta, cols.relatesTo)   || undefined,
    issueKey:    gv(g.meta, cols.issueKey)    || undefined,
    createdBy:   gv(g.meta, cols.createdBy)   || undefined,
  }
  const hasExportMeta = Object.values(exportMeta).some(Boolean)

  return {
    id,
    type: 'Standard',
    title,
    steps: allSteps.map(s => s.desc).join('\n'),
    standardSteps,
    stepItems: allSteps.map(s => ({ keyword: s.desc, args: '', note: '' })),
    expected: '',
    priority: parsePriority(gv(g.meta, cols.priority)),
    positiveNegative: (gv(g.meta, cols.posNeg) as 'Positive' | 'Negative') || 'Positive',
    prerequisite: gv(g.meta, cols.prereq) || undefined,
    testData: gv(g.meta, cols.testData) || undefined,
    scenario: gv(g.meta, cols.scenario) || undefined,
    tcDescription: gv(g.meta, cols.tcDescription) || undefined,
    automationStatus: gv(g.meta, cols.automationStatus) || undefined,
    exportMeta: hasExportMeta ? exportMeta : undefined,
    source: 'manual',
    status: 'Pending',
  }
}

function buildE2ETC(g: RawGroup, idx: number, cols: ColMap): E2ETC {
  const stepDescCol = cols.stepDesc
  const allDescs = [
    gv(g.meta, stepDescCol),
    ...g.extra.map(r => gv(r, stepDescCol)),
  ].filter(Boolean)

  const steps: E2EStep[] = allDescs
    .map((desc, i) => parseE2EStep(desc, i + 1))
    .filter((s): s is E2EStep => s !== null)

  const { id, title } = splitNameId(gv(g.meta, cols.name), 'E2E', idx)

  return {
    id,
    type: 'E2E',
    title,
    flow: gv(g.meta, cols.tcDescription) || gv(g.meta, cols.scenario) || '',
    steps,
    priority: parsePriority(gv(g.meta, cols.priority)),
    source: 'manual',
    status: 'Pending',
  }
}

function buildAPITC(g: RawGroup, idx: number, cols: ColMap): APITC | null {
  const stepDescCol = cols.stepDesc
  const allDescs = [
    gv(g.meta, stepDescCol),
    ...g.extra.map(r => gv(r, stepDescCol)),
  ].filter(Boolean)

  const parsed = allDescs.map(d => parseApiStep(d)).filter((p): p is NonNullable<typeof p> => p !== null)
  if (parsed.length === 0) return null

  const first = parsed[0]
  const { id } = splitNameId(gv(g.meta, cols.name), 'API', idx)

  return {
    id,
    type: 'API',
    method: first.method as APITC['method'],
    endpoint: first.endpoint,
    body: {},
    assertions: parsed.map(p => p.assertion),
    priority: parsePriority(gv(g.meta, cols.priority)),
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

  // Detect header rows: row 0 is always the header.
  // Row 1 is a description row if it matches known descriptions (skip it for data).
  const headerRow = allRows[0] as unknown[]
  const cols = buildColMap(headerRow)

  let dataStartIdx = 1
  if (allRows.length > 1) {
    const secondRow = allRows[1] as unknown[]
    const nameColIdx = cols.name ?? 0
    const firstCell = str(secondRow[0]).toLowerCase()
    const nameCell = str(secondRow[nameColIdx]).toLowerCase()
    // Skip row 2 if it looks like a description/sub-header row:
    // - first cell matches a known long description, OR
    // - name-column cell matches a known long description, OR
    // - name-column cell is a HEADER_MAP alias (e.g. "Name", "Scenario", "Sprint")
    if (
      KNOWN_DESCRIPTIONS.has(firstCell) ||
      KNOWN_DESCRIPTIONS.has(nameCell) ||
      nameCell in HEADER_MAP
    ) {
      dataStartIdx = 2
    }
  }

  const nameCol = cols.name ?? 0
  const dataRows = allRows.slice(dataStartIdx).filter(row =>
    (row as unknown[]).some(c => String(c ?? '').trim()),
  )

  const groups = groupRows(dataRows as unknown[][], nameCol)
  const tcs: TC[] = []
  const warnings: string[] = []

  groups.forEach((g, idx) => {
    const firstDesc = cols.stepDesc !== undefined ? gv(g.meta, cols.stepDesc) : ''
    const type = firstDesc ? detectType(firstDesc) : 'Standard'

    try {
      if (type === 'API') {
        const tc = buildAPITC(g, idx, cols)
        if (tc) tcs.push(tc)
        else warnings.push(`Row ${idx + dataStartIdx + 1}: could not parse API assertions — skipped`)
      } else if (type === 'E2E') {
        tcs.push(buildE2ETC(g, idx, cols))
      } else {
        tcs.push(buildStandardTC(g, idx, cols))
      }
    } catch (e) {
      warnings.push(`Row ${idx + dataStartIdx + 1}: ${e instanceof Error ? e.message : 'parse error'} — skipped`)
    }
  })

  return { tcs, warnings }
}
