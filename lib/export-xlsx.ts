// lib/export-xlsx.ts
import * as XLSX from 'xlsx-js-style'
import type { TC, StandardTC, E2ETC, TCMGroup } from './types'

export interface XlsxMeta {
  workStream: string
  release: string
  squad: string
  sprintId: string
  createdBy: string
  labels: string[]
  components: string
  epicLink: string
  linkType: string
  issueKey: string
}

const EMPTY_META: XlsxMeta = {
  workStream: '', release: '', squad: '', sprintId: '',
  createdBy: '', labels: [], components: '',
  epicLink: '', linkType: '', issueKey: '',
}

// ── Style constants ────────────────────────────────────────────────────────────

const S = {
  // Zephyr required header (blue)
  zephyrRequired: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: '1E40AF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  // Zephyr non-required header (gray)
  zephyrOptional: {
    font: { bold: true, color: { rgb: '374151' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'E8E8EF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  // Zephyr key-row (field names, row 2)
  zephyrKey: {
    font: { italic: true, color: { rgb: '6B6B75' }, sz: 8 },
    fill: { patternType: 'solid', fgColor: { rgb: 'F4F4F6' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  // TC-level merged data cell (even TCs — light blue)
  tcCell: {
    font: { sz: 9, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  },
  // TC-level merged data cell (odd TCs — light slate)
  tcCellAlt: {
    font: { sz: 9, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  },
  // Step number cell
  stepNo: {
    font: { bold: true, sz: 9, color: { rgb: '374151' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFF' } },
    alignment: { horizontal: 'center', vertical: 'top' },
  },
  // Step description / expected result cell
  stepText: {
    font: { sz: 9, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  },
  // TCM title banner
  tcmTitle: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
    fill: { patternType: 'solid', fgColor: { rgb: '1A56DB' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  // TCM group name header (medium blue)
  tcmGroup: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  // TCM fixed column header (dark gray)
  tcmFixed: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: '4A4A50' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  // TCM value sub-header
  tcmValue: {
    font: { bold: false, color: { rgb: '1E3A8A' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  // TCM checkbox cell (x mark — condition applies)
  tcmX: {
    font: { bold: true, color: { rgb: '92400E' }, sz: 10 },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEF08A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  // Status cells
  statusPass: {
    font: { bold: true, color: { rgb: '065F46' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'D1FAE5' } },
    alignment: { horizontal: 'center' },
  },
  statusFail: {
    font: { bold: true, color: { rgb: '991B1B' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center' },
  },
  statusBlocked: {
    font: { bold: true, color: { rgb: '92400E' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'center' },
  },
  statusPending: {
    font: { color: { rgb: '6B6B75' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'F4F4F6' } },
    alignment: { horizontal: 'center' },
  },
  // Summary row
  summary: {
    font: { bold: true, color: { rgb: '1A1A1C' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'E8E8EF' } },
  },
} as const

function sc(v: string | number, s: object): XLSX.CellObject {
  return { v, t: typeof v === 'number' ? 'n' : 's', s } as XLSX.CellObject
}

function cell(v: string | number, t: XLSX.ExcelDataType = 's'): XLSX.CellObject {
  return { v, t } as XLSX.CellObject
}

function enc(r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c })
}

function autoWidth(numCols: number, overrides: Record<number, number> = {}): XLSX.ColInfo[] {
  return Array.from({ length: numCols }, (_, i) => ({ wch: overrides[i] ?? 14 }))
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function zephyrPriority(p: string): string {
  return p === 'Med' ? 'Medium' : p
}

// ── Zephyr import format ───────────────────────────────────────────────────────

const ZEPHYR_ROW1 = [
  'Test Case Name*', 'Work Stream*', 'Sprint ID', 'Release*', 'Squad*',
  'Labels', 'Components', 'Test Scenario Description', 'Test Case Description',
  'Priority*', 'Positive/Negative', 'Prerequisite', 'Test data',
  'Test Step No', 'Test Step Description', 'Expected Result',
  'Automation Status', 'Epic (EN)', 'Relates To', 'Issues Key To Link', 'Created by',
]

const ZEPHYR_ROW2 = [
  'Name', 'Squad_Work Stream_OB', 'Sprint', 'Target Release_OB', 'Squad_OB',
  'Label', 'Components', 'Scenario', 'Description',
  'Priority', 'Test Case Type', 'Comment', 'Test data',
  'Step No', 'Steps', 'Results',
  'Automation Status', 'Epic Link', 'Link Type', 'Link', 'Reporter',
]

// Required column indices (0-based)
const REQUIRED_COLS = new Set([0, 1, 3, 9])

// TC_COLS_END: last 0-based index of TC-level columns before step columns
const TC_COLS_END = 12   // cols 0-12 are TC-level (13 columns)
const STEP_COLS_START = 13
const TRAIL_COLS_START = 16
const TRAIL_COLS_END = 20

interface TCStepRow {
  no: string
  desc: string
  expected: string
}

interface TCBuildData {
  tcCols: string[]       // 13 values for cols 0-12
  trailCols: string[]    // 5 values for cols 16-20
  steps: TCStepRow[]
}

function buildTCStepData(tc: TC, meta: XlsxMeta): TCBuildData {
  const labelsStr = meta.labels.length > 0 ? meta.labels.join(', ')
    : tc.aiGenerated ? 'AI-generated' : ''
  if (tc.type === 'Standard') {
    const tcName = `${tc.id}: ${tc.title}`
    const allSteps = tc.stepItems?.length
      ? tc.stepItems.map(s => `${s.keyword}${s.args ? '    ' + s.args : ''}${s.note ? '    # ' + s.note : ''}`)
      : tc.steps.split('\n').filter(Boolean)
    const stepLines = allSteps.length > 0 ? allSteps : ['']
    const trailCols = [
      tc.automationStatus ?? 'Manual',
      tc.exportMeta?.epicLink ?? meta.epicLink,
      meta.linkType,
      tc.exportMeta?.issueKey ?? meta.issueKey,
      tc.exportMeta?.createdBy ?? meta.createdBy,
    ]
    return {
      tcCols: [tcName,
               tc.exportMeta?.workStream ?? meta.workStream,
               tc.exportMeta?.sprintId   ?? meta.sprintId,
               tc.exportMeta?.release    ?? meta.release,
               tc.exportMeta?.squad      ?? meta.squad,
               tc.exportMeta?.labels     ?? labelsStr,
               tc.exportMeta?.component  ?? meta.components,
               tc.scenario ?? tc.title,
               tc.tcDescription ?? '',
               zephyrPriority(tc.priority), tc.positiveNegative ?? 'Positive',
               tc.prerequisite ?? '', tc.testData ?? ''],
      trailCols,
      steps: stepLines.map((line, i) => ({
        no: String(i + 1),
        desc: line,
        expected: tc.standardSteps?.[i]?.expected ?? '',
      })),
    }
  }

  // trailing cols for E2E / API
  const trailCols = ['Manual', meta.epicLink, meta.linkType, meta.issueKey, meta.createdBy]

  if (tc.type === 'E2E') {
    const tcName = `${tc.id}: ${tc.title}`
    const rawSteps = tc.steps.length > 0 ? tc.steps
      : [{ num: 1, keyword: '(no steps)', args: '', type: 'Action' as const, note: '' }]
    return {
      tcCols: [tcName, meta.workStream, meta.sprintId, meta.release, meta.squad,
               labelsStr, meta.components, tc.title, tc.flow,
               zephyrPriority(tc.priority), 'Positive', '', ''],
      trailCols,
      steps: rawSteps.map(s => ({
        no: String(s.num),
        desc: `[${s.type}] ${s.keyword}${s.args ? ' ' + s.args : ''}${s.note ? ' # ' + s.note : ''}`,
        expected: '',
      })),
    }
  }

  // API
  const tcName = `${tc.id}: ${tc.method} ${tc.endpoint}`
  const assertions = tc.assertions.length > 0 ? tc.assertions
    : [{ type: 'status' as const, operator: 'equals' as const, expected: '200' }]
  return {
    tcCols: [tcName, meta.workStream, meta.sprintId, meta.release, meta.squad,
             labelsStr, meta.components, tcName, '',
             zephyrPriority(tc.priority), 'Positive', '', ''],
    trailCols,
    steps: assertions.map((a, i) => ({
      no: String(i + 1),
      desc: `${tc.method} ${tc.endpoint} — assert ${a.type} ${a.operator} ${a.expected}`,
      expected: `${a.type} ${a.operator} ${a.expected}`,
    })),
  }
}

export function exportTCXlsx(tcs: TC[], filename = 'test-cases.xlsx', meta: XlsxMeta = EMPTY_META) {
  const ws: XLSX.WorkSheet = {}
  const numCols = ZEPHYR_ROW1.length
  const merges: XLSX.Range[] = []

  // Row 0: display labels with color coding
  ZEPHYR_ROW1.forEach((header, c) => {
    ws[enc(0, c)] = sc(header, REQUIRED_COLS.has(c) ? S.zephyrRequired : S.zephyrOptional)
  })

  // Row 1: Zephyr field keys
  ZEPHYR_ROW2.forEach((key, c) => {
    ws[enc(1, c)] = sc(key, S.zephyrKey)
  })

  // Data rows with vertical merges for multi-step TCs
  let r = 2
  for (let ti = 0; ti < tcs.length; ti++) {
    const data = buildTCStepData(tcs[ti], meta)
    const nSteps = data.steps.length
    const startRow = r
    // Alternate background style between even/odd TCs for readability
    const tcStyle = ti % 2 === 0 ? S.tcCell : S.tcCellAlt

    // Write TC-level columns (0-12) only on the first step row; merged rows below stay styled-empty
    data.tcCols.forEach((v, c) => { ws[enc(startRow, c)] = sc(v, tcStyle) })

    // Write trailing TC-level columns (16-20) only on the first step row
    data.trailCols.forEach((v, i) => { ws[enc(startRow, TRAIL_COLS_START + i)] = sc(v, tcStyle) })

    // Write each step row
    data.steps.forEach((step, si) => {
      const row = startRow + si
      if (si > 0) {
        // Fill TC/trail cols with styled-empty cells so the merged area has a background
        for (let c = 0; c <= TC_COLS_END; c++) ws[enc(row, c)] = sc('', tcStyle)
        for (let c = TRAIL_COLS_START; c <= TRAIL_COLS_END; c++) ws[enc(row, c)] = sc('', tcStyle)
      }
      ws[enc(row, STEP_COLS_START)]     = sc(step.no, S.stepNo)
      ws[enc(row, STEP_COLS_START + 1)] = sc(step.desc, S.stepText)
      ws[enc(row, STEP_COLS_START + 2)] = sc(step.expected, S.stepText)
    })

    // Register vertical merges for multi-step TCs
    if (nSteps > 1) {
      merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow + nSteps - 1, c: TC_COLS_END } })
      merges.push({ s: { r: startRow, c: TRAIL_COLS_START }, e: { r: startRow + nSteps - 1, c: TRAIL_COLS_END } })
    }

    r += nSteps
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: numCols - 1 } })
  ws['!merges'] = merges
  ws['!freeze'] = { xSplit: 0, ySplit: 2 } as XLSX.WSKeys
  ws['!cols'] = [
    { wch: 36 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 28 },
    { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
    { wch: 8 }, { wch: 36 }, { wch: 28 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Test Cases')
  XLSX.writeFile(wb, filename)
}

// ── TCM .xlsx with custom groups ───────────────────────────────────────────────

const FIXED_SUFFIX = [
  'Positive/Negative', 'Priority', 'Expect result',
  'Status', 'Actual Result', 'Bug ID', 'Run Date',
]

function statusStyle(s: string): object | undefined {
  if (s === 'Pass') return S.statusPass
  if (s === 'Fail') return S.statusFail
  if (s === 'Blocked') return S.statusBlocked
  if (s === 'Pending') return S.statusPending
  return undefined
}

export function exportTCMXlsx(
  tcs: TC[],
  filename = 'tcm-report.xlsx',
  groups: Pick<TCMGroup, 'name' | 'values'>[] = []
) {
  const today = new Date().toLocaleDateString('en-GB')

  // Calculate column layout
  const activeGroups = groups.filter(g => g.values.length > 0)
  type GrRange = { name: string; values: string[]; start: number; end: number }
  const grRanges: GrRange[] = []
  let col = 2 // cols 0=NO, 1=Scenario, then groups
  for (const g of activeGroups) {
    grRanges.push({ name: g.name, values: g.values, start: col, end: col + g.values.length - 1 })
    col += g.values.length
  }
  const fixedStart = col
  const totalCols = fixedStart + FIXED_SUFFIX.length
  const merges: XLSX.Range[] = []
  const ws: XLSX.WorkSheet = {}

  // ── Row 0: title banner ──────────────────────────────────────────────────────
  ws[enc(0, 0)] = sc(`QA Assist — Test Case Matrix  ·  ${today}  ·  ${tcs.length} TC`, S.tcmTitle)
  for (let c = 1; c < totalCols; c++) ws[enc(0, c)] = sc('', S.tcmTitle)
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } })

  // ── Row 1: column headers ────────────────────────────────────────────────────
  ws[enc(1, 0)] = sc('NO', S.tcmFixed)
  ws[enc(1, 1)] = sc('Scenario', S.tcmFixed)
  merges.push({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }) // NO spans rows 1-2
  merges.push({ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }) // Scenario spans rows 1-2

  for (const gr of grRanges) {
    ws[enc(1, gr.start)] = sc(gr.name, S.tcmGroup)
    for (let c = gr.start + 1; c <= gr.end; c++) ws[enc(1, c)] = sc('', S.tcmGroup)
    if (gr.start < gr.end) merges.push({ s: { r: 1, c: gr.start }, e: { r: 1, c: gr.end } })
  }

  FIXED_SUFFIX.forEach((label, i) => {
    ws[enc(1, fixedStart + i)] = sc(label, S.tcmFixed)
    merges.push({ s: { r: 1, c: fixedStart + i }, e: { r: 2, c: fixedStart + i } })
  })

  // ── Row 2: value sub-headers ─────────────────────────────────────────────────
  ws[enc(2, 0)] = sc('', S.tcmValue)
  ws[enc(2, 1)] = sc('', S.tcmValue)

  for (const gr of grRanges) {
    gr.values.forEach((val, vi) => {
      ws[enc(2, gr.start + vi)] = sc(val, S.tcmValue)
    })
  }

  FIXED_SUFFIX.forEach((_, i) => {
    ws[enc(2, fixedStart + i)] = sc('', S.tcmValue)
  })

  // ── Rows 3+: TC data ─────────────────────────────────────────────────────────
  const passCount = tcs.filter(t => t.status === 'Pass').length
  const failCount = tcs.filter(t => t.status === 'Fail').length
  const blockedCount = tcs.filter(t => t.status === 'Blocked').length
  const pendingCount = tcs.filter(t => t.status === 'Pending').length
  const skipCount = tcs.filter(t => t.status === 'Skip').length
  const executed = passCount + failCount + blockedCount + skipCount
  const passRate = executed > 0 ? Math.round((passCount / executed) * 100) : 0

  tcs.forEach((tc, ti) => {
    const r = ti + 3
    const title = tc.type === 'Standard' ? tc.title
      : tc.type === 'E2E' ? tc.title
      : `${tc.method} ${tc.endpoint}`
    const posNeg = tc.type === 'Standard' ? (tc.positiveNegative ?? 'Positive') : 'Positive'
    const expected = tc.type === 'Standard' ? tc.expected
      : tc.type === 'E2E' ? tc.flow
      : tc.assertions.map(a => `${a.type} ${a.operator} ${a.expected}`).join('; ')
    const actual = (tc as StandardTC | E2ETC).actualResult ?? ''

    ws[enc(r, 0)] = cell(ti + 1, 'n')
    ws[enc(r, 1)] = cell(title)

    // Group columns — empty by default, user fills in Excel
    for (const gr of grRanges) {
      gr.values.forEach((_, vi) => { ws[enc(r, gr.start + vi)] = cell('') })
    }

    // Fixed suffix
    const ss = statusStyle(tc.status)
    const fixedVals = [posNeg, zephyrPriority(tc.priority), expected, tc.status, actual, tc.bugTicket ?? '', tc.runDate ?? '']
    fixedVals.forEach((v, i) => {
      const c = fixedStart + i
      // Status column (index 3) gets color
      ws[enc(r, c)] = (i === 3 && ss) ? sc(String(v), ss) : cell(String(v))
    })
  })

  // ── Summary row ──────────────────────────────────────────────────────────────
  const summaryRow = tcs.length + 3
  ws[enc(summaryRow, 0)] = sc(`${tcs.length} TC`, S.summary)
  ws[enc(summaryRow, 1)] = sc(`Pass ${passCount}  ·  Fail ${failCount}  ·  Blocked ${blockedCount}  ·  Skip ${skipCount}  ·  Pending ${pendingCount}  ·  Pass Rate ${passRate}%`, S.summary)
  for (let c = 2; c < totalCols; c++) ws[enc(summaryRow, c)] = sc('', S.summary)
  merges.push({ s: { r: summaryRow, c: 1 }, e: { r: summaryRow, c: totalCols - 1 } })

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: summaryRow, c: totalCols - 1 } })
  ws['!merges'] = merges
  ws['!rows'] = [{ hpt: 20 }, { hpt: 24 }, { hpt: 18 }]
  ws['!cols'] = autoWidth(totalCols, { 0: 6, 1: 40, ...Object.fromEntries(Array.from({ length: fixedStart - 2 }, (_, i) => [i + 2, 10])), [fixedStart]: 16, [fixedStart + 1]: 10, [fixedStart + 2]: 30, [fixedStart + 3]: 12, [fixedStart + 4]: 20, [fixedStart + 5]: 12, [fixedStart + 6]: 12 })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'TCM')
  XLSX.writeFile(wb, filename)
}
