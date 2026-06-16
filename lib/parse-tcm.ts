// lib/parse-tcm.ts
// Robust parser for banking-style TCM .xlsx files.
// Handles 1-6 banner/header rows, merged group cells, and section dividers.

import * as XLSX from 'xlsx-js-style'

export interface TCMGroupParsed {
  name: string
  values: string[]       // ordered sub-values, one per condition column
  colStart: number       // 0-indexed column (inclusive)
  colEnd: number
}

export interface TCMExistingTC {
  title: string
  combinations: Record<string, string[]>  // groupName → ticked values
  sectionLabel?: string                   // set if row is a section divider, not a real TC
}

export interface ParsedTCM {
  groups: TCMGroupParsed[]
  existingTCs: TCMExistingTC[]
  totalTCCount: number     // count of real TCs (excludes section dividers)
  hasExistingTCs: boolean
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function isTicked(val: unknown): boolean {
  const s = str(val).toLowerCase()
  return ['✓', '✔', 'x', '●', '•', '1', 'true', 'yes', '☑', 'v', 'ok', 'check'].includes(s)
}

export async function parseTCM(file: File): Promise<ParsedTCM> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]

  // Step 1: read raw grid — use null for empty cells
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]

  if (raw.length < 2) return { groups: [], existingTCs: [], totalTCCount: 0, hasExistingTCs: false }

  const maxCols = Math.max(...raw.map(r => r.length), 0)

  // Normalise to a string-or-null 2D grid, padded to maxCols
  const grid: (string | null)[][] = raw.map(r => {
    const row: (string | null)[] = []
    for (let c = 0; c < maxCols; c++) {
      const v = r[c]
      row.push(v === null || v === undefined ? null : (String(v).trim() || null))
    }
    return row
  })

  // Step 2: propagate merged cells — fill every cell in each merge with the top-left value
  for (const merge of (ws['!merges'] ?? []) as XLSX.Range[]) {
    const topLeft = grid[merge.s.r]?.[merge.s.c] ?? null
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      if (!grid[r]) continue
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue
        grid[r][c] = topLeft
      }
    }
  }

  // Step 3: find labelRowIdx — first row (within first 10) where col 0-4 has "No." or "No"
  let labelRowIdx = -1
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = grid[r]
    for (let c = 0; c < Math.min(5, row.length); c++) {
      if (/^no\.?$/i.test(str(row[c]))) {
        labelRowIdx = r
        break
      }
    }
    if (labelRowIdx >= 0) break
  }
  if (labelRowIdx < 0) {
    throw new Error('Cannot find "No." column in the first 10 rows. Ensure the file has a "No." header cell.')
  }

  // Step 4: locate key columns from the label row
  const labelRow = grid[labelRowIdx]
  let tcNumberCol = -1, tcTitleCol = -1, expectedCol = -1, remarkCol = -1
  for (let c = 0; c < labelRow.length; c++) {
    const s = str(labelRow[c]).toLowerCase()
    if (!s) continue
    if (tcNumberCol < 0 && /^no\.?$/.test(s)) { tcNumberCol = c; continue }
    if (tcTitleCol < 0 && /test.?case|test.?scenario|scenario|tc.?name|title|description/i.test(s)) { tcTitleCol = c; continue }
    if (expectedCol < 0 && /expected|pass.?criteria|result/i.test(s)) { expectedCol = c; continue }
    if (remarkCol < 0 && /remark|note|comment/i.test(s)) { remarkCol = c; continue }
  }

  if (tcTitleCol < 0) {
    const cols = labelRow
      .map((v, i) => (str(v) ? `[${i}] ${str(v)}` : null))
      .filter(Boolean)
      .join(', ')
    throw new Error(`Cannot find test case title column. Columns found: ${cols}`)
  }

  // Step 5: condition column range
  const condStartCol = tcTitleCol + 1
  const condEndCol = (expectedCol >= 0 ? expectedCol : remarkCol >= 0 ? remarkCol : labelRow.length) - 1

  if (condEndCol < condStartCol) {
    return { groups: [], existingTCs: [], totalTCCount: 0, hasExistingTCs: false }
  }

  // Step 6: find first data row (tcNumberCol is a positive integer)
  let dataStartRow = -1
  for (let r = labelRowIdx + 1; r < grid.length; r++) {
    const cell = str(grid[r]?.[tcNumberCol] ?? null)
    if (/^\d+$/.test(cell) && parseInt(cell, 10) > 0) {
      dataStartRow = r
      break
    }
  }
  if (dataStartRow < 0) {
    return { groups: [], existingTCs: [], totalTCCount: 0, hasExistingTCs: false }
  }

  const lastHeaderRow = dataStartRow - 1

  // Step 7: build condition groups
  // For each condition column:
  //   - value name  = bottom-most non-null cell in rows 0..lastHeaderRow
  //   - group name  = first cell above the value row that differs from the value name
  const groups: TCMGroupParsed[] = []

  for (let c = condStartCol; c <= condEndCol; c++) {
    // Find value name
    let valueName: string | null = null
    let valueRowR = -1
    for (let r = lastHeaderRow; r >= 0; r--) {
      const v = grid[r]?.[c] ?? null
      if (v) { valueName = v; valueRowR = r; break }
    }
    if (!valueName) continue

    // Find group name (a different cell above the value row)
    let groupName: string | null = null
    for (let r = valueRowR - 1; r >= 0; r--) {
      const v = grid[r]?.[c] ?? null
      if (v && v !== valueName) { groupName = v; break }
    }
    if (!groupName) groupName = valueName   // flat column: value is its own group

    const last = groups[groups.length - 1]
    if (last && last.name === groupName) {
      last.colEnd = c
      if (!last.values.includes(valueName)) last.values.push(valueName)
    } else {
      groups.push({ name: groupName, values: [valueName], colStart: c, colEnd: c })
    }
  }

  // Step 8: parse TC rows
  const existingTCs: TCMExistingTC[] = []

  for (let r = dataStartRow; r < grid.length; r++) {
    const row = grid[r]
    if (!row || row.every(c => c === null)) continue

    const tcNumStr = str(row[tcNumberCol])

    // Non-numeric or zero → section divider row
    if (!/^\d+$/.test(tcNumStr) || parseInt(tcNumStr, 10) <= 0) {
      const label = row.map(v => str(v)).find(v => v) ?? ''
      if (label) existingTCs.push({ title: '', combinations: {}, sectionLabel: label })
      continue
    }

    const title = str(row[tcTitleCol])
    if (!title) continue

    const combinations: Record<string, string[]> = {}
    for (const g of groups) {
      combinations[g.name] = []
      for (let c = g.colStart; c <= g.colEnd; c++) {
        if (isTicked(row[c])) {
          const v = g.values[c - g.colStart]
          if (v) combinations[g.name].push(v)
        }
      }
    }

    existingTCs.push({ title, combinations })
  }

  const realTCs = existingTCs.filter(tc => !tc.sectionLabel)

  return {
    groups: groups.filter(g => g.name),
    existingTCs,
    totalTCCount: realTCs.length,
    hasExistingTCs: realTCs.length > 0,
  }
}
