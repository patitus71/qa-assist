// lib/export-pdf-results.ts
// Client-only — dynamically imported. Never call from server components.

import type { TC, StandardTC, E2ETC, APITC, Evidence } from './types'

export type ResultFilter = 'all' | 'failed' | 'passed' | 'with-evidence'

export interface ExportResultOptions {
  projectName?: string
  jiraKey?: string
  sprint?: string
  filter: ResultFilter
  evidenceMap?: Record<string, Evidence>
  filename?: string
}

// ─── Color helpers ────────────────────────────────────────────────────────────

type RGB = [number, number, number]

function statusRgb(s: string): RGB {
  if (s === 'Pass')    return [22,  163, 74]
  if (s === 'Fail')    return [220,  38, 38]
  if (s === 'Blocked') return [217, 119,  6]
  if (s === 'Skip')    return [100, 116, 139]
  return [156, 163, 175]   // Pending
}

function priorityRgb(p: string): RGB {
  if (p === 'High') return [220, 38, 38]
  if (p === 'Low')  return [100, 116, 139]
  return [217, 119, 6]   // Med
}

// ─── TC content helpers ───────────────────────────────────────────────────────

function tcTitle(tc: TC): string {
  return tc.type === 'API' ? `${tc.method} ${tc.endpoint}` : tc.title
}

function tcSteps(tc: TC): string[] {
  if (tc.type === 'Standard') {
    if (!tc.steps) return []
    return tc.steps.split('\n').filter(Boolean).map((s, i) => `${i + 1}. ${s}`)
  }
  if (tc.type === 'E2E') {
    return tc.steps.map(s =>
      `${s.num}. [${s.type}] ${s.keyword}${s.args ? '  ' + s.args : ''}${s.note ? '  — ' + s.note : ''}`
    )
  }
  return [
    `${tc.method} ${tc.endpoint}`,
    ...tc.assertions.map(a => `Assert: ${a.type} ${a.operator} ${a.expected}`),
  ]
}

