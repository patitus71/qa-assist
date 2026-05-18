// app/session/report/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { useSession } from '@/lib/session-context'
import { exportTCMXlsx } from '@/lib/export-xlsx'
import type { TestReport } from '@/lib/types'
import * as XLSX from 'xlsx-js-style'

// ── Pass rate SVG gauge ───────────────────────────────────────────────────────

function PassRateGauge({ rate }: { rate: number }) {
  const r = 38
  const circumference = 2 * Math.PI * r
  const offset = circumference - (rate / 100) * circumference
  const color = rate >= 80 ? '#0B7A51' : rate >= 60 ? '#92400E' : '#C0392B'

  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E8E8EF" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono text-ink-900">{rate}%</span>
        <span className="text-[10px] text-ink-500 uppercase tracking-wide">pass rate</span>
      </div>
    </div>
  )
}

// ── Section bar ───────────────────────────────────────────────────────────────

function SectionBar({ label, pass, total }: { label: string; pass: number; total: number }) {
  const pct = total > 0 ? Math.round((pass / total) * 100) : 0
  const color = pct >= 80 ? 'bg-success' : pct >= 60 ? 'bg-warn' : 'bg-danger'

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-600 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-ink-500 shrink-0 w-20 text-right">
        {pass}/{total} ({pct}%)
      </span>
    </div>
  )
}

// ── Report PDF export (dynamic import) ────────────────────────────────────────

