// components/pdf/ReportPDF.tsx
// Dynamically imported client-side only — never import at module level in pages/layouts.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { TestReport } from '@/lib/types'

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    fontSize: 14,
    padding: 32,
    backgroundColor: '#fff',
  },
  // Header
  accentBar:   { height: 4, backgroundColor: '#1A56DB', marginHorizontal: -32, marginTop: -32, marginBottom: 20 },
  appRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  appBadge:    { width: 22, height: 22, backgroundColor: '#1A56DB', borderRadius: 3, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  appBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: 'bold' },
  appName:     { fontSize: 13, fontWeight: 'bold', color: '#1A1A1B' },
  title:       { fontSize: 22, fontWeight: 'bold', color: '#0D0D0E', marginBottom: 4 },
  divider:     { height: 0.5, backgroundColor: '#E5E7EB', marginBottom: 10 },
  metaRow:     { flexDirection: 'row', marginBottom: 3 },
  metaLabel:   { fontSize: 9.5, color: '#6B7280', width: 70 },
  metaValue:   { fontSize: 9.5, color: '#1A1A1B' },
  // Stats row
  statsRow:    { flexDirection: 'row', marginTop: 14, marginBottom: 10 },
  statBox:     { flex: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', marginRight: 5 },
  statVal:     { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  statLabel:   { fontSize: 8, color: '#fff', marginTop: 1 },
  // Pass rate
  prRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  prLabel:     { fontSize: 10.5, color: '#1A1A1B', marginRight: 8 },
  prBarBg:     { flex: 1, height: 7, backgroundColor: '#E5E7EB', borderRadius: 4 },
  prBarFill:   { height: 7, backgroundColor: '#16A34A', borderRadius: 4 },
  // Section
  sectionTitle:  { fontSize: 13, fontWeight: 'bold', color: '#0D0D0E', marginTop: 12, marginBottom: 6 },
  summaryText:   { fontSize: 10.5, color: '#374151', lineHeight: 1.6 },
  // Section breakdown table
  table:         { borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'solid', marginBottom: 14 },
  row:           { flexDirection: 'row' },
  altRow:        { backgroundColor: '#F4F4F6' },
  cell:          { paddingVertical: 6, paddingHorizontal: 8, fontSize: 10, color: '#1E1E20', borderRightWidth: 0.5, borderRightColor: '#E5E7EB', borderRightStyle: 'solid', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB', borderBottomStyle: 'solid' },
  hCell:         { backgroundColor: '#1A56DB', color: '#fff', fontWeight: 'bold', fontSize: 10 },
  // Failed TCs
  failRow:       { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-start' },
  tcId:          { fontSize: 9.5, fontFamily: 'Courier', backgroundColor: '#F1F5F9', color: '#334155', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, marginRight: 8, minWidth: 52, textAlign: 'center' },
  issueText:     { fontSize: 10, color: '#374151', flex: 1, lineHeight: 1.5 },
  // Recommendations
  recCard:       { borderLeftWidth: 3, borderLeftColor: '#1A56DB', borderLeftStyle: 'solid', paddingLeft: 12, paddingVertical: 6, backgroundColor: '#F8FAFF', borderRadius: 3, marginTop: 4 },
  recText:       { fontSize: 10.5, color: '#374151', lineHeight: 1.6 },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
    borderTopStyle: 'solid',
    paddingTop: 4,
  },
  footerText: { fontSize: 7.5, color: '#9CA3AF' },
})

// ── Component ─────────────────────────────────────────────────────────────────

interface SectionStats {
  standard: { pass: number; total: number }
  e2e:      { pass: number; total: number }
  api:      { pass: number; total: number }
}

interface Props {
  report: TestReport
  sectionStats: SectionStats
  jiraKey?: string
}

function pct(pass: number, total: number) {
  return total > 0 ? Math.round((pass / total) * 100) : 0
}

export function ReportPDF({ report, sectionStats, jiraKey }: Props) {
  const today    = new Date().toLocaleDateString('en-GB')
  const passRate = report.passRate
  const barWidth = `${Math.max(3, passRate)}%`

  const stats = [
    { label: 'TOTAL',   val: report.totalTC,  color: '#1A56DB' },
    { label: 'PASS',    val: report.passed,   color: '#16A34A' },
    { label: 'FAIL',    val: report.failed,   color: '#DC2626' },
    { label: 'BLOCKED', val: report.blocked,  color: '#D97706' },
  ]

  const sections = [
    { label: 'Standard', ...sectionStats.standard },
    { label: 'E2E',      ...sectionStats.e2e      },
    { label: 'API',      ...sectionStats.api      },
  ].filter(s => s.total > 0)

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <View style={S.accentBar} />

        {/* App row */}
        <View style={S.appRow}>
          <View style={S.appBadge}><Text style={S.appBadgeTxt}>QA</Text></View>
          <Text style={S.appName}>QA Assist</Text>
        </View>

        <Text style={S.title}>Test Execution Report</Text>
        <View style={S.divider} />

        {/* Meta */}
        <View style={S.metaRow}><Text style={S.metaLabel}>Generated:</Text><Text style={S.metaValue}>{today}</Text></View>
        {jiraKey && <View style={S.metaRow}><Text style={S.metaLabel}>Ticket:</Text><Text style={S.metaValue}>{jiraKey}</Text></View>}

        {/* Stats */}
        <View style={S.statsRow}>
          {stats.map(s => (
            <View key={s.label} style={[S.statBox, { backgroundColor: s.color }]}>
              <Text style={S.statVal}>{s.val}</Text>
              <Text style={S.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Pass rate bar */}
        <View style={S.prRow}>
          <Text style={S.prLabel}>Pass Rate: {passRate}%</Text>
          <View style={S.prBarBg}>
            <View style={[S.prBarFill, { width: barWidth }]} />
          </View>
        </View>

        <View style={S.divider} />

        {/* Summary text */}
        <Text style={S.sectionTitle}>Overall Summary</Text>
        <Text style={S.summaryText}>{report.summary}</Text>

        {/* Section breakdown */}
        {sections.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Section Breakdown</Text>
            <View style={S.table}>
              <View style={S.row}>
                {['Section', 'Passed', 'Failed', 'Total', 'Pass Rate'].map(h => (
                  <View key={h} style={[S.cell, S.hCell, { flex: h === 'Section' ? 2 : 1 }]}>
                    <Text>{h}</Text>
                  </View>
                ))}
              </View>
              {sections.map((s, i) => (
                <View key={s.label} style={[S.row, i % 2 === 1 ? S.altRow : {}]}>
                  <View style={[S.cell, { flex: 2 }]}><Text>{s.label}</Text></View>
                  <View style={[S.cell, { flex: 1 }]}><Text>{s.pass}</Text></View>
                  <View style={[S.cell, { flex: 1 }]}><Text>{s.total - s.pass}</Text></View>
                  <View style={[S.cell, { flex: 1 }]}><Text>{s.total}</Text></View>
                  <View style={[S.cell, { flex: 1 }]}><Text>{pct(s.pass, s.total)}%</Text></View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Failed TCs */}
        {report.failedTCs.length > 0 && (
          <>
            <Text style={[S.sectionTitle, { color: '#DC2626' }]}>
              Failed Test Cases ({report.failedTCs.length})
            </Text>
            {report.failedTCs.map(t => (
              <View key={t.id} style={S.failRow}>
                <Text style={S.tcId}>{t.id}</Text>
                <Text style={S.issueText}>{t.issue}</Text>
              </View>
            ))}
          </>
        )}

        {/* Recommendations */}
        <Text style={S.sectionTitle}>Recommendations</Text>
        <View style={S.recCard}>
          <Text style={S.recText}>{report.recommendation}</Text>
        </View>

        {/* Page footer */}
        <View fixed style={S.footer}>
          <Text style={S.footerText}>QA Assist — Test Execution Report</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
