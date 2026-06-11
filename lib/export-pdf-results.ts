// lib/export-pdf-results.ts
// Client-only — call from event handlers only, never from server components.

import type { TC, Evidence } from './types'

export type ResultFilter = 'all' | 'failed' | 'passed' | 'with-evidence'

export interface ExportResultOptions {
  projectName?: string
  jiraKey?: string
  sprint?: string
  filter: ResultFilter
  evidenceMap?: Record<string, Evidence>
  filename?: string
}

export async function exportTestResultPdf(tcs: TC[], opts: ExportResultOptions) {
  const { registerPdfFonts } = await import('./pdf-fonts')
  await registerPdfFonts()

  const { pdf }             = await import('@react-pdf/renderer')
  const { TestResultPDF }   = await import('../components/pdf/TestResultPDF')
  const { createElement }   = await import('react')

  const blob = await pdf(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createElement as any)(TestResultPDF, {
      tcs,
      evidenceMap:  opts.evidenceMap  ?? {},
      projectName:  opts.projectName,
      jiraKey:      opts.jiraKey,
      sprint:       opts.sprint,
      filter:       opts.filter,
    })
  ).toBlob()

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href     = url
  a.download = opts.filename ?? `test-results-${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
