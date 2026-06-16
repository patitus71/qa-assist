// lib/import-tcm.ts
// Smart parser for complex banking TCM Excel files.
// Handles: 3-6 header rows, merged cells, section header rows, 30-50+ columns.

import * as XLSX from 'xlsx-js-style'
import type { TCMGroup, TCMRow, TCMState, TCMImportMeta } from './types'

export interface TCMImportResult {
  state: TCMState
  meta: TCMImportMeta & { totalDataRows: number }
  warnings: string[]
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function isTicked(val: unknown): boolean {
  const s = str(val).toLowerCase()
  return ['✓', '✔', 'x', '●', '•', '1', 'true', 'yes', '☑', 'v', 'ok', 'check'].includes(s)
}

// Returns true if col A looks like a TC data row has started
function looksLikeDataRow(val: unknown): boolean {
  const s = str(val)
  if (!s) return false
  if (/^\d+$/.test(s)) return true
  if (/^(ATC|TC|TC-E2E|E2E|AT)-?\d+/i.test(s)) return true
  return false
}

// A section header is a row where col A has content but cols 1+ are almost all empty
function looksLikeSectionHeader(row: unknown[], colCount: number): boolean {
  if (!str(row[0])) return false
  let nonEmpty = 0
  const checkCols = Math.min(colCount, 20)
  for (let c = 1; c < checkCols; c++) {
    if (str(row[c])) nonEmpty++
  }
  return nonEmpty / Math.max(checkCols - 1, 1) < 0.2
}

// Pick best sheet — prefer sheets with the most rows, skip summary/template sheets
function pickSheet(wb: XLSX.WorkBook): string {
  const skip = /testcase|test\s*suite|summary|template|cover|sheet/i
  const candidates = wb.SheetNames.filter(n => !skip.test(n))
  const pool = candidates.length > 0 ? candidates : wb.SheetNames

  let best = pool[0]
  let bestRows = 0
  for (const name of pool) {
    const ws = wb.Sheets[name]
    const ref = ws['!ref']
    if (!ref) continue
    const range = XLSX.utils.decode_range(ref)
    if (range.e.r > bestRows) {
      bestRows = range.e.r
      best = name
    }
  }
  return best
}

// Expand merged cells: fill each cell in a merge range with the merge's top-left value
function expandMerges(rows: unknown[][], merges: XLSX.Range[]): unknown[][] {
  const expanded = rows.map(r => [...(r as unknown[])])
  for (const m of merges) {
    const topLeft = expanded[m.s.r]?.[m.s.c]
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!expanded[r]) expanded[r] = []
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue
        if (!str(expanded[r]?.[c])) {
          expanded[r][c] = topLeft
        }
      }
    }
  }
  return expanded
}

// Detect header row count — scan until we find a row where col A looks like a TC ID
function detectHeaderRows(rows: unknown[][]): number {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    if (looksLikeDataRow(rows[r]?.[0])) return r
  }
  return 2 // fallback: classic 2-row header
}

// Detect which column holds the scenario text.
// Usually col 0 (TC number) or col 1 (description after a numeric ID).
// We check: if col 0 is all-numeric in data rows and col 1 has text content, use col 1.
function detectScenarioCol(rows: unknown[][], headerRows: number, sampleSize = 10): number {
  let col0AllNumeric = true
  let col1HasText = false
  const limit = Math.min(rows.length, headerRows + sampleSize)
  for (let r = headerRows; r < limit; r++) {
    const v0 = str(rows[r]?.[0])
    if (v0 && !/^\d+$/.test(v0) && !looksLikeDataRow(rows[r]?.[0])) {
      col0AllNumeric = false
    }
    const v1 = str(rows[r]?.[1])
    if (v1 && v1.length > 3 && !isTicked(v1)) col1HasText = true
  }
  return (col0AllNumeric && col1HasText) ? 1 : 0
}

let _idCounter = 0
function nextId(prefix: string) { return `${prefix}-${++_idCounter}` }