function tcExpected(tc: TC): string {
  if (tc.type === 'Standard') return tc.expected || ''
  if (tc.type === 'E2E')      return tc.flow || ''
  return tc.assertions.map(a => `${a.type} ${a.operator} ${a.expected}`).join('\n')
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportTestResultPdf(tcs: TC[], opts: ExportResultOptions) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW   = 210
  const PH   = 297
  const ML   = 14
  const MR   = 14
  const CW   = PW - ML - MR          // 182mm usable width
  const HDRH = 14                     // page header height
  const FTRH = 12                     // page footer height
  const BOT  = PH - FTRH             // safe bottom
  const CTOP = HDRH + 4              // content start Y on non-cover pages

  const today       = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const projectName = opts.projectName?.trim() || 'QA Assist Project'

  // Stats over the full set (for cover page summary)
  const total   = tcs.length
  const nPass   = tcs.filter(t => t.status === 'Pass').length
  const nFail   = tcs.filter(t => t.status === 'Fail').length
  const nBlocked= tcs.filter(t => t.status === 'Blocked').length
  const nSkip   = tcs.filter(t => t.status === 'Skip').length
  const nPending= tcs.filter(t => t.status === 'Pending').length
  const done    = nPass + nFail + nBlocked + nSkip
  const passRate= done > 0 ? Math.round((nPass / done) * 100) : 0

  let y = 0

  // ── Page header (drawn on non-cover pages) ──────────────────────────────
  function drawPageHeader() {
    doc.setFillColor(248, 248, 250)
    doc.rect(0, 0, PW, 12, 'F')
    doc.setFontSize(8)
    doc.setTextColor(107, 114, 128)
    doc.text(projectName, ML, 8)
    if (opts.jiraKey) doc.text(opts.jiraKey, ML + doc.getTextWidth(projectName) + 4, 8)
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.3)
    doc.line(ML, 12, PW - MR, 12)
  }

  // ── Check / add page break ───────────────────────────────────────────────
  function need(h: number) {
    if (y + h > BOT - 2) {
      doc.addPage()
      drawPageHeader()
      y = CTOP
    }
  }

  // ── Split + draw wrapped text, return new Y ──────────────────────────────
  function drawText(text: string, x: number, startY: number, maxW: number, fs: number, color: RGB = [55, 65, 81]): number {
    if (!text.trim()) return startY
    doc.setFontSize(fs)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, maxW)
    doc.text(lines, x, startY)
    return startY + lines.length * fs * 0.45 + 1
  }

  // ── Section label ─────────────────────────────────────────────────────────
  function sectionLabel(label: string, color: RGB = [26, 86, 219]) {
    need(8)
    doc.setFontSize(8)
    doc.setTextColor(...color)
    doc.text(label, ML, y)
    y += 5
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COVER PAGE
  // ─────────────────────────────────────────────────────────────────────────

  // Accent top bar
  doc.setFillColor(26, 86, 219)
  doc.rect(0, 0, PW, 4, 'F')

  y = 16

  // Logo + app name
  doc.setFillColor(26, 86, 219)
  doc.roundedRect(ML, y, 8, 8, 1, 1, 'F')
  doc.setFontSize(6.5)
  doc.setTextColor(255, 255, 255)
  doc.text('QA', ML + 1.5, y + 5.5)
  doc.setFontSize(13)
  doc.setTextColor(26, 26, 27)
  doc.text('QA Assist', ML + 11, y + 5.8)
  y += 14

  // Title
  doc.setFontSize(22)
  doc.setTextColor(13, 13, 14)
  doc.text('Test Execution Report', ML, y)
  y += 7

  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.line(ML, y, PW - MR, y)
  y += 7

  // Meta rows
  const metaRows: [string, string][] = [
    ['Project', projectName],
    ...(opts.jiraKey  ? [['Ticket', opts.jiraKey] as [string, string]]  : []),
    ...(opts.sprint   ? [['Sprint', opts.sprint]  as [string, string]]  : []),
    ['Date',    today],
    ['Filter',  opts.filter === 'all' ? 'All test cases'
               : opts.filter === 'failed' ? 'Failed only'
               : opts.filter === 'passed' ? 'Passed only'
               : 'With evidence only'],
  ]

  metaRows.forEach(([label, val]) => {
    doc.setFontSize(9)
    doc.setTextColor(107, 114, 128)
    doc.text(`${label}:`, ML, y)
    doc.setTextColor(26, 26, 27)
    doc.text(val, ML + 24, y)
    y += 5.5
  })

  y += 4
  doc.setDrawColor(229, 231, 235)
  doc.line(ML, y, PW - MR, y)
  y += 7

  // Summary heading
  doc.setFontSize(11)
  doc.setTextColor(26, 26, 27)
  doc.text('Summary', ML, y)
  y += 6

  // Stat boxes
  const statBoxes: { label: string; val: number; color: RGB }[] = [
    { label: 'Total',   val: total,    color: [26, 86, 219]  },
    { label: 'Pass',    val: nPass,    color: [22, 163, 74]  },
    { label: 'Fail',    val: nFail,    color: [220, 38, 38]  },
    { label: 'Blocked', val: nBlocked, color: [217, 119, 6]  },
    { label: 'Skip',    val: nSkip,    color: [100, 116, 139]},
    { label: 'Pending', val: nPending, color: [156, 163, 175]},
  ]
  const bW = 28, bH = 16, bGap = 3
  statBoxes.forEach((s, i) => {
    const bx = ML + i * (bW + bGap)
    doc.setFillColor(...s.color)
    doc.roundedRect(bx, y, bW, bH, 2, 2, 'F')
    doc.setFontSize(13)
    doc.setTextColor(255, 255, 255)
    doc.text(String(s.val), bx + bW / 2, y + 7.5, { align: 'center' })
    doc.setFontSize(6.5)
    doc.text(s.label.toUpperCase(), bx + bW / 2, y + 13.5, { align: 'center' })
  })
  y += bH + 6

  // Pass rate
  doc.setFontSize(9.5)
  doc.setTextColor(26, 26, 27)
  doc.text(`Pass Rate: ${passRate}%`, ML, y)
  y += 5

  const barW = CW, barH = 5
  doc.setFillColor(229, 231, 235)
  doc.roundedRect(ML, y, barW, barH, 2, 2, 'F')
  if (nPass > 0 && total > 0) {
    doc.setFillColor(22, 163, 74)
    doc.roundedRect(ML, y, Math.max(5, (nPass / total) * barW), barH, 2, 2, 'F')
  }
  y += barH + 6

  // Filter note
  if (opts.filter !== 'all') {
    doc.setFontSize(8)
    doc.setTextColor(107, 114, 128)
    doc.text(`Showing ${tcs.length} of ${total} TCs — ${opts.filter} filter applied`, ML, y)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC SECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  if (tcs.length > 0) {
    doc.addPage()
    drawPageHeader()
    y = CTOP
  }

  for (const tc of tcs) {
    const title     = tcTitle(tc)
    const steps     = tcSteps(tc)
    const expected  = tcExpected(tc)
    const actual    = tc.actualResult || ''
    const bugTicket = tc.bugTicket || ''
    const ev: Evidence = opts.evidenceMap?.[tc.id] ?? { screenshots: [], apiResponse: '', dbResult: '', notes: '' }
    const posNeg    = tc.type === 'Standard' ? (tc as StandardTC).positiveNegative : undefined

    need(22)

    const [sr, sg, sb] = statusRgb(tc.status)

    // ── TC header bar ──────────────────────────────────────────────────────
    doc.setFillColor(sr, sg, sb)
    doc.roundedRect(ML, y, CW, 9, 1.5, 1.5, 'F')

    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)

    const idText = tc.id
    doc.text(idText, ML + 2.5, y + 6)
    const idW = doc.getTextWidth(idText) + 4

    const statusText = tc.status.toUpperCase()
    doc.setFontSize(7.5)
    const stW = doc.getTextWidth(statusText) + 8
    doc.setFillColor(255, 255, 255, 30)
    doc.roundedRect(PW - MR - stW, y + 1.5, stW, 6, 1, 1, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text(statusText, PW - MR - stW / 2, y + 5.8, { align: 'center' })

    const titleMaxW = CW - idW - stW - 8
    doc.setFontSize(8.5)
    const titleLines = doc.splitTextToSize(title, titleMaxW)
    doc.text(titleLines[0], ML + idW, y + 6)

    y += 12

    // ── Badge row ──────────────────────────────────────────────────────────
    let bx = ML

    const addBadge = (text: string, color: RGB) => {
      doc.setFillColor(...color)
      doc.setFontSize(7)
      const bw = doc.getTextWidth(text) + 7
      doc.roundedRect(bx, y, bw, 5, 1, 1, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(text, bx + bw / 2, y + 3.5, { align: 'center' })
      bx += bw + 3
    }

    addBadge(tc.priority.toUpperCase(), priorityRgb(tc.priority))
    if (posNeg) {
      addBadge(posNeg.toUpperCase(), posNeg === 'Positive' ? [22, 163, 74] : [220, 38, 38])
    }
    addBadge(tc.type, [99, 102, 241])
    y += 8

    // ── Helper: embed one image with border + caption ──────────────────────
    async function embedImage(src: string, caption: string) {
      if (!src) return
      const MAX_H = 48   // ≈ 180px at 96dpi
      try {
        const img = new Image()
        await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = src })
        const aspect = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1
        let iW = CW
        let iH = iW / aspect
        if (iH > MAX_H) { iH = MAX_H; iW = iH * aspect }
        if (iW > CW)    { iW = CW;    iH = iW / aspect }
        need(iH + 10)
        // Border
        doc.setDrawColor(209, 213, 219)
        doc.setLineWidth(0.3)
        doc.rect(ML, y, iW, iH)
        // Image
        const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        doc.addImage(src, fmt, ML, y, iW, iH)
        y += iH
        // Caption
        doc.setFontSize(7)
        doc.setTextColor(107, 114, 128)
        doc.text(caption, ML, y + 4)
        y += 8
      } catch {
        doc.setFontSize(7.5)
        doc.setTextColor(220, 38, 38)
        doc.text(`[Screenshot unavailable — ${caption}]`, ML + 4, y)
        y += 5
      }
    }

    // ── Steps (with per-step images inline) ────────────────────────────────
    if (steps.length > 0) {
      sectionLabel('Steps')
      for (let si = 0; si < steps.length; si++) {
        const stepKey  = String(si + 1)
        const stepImgs = ev.stepScreenshots?.[stepKey] ?? []

        // Step text
        doc.setFontSize(8)
        const stepLines = doc.splitTextToSize(steps[si], CW - 4)
        need(stepLines.length * 3.7 + 2)
        doc.setTextColor(55, 65, 81)
        doc.text(stepLines, ML + 4, y)
        y += stepLines.length * 3.7 + 2

        // Per-step screenshots
        for (const src of stepImgs) {
          await embedImage(src, `Evidence — Step ${stepKey}`)
        }

        y += 1  // small gap between steps
      }
      y += 1
    }

    // ── Expected ───────────────────────────────────────────────────────────
    if (expected) {
      need(12)
      sectionLabel('Expected Result')
      const lines = doc.splitTextToSize(expected, CW - 4)
      need(lines.length * 3.7 + 2)
      doc.setFontSize(8)
      doc.setTextColor(55, 65, 81)
      doc.text(lines, ML + 4, y)
      y += lines.length * 3.7 + 3
    }

    // ── Actual result ──────────────────────────────────────────────────────
    if (actual) {
      need(12)
      sectionLabel('Actual Result', [220, 38, 38])
      const lines = doc.splitTextToSize(actual, CW - 4)
      need(lines.length * 3.7 + 2)
      doc.setFontSize(8)
      doc.setTextColor(55, 65, 81)
      doc.text(lines, ML + 4, y)
      y += lines.length * 3.7 + 3
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    if (ev.notes) {
      need(10)
      sectionLabel('Notes')
      const lines = doc.splitTextToSize(ev.notes, CW - 4)
      need(lines.length * 3.7 + 2)
      doc.setFontSize(8)
      doc.setTextColor(55, 65, 81)
      doc.text(lines, ML + 4, y)
      y += lines.length * 3.7 + 3
    }

    // ── API response ──────────────────────────────────────────────────────
    if (ev.apiResponse) {
      need(18)
      sectionLabel('API Response')
      doc.setFont('Courier')
      const lines = doc.splitTextToSize(ev.apiResponse.slice(0, 800), CW - 8)
      const boxH = Math.min(lines.length * 3.5 + 5, 42)
      need(boxH)
      doc.setFillColor(17, 24, 39)
      doc.roundedRect(ML, y, CW, boxH, 1, 1, 'F')
      doc.setFontSize(7)
      doc.setTextColor(74, 222, 128)
      doc.text(lines, ML + 3, y + 4, { maxWidth: CW - 6 })
      doc.setFont('Helvetica')
      y += boxH + 3
    }

    // ── DB result ─────────────────────────────────────────────────────────
    if (ev.dbResult) {
      need(14)
      sectionLabel('DB Result')
      doc.setFont('Courier')
      const lines = doc.splitTextToSize(ev.dbResult.slice(0, 500), CW - 8)
      const boxH = lines.length * 3.5 + 5
      need(boxH)
      doc.setFillColor(249, 250, 251)
      doc.setDrawColor(209, 213, 219)
      doc.roundedRect(ML, y, CW, boxH, 1, 1, 'FD')
      doc.setFontSize(7)
      doc.setTextColor(55, 65, 81)
      doc.text(lines, ML + 3, y + 4, { maxWidth: CW - 6 })
      doc.setFont('Helvetica')
      y += boxH + 3
    }

    // ── TC-level screenshots → "Additional Evidence" ──────────────────────
    if (ev.screenshots.length > 0) {
      need(12)
      sectionLabel('Additional Evidence')
      for (let si = 0; si < ev.screenshots.length; si++) {
        await embedImage(ev.screenshots[si], `TC Evidence ${si + 1}`)
      }
    }

    // ── Bug ticket ────────────────────────────────────────────────────────
    if (bugTicket) {
      need(10)
      doc.setFontSize(8)
      const bugLabel = `Bug: ${bugTicket}`
      const bugW = doc.getTextWidth(bugLabel) + 12
      doc.setFillColor(254, 242, 242)
      doc.setDrawColor(252, 165, 165)
      doc.roundedRect(ML, y, bugW, 6, 1, 1, 'FD')
      doc.setTextColor(220, 38, 38)
      doc.text(bugLabel, ML + 4, y + 4.2)
      y += 9
    }

    // ── Section separator ─────────────────────────────────────────────────
    y += 3
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.3)
    doc.line(ML, y, PW - MR, y)
    y += 5
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY PAGE
  // ─────────────────────────────────────────────────────────────────────────

  const failedTCs  = tcs.filter(t => t.status === 'Fail')
  const blockedTCs = tcs.filter(t => t.status === 'Blocked')

  if (failedTCs.length > 0 || blockedTCs.length > 0) {
    doc.addPage()
    drawPageHeader()
    y = CTOP

    doc.setFontSize(16)
    doc.setTextColor(13, 13, 14)
    doc.text('Summary', ML, y)
    y += 4
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.4)
    doc.line(ML, y, PW - MR, y)
    y += 8

    if (failedTCs.length > 0) {
      doc.setFontSize(10.5)
      doc.setTextColor(220, 38, 38)
      doc.text(`Failed Test Cases (${failedTCs.length})`, ML, y)
      y += 5

      autoTable(doc, {
        startY: y,
        head: [['TC ID', 'Title', 'Actual Result', 'Bug Ticket']],
        body: failedTCs.map(tc => [
          tc.id,
          tcTitle(tc),
          tc.actualResult || opts.evidenceMap?.[tc.id]?.notes || '—',
          tc.bugTicket || '—',
        ]),
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: [30, 30, 32] },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 80 }, 2: { cellWidth: 55 }, 3: { cellWidth: 22 } },
        margin: { left: ML, right: MR },
        styles: { overflow: 'linebreak', valign: 'top' },
      })

      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
    }

    if (blockedTCs.length > 0) {
      need(20)
      doc.setFontSize(10.5)
      doc.setTextColor(217, 119, 6)
      doc.text(`Blocked Test Cases (${blockedTCs.length})`, ML, y)
      y += 5

      autoTable(doc, {
        startY: y,
        head: [['TC ID', 'Title', 'Notes / Reason']],
        body: blockedTCs.map(tc => [
          tc.id,
          tcTitle(tc),
          tc.notes || opts.evidenceMap?.[tc.id]?.notes || '—',
        ]),
        headStyles: { fillColor: [217, 119, 6], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: [30, 30, 32] },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 90 }, 2: { cellWidth: 67 } },
        margin: { left: ML, right: MR },
        styles: { overflow: 'linebreak', valign: 'top' },
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEADERS + FOOTERS (final pass)
  // ─────────────────────────────────────────────────────────────────────────

  const totalPages = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages()

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(156, 163, 175)

    if (p === 1) {
      // Cover footer
      doc.setDrawColor(229, 231, 235)
      doc.setLineWidth(0.3)
      doc.line(ML, PH - 11, PW - MR, PH - 11)
      doc.text('QA Assist — Test Execution Report', ML, PH - 7)
      doc.text(today, PW - MR, PH - 7, { align: 'right' })
    } else {
      // Page number in header (right side)
      doc.text(`${p} / ${totalPages}`, PW - MR, 8, { align: 'right' })
      // Footer
      doc.setDrawColor(229, 231, 235)
      doc.setLineWidth(0.3)
      doc.line(ML, PH - 11, PW - MR, PH - 11)
      doc.text('QA Assist — Test Execution Report', ML, PH - 7)
      doc.text(today, PW - MR, PH - 7, { align: 'right' })
    }
  }

  doc.save(opts.filename ?? `test-results-${new Date().toISOString().slice(0, 10)}.pdf`)
}
