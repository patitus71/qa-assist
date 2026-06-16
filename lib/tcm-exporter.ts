// lib/tcm-exporter.ts — Styled XLSX export for raw TCMState (browser-side + server-safe builder)
import * as XLSX from 'xlsx-js-style'
import type { TCMState } from './types'

// ── Style helpers ─────────────────────────────────────────────────────────────

function enc(r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c })
}

function sc(v: string | number, s: object): XLSX.CellObject {
  return { v, t: typeof v === 'number' ? 'n' : 's', s } as XLSX.CellObject
}

const S = {
  titleBanner: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { patternType: 'solid', fgColor: { rgb: '0F2A5C' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  groupHeader: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: '0055A4' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  fixedHeader: {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: '4A4A50' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  valueHeader: {
    font: { bold: false, color: { rgb: '1E3A8A' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'D6E4FF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  checkYes: {
    font: { bold: true, color: { rgb: '5D4A00' }, sz: 10 },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFF176' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  checkNo: {
    font: { sz: 9, color: { rgb: 'CCCCCC' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  sectionRow: {
    font: { bold: true, color: { rgb: '0F2A5C' }, sz: 9 },
    fill: { patternType: 'solid', fgColor: { rgb: 'E8EEF7' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  dataNo: {
    font: { sz: 9, color: { rgb: '6B7280' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FAFAFA' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  dataScenario: {
    font: { sz: 9, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  },
  posNegPos: {
    font: { sz: 9, color: { rgb: '065F46' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  posNegNeg: {
    font: { sz: 9, color: { rgb: '991B1B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  priorityHigh: {
    font: { bold: true, sz: 9, color: { rgb: '991B1B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  priorityMed: {
    font: { sz: 9, color: { rgb: '92400E' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  priorityLow: {
    font: { sz: 9, color: { rgb: '1E40AF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
} as const

// ── Shared workbook builder ───────────────────────────────────────────────────

export function buildTCMWorkbook(state: TCMState): XLSX.WorkBook {
  const { groups, rows } = state
  const today = new Date().toLocaleDateString('en-GB')

  // Column layout: 0=No., 1=Scenario, 2..N=group values, N+1=Pos/Neg, N+2=Priority
  type GrCol = { name: string; values: string[]; start: number; end: number }
  const grCols: GrCol[] = []
  let col = 2
  for (const g of groups) {
    if (g.values.length === 0) continue
    grCols.push({ name: g.name, values: g.values, start: col, end: col + g.values.length - 1 })
    col += g.values.length
  }
  const posNegCol = col
  const priorityCol = col + 1
  const totalCols = col + 2

  const ws: XLSX.WorkSheet = {}
  const merges: XLSX.Range[] = []

  // ── Row 0: title banner ───────────────────────────────────────────────────
  const dataRowCount = rows.filter(r => !r.sectionLabel).length
  ws[enc(0, 0)] = sc(
    `Test Case Matrix  ·  ${today}  ·  ${dataRowCount} scenarios  ·  ${groups.length} groups`,
    S.titleBanner,
  )
  for (let c = 1; c < totalCols; c++) ws[enc(0, c)] = sc('', S.titleBanner)
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } })

  // ── Row 1: column headers ─────────────────────────────────────────────────
  ws[enc(1, 0)] = sc('No.', S.fixedHeader)
  merges.push({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } })

  ws[enc(1, 1)] = sc('Test Case', S.fixedHeader)
  merges.push({ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } })

  for (const gc of grCols) {
    ws[enc(1, gc.start)] = sc(gc.name, S.groupHeader)
    for (let c = gc.start + 1; c <= gc.end; c++) ws[enc(1, c)] = sc('', S.groupHeader)
    if (gc.start < gc.end) merges.push({ s: { r: 1, c: gc.start }, e: { r: 1, c: gc.end } })
  }

  ws[enc(1, posNegCol)] = sc('Pos/Neg', S.fixedHeader)
  merges.push({ s: { r: 1, c: posNegCol }, e: { r: 2, c: posNegCol } })

  ws[enc(1, priorityCol)] = sc('Priority', S.fixedHeader)
  merges.push({ s: { r: 1, c: priorityCol }, e: { r: 2, c: priorityCol } })

  // ── Row 2: value sub-headers ──────────────────────────────────────────────
  ws[enc(2, 0)] = sc('', S.valueHeader)
  ws[enc(2, 1)] = sc('', S.valueHeader)
  for (const gc of grCols) {
    gc.values.forEach((val, vi) => { ws[enc(2, gc.start + vi)] = sc(val, S.valueHeader) })
  }
  ws[enc(2, posNegCol)] = sc('', S.valueHeader)
  ws[enc(2, priorityCol)] = sc('', S.valueHeader)

  // ── Data rows ─────────────────────────────────────────────────────────────
  let r = 3
  let tcNum = 0

  for (const row of rows) {
    if (row.sectionLabel) {
      ws[enc(r, 0)] = sc(row.sectionLabel, S.sectionRow)
      for (let c = 1; c < totalCols; c++) ws[enc(r, c)] = sc('', S.sectionRow)
      merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } })
    } else {
      tcNum++
      ws[enc(r, 0)] = sc(tcNum, S.dataNo)
      ws[enc(r, 1)] = sc(row.scenario, S.dataScenario)

      for (const gc of grCols) {
        gc.values.forEach((val, vi) => {
          const checked = row.checks[gc.name]?.[val] ?? false
          ws[enc(r, gc.start + vi)] = checked ? sc('x', S.checkYes) : sc('', S.checkNo)
        })
      }

      ws[enc(r, posNegCol)] = row.posNeg === 'Positive'
        ? sc('Positive', S.posNegPos)
        : sc('Negative', S.posNegNeg)

      const pStyle = row.priority === 'High' ? S.priorityHigh
        : row.priority === 'Med' ? S.priorityMed
        : S.priorityLow
      ws[enc(r, priorityCol)] = sc(row.priority, pStyle)
    }
    r++
  }

  // ── Sheet metadata ────────────────────────────────────────────────────────
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: totalCols - 1 } })
  ws['!merges'] = merges
  ws['!freeze'] = { xSplit: 2, ySplit: 3 } as XLSX.WSKeys
  ws['!rows'] = [{ hpt: 22 }, { hpt: 28 }, { hpt: 18 }] as XLSX.RowInfo[]

  const colWidths: XLSX.ColInfo[] = [{ wch: 5 }, { wch: 52 }]
  for (const gc of grCols) {
    for (const val of gc.values) colWidths.push({ wch: Math.max(7, Math.min(14, val.length + 2)) })
  }
  colWidths.push({ wch: 9 }, { wch: 9 })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'TCM')
  return wb
}

// ── Browser download ──────────────────────────────────────────────────────────

export function downloadTCMXlsx(state: TCMState, filename = 'tcm-export.xlsx'): void {
  const wb = buildTCMWorkbook(state)
  XLSX.writeFile(wb, filename)
}
