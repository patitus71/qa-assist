// lib/parse-tcm.ts
// Parse a TCM matrix .xlsx file into groups + existing TC list.
// Format: row 2 = group headers (may be merged), row 3 = sub-values, row 4+ = TC rows.

import * as XLSX from 'xlsx-js-style'

export interface TCMGroupParsed {
  name: string
  values: string[]       // sub-values from row 3
  colStart: number       // 0-indexed column (inclusive)
  colEnd: number
}

export interface TCMExistingTC {
  title: string
  combinations: Record<string, string[]>  // groupName → ticked values
}

export interface ParsedTCM {
  groups: TCMGroupParsed[]
  existingTCs: TCMExistingTC[]
  totalTCCount: number
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

  // sheet_to_json with header:1 gives rows as unknown[][] (each row is an array)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  if (rows.length < 3) return { groups: [], existingTCs: [], totalTCCount: 0 }

  // Determine row indices based on data shape:
  // Row 0 might be a "Test Case" header row → groups start at row 1
  // OR row 0 is already the groups row
  // We detect by checking if row[0][0] looks like a label vs a group name
  const firstCellR0 = str(rows[0]?.[0])
  const hasHeaderRow = firstCellR0.toLowerCase().includes('test') || firstCellR0.toLowerCase().includes('no.') || firstCellR0 === ''

  const groupRowIdx = hasHeaderRow ? 1 : 0
  const valueRowIdx = groupRowIdx + 1
  const tcStartIdx  = valueRowIdx + 1

  const groupRow = (rows[groupRowIdx] ?? []) as unknown[]
  const valueRow = (rows[valueRowIdx] ?? []) as unknown[]
  const colCount  = Math.max(groupRow.length, valueRow.length)

  // Resolve merged cells in groupRow → map each col to its group name
  const merges: XLSX.Range[] = (ws['!merges'] ?? []) as XLSX.Range[]

  // colToGroup[c] = group name that "owns" column c
  const colToGroup = new Map<number, string>()
  // colIsMergeStart[c] = true if this column starts a merged-cell group
  const mergeStartCols = new Set<number>()

  for (const merge of merges) {
    if (merge.s.r === groupRowIdx && merge.s.c > 0) {
      const name = str(groupRow[merge.s.c])
      if (!name) continue
      mergeStartCols.add(merge.s.c)
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        colToGroup.set(c, name)
      }
    }
  }

  // Non-merged cells with content in groupRow are single-column groups
  for (let c = 1; c < colCount; c++) {
    if (!colToGroup.has(c)) {
      const v = str(groupRow[c])
      if (v) {
        colToGroup.set(c, v)
        mergeStartCols.add(c)
      }
    }
  }

  // Build ordered group list
  const groups: TCMGroupParsed[] = []
  for (let c = 1; c < colCount; c++) {
    if (mergeStartCols.has(c)) {
      groups.push({ name: colToGroup.get(c) ?? '', values: [], colStart: c, colEnd: c })
    }
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && c >= lastGroup.colStart) {
      lastGroup.colEnd = c
      const val = str(valueRow[c])
      if (val && !lastGroup.values.includes(val)) {
        lastGroup.values.push(val)
      }
    }
  }

  // Parse TC rows
  const existingTCs: TCMExistingTC[] = []
  for (let r = tcStartIdx; r < rows.length; r++) {
    const row = rows[r] ?? []
    const title = str(row[0])
    if (!title) continue

    const combinations: Record<string, string[]> = {}
    for (const group of groups) {
      combinations[group.name] = []
      for (let c = group.colStart; c <= group.colEnd; c++) {
        if (isTicked(row[c])) {
          const val = str(valueRow[c])
          if (val) combinations[group.name].push(val)
        }
      }
    }
    existingTCs.push({ title, combinations })
  }

  return {
    groups: groups.filter(g => g.name),
    existingTCs,
    totalTCCount: existingTCs.length,
  }
}
