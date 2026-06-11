// lib/export-pdf.ts
// Client-only — call from event handlers only, never from server components.
import type { TC } from './types'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportTCMPdf(
  tcs: TC[],
  options: { jiraKey?: string; title?: string; sprint?: string } = {},
  filename = 'tcm-report.pdf'
) {
  const { registerPdfFonts } = await import('./pdf-fonts')
  await registerPdfFonts()

  const { pdf }    = await import('@react-pdf/renderer')
  const { TcmPDF } = await import('../components/pdf/TcmPDF')
  const { createElement } = await import('react')

  const blob = await pdf(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createElement as any)(TcmPDF, {
      tcs,
      jiraKey: options.jiraKey,
      title:   options.title,
      sprint:  options.sprint,
    })
  ).toBlob()

  triggerDownload(blob, filename)
}
