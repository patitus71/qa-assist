// lib/export-pdf.ts
// Dynamic imports — jsPDF uses browser globals, only call this in client components.
import type { TC, StandardTC, E2ETC, APITC } from './types'

function getTitle(tc: TC): string {
  if (tc.type === 'Standard') return tc.title
  if (tc.type === 'E2E') return tc.title
  return `${tc.method} ${tc.endpoint}`
}

function getSteps(tc: TC): string {
  if (tc.type === 'Standard') return tc.steps
  if (tc.type === 'E2E') return tc.steps.map(s => `${s.num}. ${s.keyword} ${s.args}`).join('\n')
  return `${tc.method} ${tc.endpoint}`
}

function getExpected(tc: TC): string {
  if (tc.type === 'Standard') return tc.expected
  if (tc.type === 'E2E') return tc.flow
  return tc.assertions.map(a => `${a.type} ${a.operator} ${a.expected}`).join('\n')
}

export async function exportTCMPdf(
  tcs: TC[],
  options: { jiraKey?: string; title?: string; sprint?: string } = {},
  filename = 'tcm-report.pdf'
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const today = new Date().toLocaleDateString('en-GB')

  // Header
  doc.setFontSize(16)
  doc.setTextColor(13, 13, 14) // ink-900
  doc.text(options.title ?? 'Test Case Management Report', 14, 18)

  doc.setFontSize(9)
  doc.setTextColor(107, 107, 117) // ink-500
  let headerY = 26
  if (options.jiraKey) { doc.text(`Ticket: ${options.jiraKey}`, 14, headerY); headerY += 6 }
  if (options.sprint) { doc.text(`Sprint: ${options.sprint}`, 14, headerY); headerY += 6 }
  doc.text(`Date: ${today}`, 14, headerY); headerY += 6
  doc.text(`Total TC: ${tcs.length}`, 14, headerY)

  // Table
  const tableStart = headerY + 8
  const head = [['TC ID', 'Type', 'Title', 'Steps', 'Expected', 'Priority', 'Pos/Neg', 'Status']]
  const body = tcs.map(tc => [
    tc.id,
    tc.type,
    getTitle(tc),
    getSteps(tc),
    getExpected(tc),
    tc.priority,
    (tc as import('./types').StandardTC).positiveNegative ?? '',
    tc.status,
  ])

  autoTable(doc, {
    startY: tableStart,
    head,
    body,
    headStyles: {
      fillColor: [26, 86, 219], // accent blue
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 7.5, textColor: [30, 30, 32] },
    alternateRowStyles: { fillColor: [244, 244, 246] }, // ink-50
    columnStyles: {
      0: { cellWidth: 20 },  // TC ID
      1: { cellWidth: 14 },  // Type
      2: { cellWidth: 42 },  // Title
      3: { cellWidth: 54 },  // Steps
      4: { cellWidth: 46 },  // Expected
      5: { cellWidth: 16 },  // Priority
      6: { cellWidth: 18 },  // Pos/Neg
      7: { cellWidth: 18 },  // Status
    },
    margin: { left: 14, right: 14 },
    styles: { overflow: 'linebreak', valign: 'top' },
  })

  // Footer: page numbers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages() as number
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(142, 142, 154) // ink-400
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    doc.text('QA Assist — AI-powered QA', 14, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(filename)
}