async function exportReportPdf(
  report: TestReport,
  sectionStats: { standard: { pass: number; total: number }; e2e: { pass: number; total: number }; api: { pass: number; total: number } },
  jiraKey?: string
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const today = new Date().toLocaleDateString('en-GB')

  // Header
  doc.setFontSize(18)
  doc.setTextColor(13, 13, 14)
  doc.text('Test Execution Report', 14, 20)

  doc.setFontSize(9)
  doc.setTextColor(107, 107, 117)
  doc.text(`Generated: ${today}`, 14, 28)
  if (jiraKey) doc.text(`Ticket: ${jiraKey}`, 14, 34)

  // Pass rate summary
  doc.setFontSize(11)
  doc.setTextColor(13, 13, 14)
  doc.text(`Pass Rate: ${report.passRate}%  |  Total: ${report.totalTC}  |  Pass: ${report.passed}  |  Fail: ${report.failed}  |  Blocked: ${report.blocked}`, 14, 44)

  // Summary text
  doc.setFontSize(9)
  doc.setTextColor(46, 46, 49)
  const summaryLines = doc.splitTextToSize(report.summary, pageW - 28) as string[]
  doc.text(summaryLines, 14, 54)

  // Section stats table
  const sectionY = 54 + summaryLines.length * 5 + 8
  autoTable(doc, {
    startY: sectionY,
    head: [['Section', 'Passed', 'Failed', 'Total', 'Pass Rate']],
    body: [
      ['Standard', String(sectionStats.standard.pass), String(sectionStats.standard.total - sectionStats.standard.pass), String(sectionStats.standard.total), `${sectionStats.standard.total > 0 ? Math.round((sectionStats.standard.pass / sectionStats.standard.total) * 100) : 0}%`],
      ['E2E', String(sectionStats.e2e.pass), String(sectionStats.e2e.total - sectionStats.e2e.pass), String(sectionStats.e2e.total), `${sectionStats.e2e.total > 0 ? Math.round((sectionStats.e2e.pass / sectionStats.e2e.total) * 100) : 0}%`],
      ['API', String(sectionStats.api.pass), String(sectionStats.api.total - sectionStats.api.pass), String(sectionStats.api.total), `${sectionStats.api.total > 0 ? Math.round((sectionStats.api.pass / sectionStats.api.total) * 100) : 0}%`],
    ],
    headStyles: { fillColor: [26, 86, 219], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  })

  // Failed TCs
  if (report.failedTCs.length > 0) {
    const failY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? sectionY + 40
    autoTable(doc, {
      startY: failY + 8,
      head: [['TC ID', 'Issue']],
      body: report.failedTCs.map(t => [t.id, t.issue]),
      headStyles: { fillColor: [192, 57, 43], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    })
  }

  // Recommendations
  const recY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 180
  doc.setFontSize(10)
  doc.setTextColor(13, 13, 14)
  doc.text('Recommendations', 14, recY + 10)
  doc.setFontSize(8.5)
  doc.setTextColor(46, 46, 49)
  const recLines = doc.splitTextToSize(report.recommendation, pageW - 28) as string[]
  doc.text(recLines, 14, recY + 18)

  // Page numbers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages() as number
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(142, 142, 154)
    doc.text(`Page ${i} of ${pageCount}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
  }

  doc.save('qa-execution-report.pdf')
}

// ── Report Excel export ───────────────────────────────────────────────────────

function exportReportXlsx(
  report: TestReport,
  sectionStats: { standard: { pass: number; total: number }; e2e: { pass: number; total: number }; api: { pass: number; total: number } }
) {
  const data: unknown[][] = [
    ['QA Test Execution Report'],
    ['Generated', new Date().toLocaleDateString()],
    [],
    ['OVERALL RESULTS'],
    ['Pass Rate', `${report.passRate}%`],
    ['Total TCs', report.totalTC],
    ['Passed', report.passed],
    ['Failed', report.failed],
    ['Blocked', report.blocked],
    [],
    ['SECTION BREAKDOWN'],
    ['Section', 'Passed', 'Total', 'Pass Rate'],
    ['Standard', sectionStats.standard.pass, sectionStats.standard.total, sectionStats.standard.total > 0 ? `${Math.round((sectionStats.standard.pass / sectionStats.standard.total) * 100)}%` : '0%'],
    ['E2E', sectionStats.e2e.pass, sectionStats.e2e.total, sectionStats.e2e.total > 0 ? `${Math.round((sectionStats.e2e.pass / sectionStats.e2e.total) * 100)}%` : '0%'],
    ['API', sectionStats.api.pass, sectionStats.api.total, sectionStats.api.total > 0 ? `${Math.round((sectionStats.api.pass / sectionStats.api.total) * 100)}%` : '0%'],
    [],
    ['SUMMARY'],
    [report.summary],
    [],
    ['FAILED TCs'],
    ['TC ID', 'Issue'],
    ...report.failedTCs.map(t => [t.id, t.issue]),
    [],
    ['RECOMMENDATIONS'],
    [report.recommendation],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 20 }, { wch: 60 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, 'qa-execution-report.xlsx')
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { standardTCs, e2eTCs, apiTCs, jiraKey } = useSession()

  const [report, setReport] = useState<TestReport | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [showSaveBanner, setShowSaveBanner] = useState(false)
  const [jiraIssueKey, setJiraIssueKey] = useState(jiraKey ?? '')
  const [pushingComment, setPushingComment] = useState(false)
  const [commentResult, setCommentResult] = useState<'success' | 'error' | null>(null)

  const allTCs = useMemo(() => [...standardTCs, ...e2eTCs, ...apiTCs], [standardTCs, e2eTCs, apiTCs])

  const liveStats = useMemo(() => {
    const count = (tcs: typeof allTCs, status: string) => tcs.filter(t => t.status === status).length
    return {
      pass: count(allTCs, 'Pass'),
      fail: count(allTCs, 'Fail'),
      blocked: count(allTCs, 'Blocked'),
      skip: count(allTCs, 'Skip'),
      pending: count(allTCs, 'Pending'),
    }
  }, [allTCs])

  const sectionStats = useMemo(() => ({
    standard: { pass: standardTCs.filter(t => t.status === 'Pass').length, total: standardTCs.length },
    e2e: { pass: e2eTCs.filter(t => t.status === 'Pass').length, total: e2eTCs.length },
    api: { pass: apiTCs.filter(t => t.status === 'Pass').length, total: apiTCs.length },
  }), [standardTCs, e2eTCs, apiTCs])

  async function generateReport() {
    setGenerating(true)
    setError('')
    setCommentResult(null)
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          standardTCs: standardTCs.map(t => ({ id: t.id, title: t.title, status: t.status, bugTicket: t.bugTicket })),
          e2eTCs: e2eTCs.map(t => ({ id: t.id, title: t.title, status: t.status, bugTicket: t.bugTicket })),
          apiTCs: apiTCs.map(t => ({ id: t.id, method: t.method, endpoint: t.endpoint, status: t.status, bugTicket: t.bugTicket })),
        }),
      })
      const data = await res.json() as TestReport & { error?: string }
      if (!res.ok) { setError(data.error ?? 'Report generation failed'); return }
      setReport(data)
      setShowSaveBanner(true)
    } catch { setError('Network error — check connection') }
    finally { setGenerating(false) }
  }

  async function pushAsComment() {
    if (!report || !jiraIssueKey.trim()) return
    setPushingComment(true)
    setCommentResult(null)
    const commentBody = `[AI-generated] Test Execution Report — ${new Date().toLocaleDateString()}

Pass Rate: ${report.passRate}% (${report.passed}/${report.totalTC} passed)

${report.summary}

Standard TCs: ${sectionStats.standard.pass}/${sectionStats.standard.total} passed
E2E TCs: ${sectionStats.e2e.pass}/${sectionStats.e2e.total} passed
API TCs: ${sectionStats.api.pass}/${sectionStats.api.total} passed

Failed TCs:
${report.failedTCs.map(t => `• ${t.id}: ${t.issue}`).join('\n') || 'None'}

Recommendations: ${report.recommendation}`

    try {
      const res = await fetch('/api/jira/add-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueKey: jiraIssueKey.trim().toUpperCase(), body: commentBody }),
      })
      setCommentResult(res.ok ? 'success' : 'error')
    } catch { setCommentResult('error') }
    finally { setPushingComment(false) }
  }

  if (allTCs.length === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-900 mb-4">Report</h1>
        <div className="card p-10 border-dashed text-center text-ink-400">
          <p className="text-sm">No test cases to report on. Run some tests first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl w-full">
      {/* Auto-save banner */}
      {showSaveBanner && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-card px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-amber-900">Export your session before closing?</span>
          <div className="flex items-center gap-3">
            <button onClick={() => exportTCMXlsx(allTCs, 'session-tcm.xlsx')} className="btn-primary text-xs py-1">
              Export TCM .xlsx
            </button>
            <button onClick={() => setShowSaveBanner(false)} className="text-xs text-amber-600 hover:text-amber-800">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Report</h1>
          <p className="text-ink-500 text-sm mt-0.5">AI-generated test execution summary</p>
        </div>
        {jiraKey && <span className="tc-id">{jiraKey}</span>}
      </div>

      {/* Live stats (always visible) */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', count: allTCs.length, color: 'text-ink-900' },
          { label: 'Pass', count: liveStats.pass, color: 'text-success' },
          { label: 'Fail', count: liveStats.fail, color: 'text-danger' },
          { label: 'Blocked', count: liveStats.blocked, color: 'text-warn' },
          { label: 'Pending', count: liveStats.pending, color: 'text-ink-400' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-ink-500 uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Generate button */}
      {!report && (
        <div className="card p-8 text-center mb-6">
          <p className="text-ink-500 text-sm mb-4">
            {liveStats.pending > 0
              ? `${liveStats.pending} test cases still pending — you can generate now or run them first.`
              : 'All test cases have been executed. Ready to generate the report.'}
          </p>
          <button onClick={generateReport} disabled={generating}
            className="btn-primary flex items-center gap-2 mx-auto">
            {generating && (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {generating ? 'Generating report…' : 'Generate Report'}
          </button>
          {error && <p className="text-xs text-danger mt-3">{error}</p>}
        </div>
      )}

      {/* Report content */}
      {report && (
        <div className="space-y-5">
          {/* Pass rate + summary */}
          <div className="card p-5 flex items-start gap-6">
            <PassRateGauge rate={report.passRate} />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-ink-900 mb-2">Overall Summary</h2>
              <p className="text-sm text-ink-600 leading-relaxed">{report.summary}</p>
              <div className="flex gap-4 mt-3">
                <span className="text-xs font-mono text-success">{report.passed} Pass</span>
                <span className="text-xs font-mono text-danger">{report.failed} Fail</span>
                <span className="text-xs font-mono text-warn">{report.blocked} Blocked</span>
                <span className="text-xs font-mono text-ink-400">of {report.totalTC} total</span>
              </div>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-4">Section Breakdown</h2>
            <div className="space-y-3">
              {sectionStats.standard.total > 0 && (
                <SectionBar label="Standard" pass={sectionStats.standard.pass} total={sectionStats.standard.total} />
              )}
              {sectionStats.e2e.total > 0 && (
                <SectionBar label="E2E" pass={sectionStats.e2e.pass} total={sectionStats.e2e.total} />
              )}
              {sectionStats.api.total > 0 && (
                <SectionBar label="API" pass={sectionStats.api.pass} total={sectionStats.api.total} />
              )}
            </div>
          </div>

          {/* Failed TCs */}
          {report.failedTCs.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink-900 mb-3">
                Failed Test Cases
                <span className="ml-2 font-mono text-[10px] bg-danger/10 text-danger px-1.5 py-0.5 rounded-full border border-danger/20">
                  {report.failedTCs.length}
                </span>
              </h2>
              <div className="space-y-2">
                {report.failedTCs.map(t => (
                  <div key={t.id} className="flex items-start gap-2.5 text-sm">
                    <span className="tc-id shrink-0 mt-0.5">{t.id}</span>
                    <span className="text-ink-600">{t.issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="card p-5 border-l-4 border-accent">
            <h2 className="text-sm font-semibold text-ink-900 mb-2">Recommendations</h2>
            <p className="text-sm text-ink-600 leading-relaxed">{report.recommendation}</p>
          </div>

          {/* Export + Push strip */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink-900">Export Report</h2>
              <button
                onClick={generateReport}
                disabled={generating}
                className="btn-ghost text-xs disabled:opacity-40 flex items-center gap-1.5"
              >
                {generating && <svg className="animate-spin" width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" /><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
                Regenerate
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <button
                onClick={() => exportReportPdf(report, sectionStats, jiraKey ?? undefined)}
                className="btn-ghost text-sm flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5 6h6M5 9h4M5 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Export PDF
              </button>
              <button
                onClick={() => exportReportXlsx(report, sectionStats)}
                className="btn-ghost text-sm flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5 5l2 3-2 3M8 5l2 3-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Export Excel
              </button>
            </div>

            {/* Push as Jira comment */}
            <div className="border-t border-ink-100 pt-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-2">Push as Jira Comment</p>
              <div className="flex gap-2">
                <input
                  value={jiraIssueKey}
                  onChange={e => setJiraIssueKey(e.target.value.toUpperCase())}
                  placeholder="PROJ-100"
                  className="font-mono text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent w-36"
                />
                <button
                  onClick={pushAsComment}
                  disabled={pushingComment || !jiraIssueKey.trim()}
                  className="btn-primary text-sm disabled:opacity-40 flex items-center gap-2"
                >
                  {pushingComment && (
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
                      <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                  {pushingComment ? 'Pushing…' : 'Push as comment'}
                </button>
                {commentResult === 'success' && (
                  <span className="flex items-center gap-1 text-xs text-success font-mono">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    Comment posted
                  </span>
                )}
                {commentResult === 'error' && (
                  <span className="text-xs text-danger">Failed — check Jira config</span>
                )}
              </div>
              <p className="text-[10px] text-ink-400 mt-1.5">
                Comment will be prefixed with <span className="font-mono">[AI-generated]</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