export async function importTCM(file: File): Promise<TCMImportResult> {
  const warnings: string[] = []

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const sheetName = pickSheet(wb)
  const ws = wb.Sheets[sheetName]

  if (wb.SheetNames.length > 1 && sheetName !== wb.SheetNames[0]) {
    warnings.push(`Using sheet "${sheetName}" (${wb.SheetNames.length} sheets found — import is single-sheet).`)
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const merges: XLSX.Range[] = (ws['!merges'] ?? []) as XLSX.Range[]
  const rows = expandMerges(rawRows, merges)

  if (rows.length < 2) {
    return {
      state: { groups: [], rows: [], type: 'standard' },
      meta: { fileName: file.name, sheetName, headerRows: 0, totalColumns: 0, totalDataRows: 0 },
      warnings: ['Sheet appears empty or too small to parse.'],
    }
  }

  const headerRows = detectHeaderRows(rows)
  if (headerRows === 0) {
    warnings.push('Could not detect header rows — treating row 0 as the only header.')
  }

  // Total column count from header rows
  let totalCols = 0
  for (let r = 0; r < Math.max(headerRows, 1); r++) {
    totalCols = Math.max(totalCols, rows[r]?.length ?? 0)
  }

  const scenarioCol = detectScenarioCol(rows, headerRows)
  const groupStartCol = scenarioCol + 1

  // Build column-to-group-path map.
  // For each column c >= groupStartCol, collect non-empty header-row values (top-down).
  // Group name  = all-but-last joined with ' · '
  // Value label = last component
  interface ColInfo { groupName: string; value: string }
  const colMap = new Map<number, ColInfo>()

  for (let c = groupStartCol; c < totalCols; c++) {
    const path: string[] = []
    for (let r = 0; r < headerRows; r++) {
      const v = str(rows[r]?.[c])
      if (v) path.push(v)
    }
    if (path.length === 0) continue
    const value = path[path.length - 1]
    const groupParts = path.slice(0, -1)
    const groupName = groupParts.length > 0 ? groupParts.join(' · ') : value
    colMap.set(c, { groupName, value })
  }

  // Build ordered TCMGroup list
  const groupIndex = new Map<string, TCMGroup>()
  const groupOrder: string[] = []

  for (const info of colMap.values()) {
    if (!groupIndex.has(info.groupName)) {
      groupIndex.set(info.groupName, {
        id: nextId('g'),
        name: info.groupName,
        values: [],
      })
      groupOrder.push(info.groupName)
    }
    const g = groupIndex.get(info.groupName)!
    if (!g.values.includes(info.value)) {
      g.values.push(info.value)
    }
  }

  const groups: TCMGroup[] = groupOrder.map(n => groupIndex.get(n)!)

  if (groups.length === 0) {
    warnings.push('No TCM columns detected — check that the file has merged-cell group headers.')
  }

  // Parse data rows
  const tcmRows: TCMRow[] = []
  let dataRowCount = 0

  for (let r = headerRows; r < rows.length; r++) {
    const row = rows[r] ?? []
    const firstCell = str(row[0])
    if (!firstCell) continue

    // Section header: non-numeric col 0 with almost-empty rest of row
    if (!looksLikeDataRow(row[0]) && looksLikeSectionHeader(row, totalCols)) {
      tcmRows.push({
        id: `section-r${r}`,
        scenario: firstCell,
        checks: {},
        posNeg: 'Positive',
        priority: 'Med',
        sectionLabel: firstCell,
      })
      continue
    }

    // Resolve scenario text
    const scenarioText = scenarioCol === 1
      ? (str(row[1]) || firstCell)
      : firstCell

    // Build check map
    const checks: Record<string, Record<string, boolean>> = {}
    for (const g of groups) {
      checks[g.name] = {}
      for (const v of g.values) checks[g.name][v] = false
    }
    for (const [c, info] of colMap) {
      if (isTicked(row[c]) && checks[info.groupName]) {
        checks[info.groupName][info.value] = true
      }
    }

    tcmRows.push({
      id: nextId('TCM-import'),
      scenario: scenarioText,
      checks,
      posNeg: 'Positive',
      priority: 'Med',
    })
    dataRowCount++
  }

  const meta: TCMImportMeta & { totalDataRows: number } = {
    fileName: file.name,
    sheetName,
    headerRows,
    totalColumns: totalCols - groupStartCol,
    totalDataRows: dataRowCount,
  }

  return {
    state: {
      groups,
      rows: tcmRows,
      type: 'standard',
      importMeta: { fileName: file.name, sheetName, headerRows, totalColumns: meta.totalColumns },
    },
    meta,
    warnings,
  }
}
