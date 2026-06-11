// components/pdf/TestResultPDF.tsx
// Dynamically imported client-side only — never import at module level in pages/layouts.

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { TC, StandardTC, Evidence } from '@/lib/types'
import type { ResultFilter } from '@/lib/export-pdf-results'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tcTitle(tc: TC): string {
  return tc.type === 'API' ? `${tc.method} ${tc.endpoint}` : tc.title
}

function tcSteps(tc: TC): string[] {
  if (tc.type === 'Standard') {
    return (tc.steps || '').split('\n').filter(Boolean).map((s, i) => `${i + 1}. ${s}`)
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

function statusColor(s: string) {
  if (s === 'Pass')    return '#16A34A'
  if (s === 'Fail')    return '#DC2626'
  if (s === 'Blocked') return '#D97706'
  if (s === 'Skip')    return '#64748B'
  return '#9CA3AF'
}

function priorityColor(p: string) {
  if (p === 'High') return '#DC2626'
  if (p === 'Low')  return '#64748B'
  return '#D97706'
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  coverPage: {
    fontFamily: 'THSarabunNew',
    fontSize: 14,
    paddingTop: 0,
    paddingBottom: 28,
    paddingHorizontal: 0,
    backgroundColor: '#fff',
  },
  detailPage: {
    fontFamily: 'THSarabunNew',
    fontSize: 14,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  // Cover
  accentBar:    { height: 4, backgroundColor: '#1A56DB' },
  coverBody:    { paddingHorizontal: 20, paddingTop: 16 },
  appRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  appBadge:     { width: 26, height: 26, backgroundColor: '#1A56DB', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  appBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  appName:      { fontSize: 15, fontWeight: 'bold', color: '#1A1A1B' },
  coverTitle:   { fontSize: 24, fontWeight: 'bold', color: '#0D0D0E', marginBottom: 6 },
  divider:      { height: 0.5, backgroundColor: '#E5E7EB', marginBottom: 8 },
  metaRow:      { flexDirection: 'row', marginBottom: 4 },
  metaLabel:    { fontSize: 9.5, color: '#6B7280', width: 60 },
  metaValue:    { fontSize: 9.5, color: '#1A1A1B', flex: 1 },
  // Stats
  statsHeading: { fontSize: 12, fontWeight: 'bold', color: '#1A1A1B', marginBottom: 6 },
  statsRow:     { flexDirection: 'row', marginBottom: 6 },
  statBox:      { flex: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', marginRight: 5 },
  statVal:      { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  statLabel:    { fontSize: 7.5, color: '#fff', marginTop: 1 },
  passRateRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  passRateText: { fontSize: 10, color: '#1A1A1B', marginRight: 8 },
  barBg:        { flex: 1, height: 7, backgroundColor: '#E5E7EB', borderRadius: 4 },
  barFill:      { height: 7, backgroundColor: '#16A34A', borderRadius: 4 },
  filterNote:   { fontSize: 8.5, color: '#9CA3AF', marginTop: 4 },
  // TC block
  tcBlock:      { marginBottom: 6 },
  tcHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 5 },
  tcId:         { fontSize: 9, fontWeight: 'bold', color: '#fff', marginRight: 8 },
  tcTitleText:  { fontSize: 9, color: '#fff', flex: 1 },
  tcStatusPill: { fontSize: 8, color: '#fff', fontWeight: 'bold' },
  badgeRow:     { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  badge:        { borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginRight: 4, marginBottom: 2 },
  badgeText:    { fontSize: 7.5, color: '#fff', fontWeight: 'bold' },
  sectionLabel: { fontSize: 8.5, fontWeight: 'bold', color: '#1A56DB', marginBottom: 3 },
  sectionBlock: { marginBottom: 8 },
  bodyText:     { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  stepText:     { fontSize: 9, color: '#374151', marginBottom: 2, lineHeight: 1.4 },
  codeBlock:    { backgroundColor: '#111827', borderRadius: 3, padding: 6, marginBottom: 4 },
  codeText:     { fontSize: 8, color: '#4ADE80', lineHeight: 1.4 },
  dbBlock:      { backgroundColor: '#F9FAFB', borderRadius: 3, padding: 6, borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'solid', marginBottom: 4 },
  image:        { width: '100%', maxHeight: 190, objectFit: 'contain', marginTop: 4, marginBottom: 4 },
  bugTag:       { alignSelf: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: '#FECACA', borderStyle: 'solid', marginBottom: 4 },
  bugTagText:   { fontSize: 8, color: '#DC2626' },
  tcDivider:    { height: 0.5, backgroundColor: '#E5E7EB', marginTop: 4, marginBottom: 10 },
  // Summary page
  summaryTitle: { fontSize: 18, fontWeight: 'bold', color: '#0D0D0E', marginBottom: 4 },
  failHeading:  { fontSize: 12, fontWeight: 'bold', color: '#DC2626', marginBottom: 5 },
  blockHeading: { fontSize: 12, fontWeight: 'bold', color: '#D97706', marginBottom: 5 },
  summaryTable: { borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'solid', marginBottom: 14 },
  sumRow:       { flexDirection: 'row' },
  sumAlt:       { backgroundColor: '#FEF2F2' },
  sumBlockAlt:  { backgroundColor: '#FFFBEB' },
  sumCell:      { paddingVertical: 5, paddingHorizontal: 6, fontSize: 9, color: '#1E1E20', borderRightWidth: 0.5, borderRightColor: '#E5E7EB', borderRightStyle: 'solid', borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB', borderBottomStyle: 'solid' },
  sumHCell:     { fontWeight: 'bold', color: '#fff', fontSize: 9 },
  // Page footer
  pageFooter: {
    position: 'absolute',
    bottom: 10,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
    borderTopStyle: 'solid',
    paddingTop: 4,
  },
  footerText: { fontSize: 7.5, color: '#9CA3AF' },
})

// ── TC Section ────────────────────────────────────────────────────────────────

const EMPTY_EV: Evidence = { screenshots: [], apiResponse: '', dbResult: '', notes: '' }

function TCSection({ tc, ev }: { tc: TC; ev: Evidence }) {
  const title    = tcTitle(tc)
  const steps    = tcSteps(tc)
  const expected = tcExpected(tc)
  const sc       = statusColor(tc.status)
  const posNeg   = tc.type === 'Standard' ? (tc as StandardTC).positiveNegative : undefined

  return (
    <View style={S.tcBlock}>
      {/* Header bar */}
      <View style={[S.tcHeader, { backgroundColor: sc }]} minPresenceAhead={30}>
        <Text style={S.tcId}>{tc.id}</Text>
        <Text style={S.tcTitleText}>{title}</Text>
        <Text style={S.tcStatusPill}>{tc.status.toUpperCase()}</Text>
      </View>

      {/* Badges */}
      <View style={S.badgeRow}>
        <View style={[S.badge, { backgroundColor: priorityColor(tc.priority) }]}>
          <Text style={S.badgeText}>{tc.priority.toUpperCase()}</Text>
        </View>
        {posNeg && (
          <View style={[S.badge, { backgroundColor: posNeg === 'Positive' ? '#16A34A' : '#DC2626' }]}>
            <Text style={S.badgeText}>{posNeg.toUpperCase()}</Text>
          </View>
        )}
        <View style={[S.badge, { backgroundColor: '#6366F1' }]}>
          <Text style={S.badgeText}>{tc.type}</Text>
        </View>
      </View>

      {/* Steps (with per-step screenshots) */}
      {steps.length > 0 && (
        <View style={S.sectionBlock}>
          <Text style={S.sectionLabel}>Steps</Text>
          {steps.map((step, i) => {
            const stepImgs = ev.stepScreenshots?.[String(i + 1)] ?? []
            return (
              <View key={i}>
                <Text style={S.stepText}>{step}</Text>
                {stepImgs.map((src, j) => src ? (
                  <Image key={j} src={src} style={S.image} />
                ) : null)}
              </View>
            )
          })}
        </View>
      )}

      {/* Expected */}
      {expected ? (
        <View style={S.sectionBlock}>
          <Text style={S.sectionLabel}>Expected Result</Text>
          <Text style={S.bodyText}>{expected}</Text>
        </View>
      ) : null}

      {/* Actual result */}
      {tc.actualResult ? (
        <View style={S.sectionBlock}>
          <Text style={[S.sectionLabel, { color: '#DC2626' }]}>Actual Result</Text>
          <Text style={S.bodyText}>{tc.actualResult}</Text>
        </View>
      ) : null}

      {/* Notes */}
      {ev.notes ? (
        <View style={S.sectionBlock}>
          <Text style={S.sectionLabel}>Notes</Text>
          <Text style={S.bodyText}>{ev.notes}</Text>
        </View>
      ) : null}

      {/* API response */}
      {ev.apiResponse ? (
        <View style={S.sectionBlock}>
          <Text style={S.sectionLabel}>API Response</Text>
          <View style={S.codeBlock}>
            <Text style={S.codeText}>{ev.apiResponse.slice(0, 800)}</Text>
          </View>
        </View>
      ) : null}

      {/* DB result */}
      {ev.dbResult ? (
        <View style={S.sectionBlock}>
          <Text style={S.sectionLabel}>DB Result</Text>
          <View style={S.dbBlock}>
            <Text style={S.codeText}>{ev.dbResult.slice(0, 500)}</Text>
          </View>
        </View>
      ) : null}

      {/* TC-level screenshots */}
      {ev.screenshots.length > 0 ? (
        <View style={S.sectionBlock}>
          <Text style={S.sectionLabel}>Additional Evidence</Text>
          {ev.screenshots.map((src, i) => src ? (
            <Image key={i} src={src} style={S.image} />
          ) : null)}
        </View>
      ) : null}

      {/* Bug ticket */}
      {tc.bugTicket ? (
        <View style={S.bugTag}>
          <Text style={S.bugTagText}>Bug: {tc.bugTicket}</Text>
        </View>
      ) : null}

      <View style={S.tcDivider} />
    </View>
  )
}

// ── Summary table ─────────────────────────────────────────────────────────────

function SummaryTable({
  label, tcs, headColor, isBlocked, col3Label,
}: {
  label: string
  tcs: { id: string; title: string; extra: string }[]
  headColor: string
  isBlocked: boolean
  col3Label: string
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={label === 'Failed' ? S.failHeading : S.blockHeading}>
        {label} Test Cases ({tcs.length})
      </Text>
      <View style={S.summaryTable}>
        {/* Header */}
        <View style={S.sumRow}>
          <View style={[S.sumCell, S.sumHCell, { backgroundColor: headColor, width: '15%' }]}>
            <Text>TC ID</Text>
          </View>
          <View style={[S.sumCell, S.sumHCell, { backgroundColor: headColor, width: '50%' }]}>
            <Text>Title</Text>
          </View>
          <View style={[S.sumCell, S.sumHCell, { backgroundColor: headColor, width: '35%' }]}>
            <Text>{col3Label}</Text>
          </View>
        </View>
        {/* Rows */}
        {tcs.map((tc, i) => (
          <View key={tc.id} style={[S.sumRow, i % 2 === 1 ? (isBlocked ? S.sumBlockAlt : S.sumAlt) : {}]}>
            <View style={[S.sumCell, { width: '15%' }]}><Text>{tc.id}</Text></View>
            <View style={[S.sumCell, { width: '50%' }]}><Text>{tc.title}</Text></View>
            <View style={[S.sumCell, { width: '35%' }]}><Text>{tc.extra || '—'}</Text></View>
          </View>
        ))}
      </View>
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  tcs: TC[]
  evidenceMap: Record<string, Evidence>
  projectName?: string
  jiraKey?: string
  sprint?: string
  filter: ResultFilter
}

export function TestResultPDF({ tcs, evidenceMap, projectName, jiraKey, sprint, filter }: Props) {
  const today   = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const project = projectName?.trim() || 'QA Assist Project'

  const total    = tcs.length
  const nPass    = tcs.filter(t => t.status === 'Pass').length
  const nFail    = tcs.filter(t => t.status === 'Fail').length
  const nBlocked = tcs.filter(t => t.status === 'Blocked').length
  const nSkip    = tcs.filter(t => t.status === 'Skip').length
  const nPending = tcs.filter(t => t.status === 'Pending').length
  const done     = nPass + nFail + nBlocked + nSkip
  const passRate = done > 0 ? Math.round((nPass / done) * 100) : 0

  const filterLabel = {
    all:            'All test cases',
    failed:         'Failed only',
    passed:         'Passed only',
    'with-evidence': 'With evidence only',
  }[filter]

  const failedTCs  = tcs.filter(t => t.status === 'Fail')
  const blockedTCs = tcs.filter(t => t.status === 'Blocked')
  const showSummary = failedTCs.length > 0 || blockedTCs.length > 0

  const statBoxes = [
    { label: 'TOTAL',   val: total,    color: '#1A56DB' },
    { label: 'PASS',    val: nPass,    color: '#16A34A' },
    { label: 'FAIL',    val: nFail,    color: '#DC2626' },
    { label: 'BLOCKED', val: nBlocked, color: '#D97706' },
    { label: 'SKIP',    val: nSkip,    color: '#64748B' },
    { label: 'PENDING', val: nPending, color: '#9CA3AF' },
  ]

  const barWidth = total > 0 ? `${Math.max(3, (nPass / total) * 100)}%` : '0%'

  return (
    <Document>
      {/* ── Cover page ─────────────────────────────────────────────────────── */}
      <Page size="A4" style={S.coverPage}>
        <View style={S.accentBar} />

        <View style={S.coverBody}>
          {/* App name */}
          <View style={S.appRow}>
            <View style={S.appBadge}><Text style={S.appBadgeText}>QA</Text></View>
            <Text style={S.appName}>QA Assist</Text>
          </View>

          <Text style={S.coverTitle}>Test Execution Report</Text>
          <View style={S.divider} />

          {/* Metadata */}
          <View style={S.metaRow}><Text style={S.metaLabel}>Project:</Text><Text style={S.metaValue}>{project}</Text></View>
          {jiraKey  && <View style={S.metaRow}><Text style={S.metaLabel}>Ticket:</Text><Text style={S.metaValue}>{jiraKey}</Text></View>}
          {sprint   && <View style={S.metaRow}><Text style={S.metaLabel}>Sprint:</Text><Text style={S.metaValue}>{sprint}</Text></View>}
          <View style={S.metaRow}><Text style={S.metaLabel}>Date:</Text><Text style={S.metaValue}>{today}</Text></View>
          <View style={[S.metaRow, { marginBottom: 12 }]}><Text style={S.metaLabel}>Filter:</Text><Text style={S.metaValue}>{filterLabel}</Text></View>

          <View style={S.divider} />

          {/* Summary */}
          <Text style={[S.statsHeading, { marginTop: 10 }]}>Summary</Text>
          <View style={S.statsRow}>
            {statBoxes.map(s => (
              <View key={s.label} style={[S.statBox, { backgroundColor: s.color }]}>
                <Text style={S.statVal}>{s.val}</Text>
                <Text style={S.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Pass rate */}
          <View style={S.passRateRow}>
            <Text style={S.passRateText}>Pass Rate: {passRate}%</Text>
            <View style={S.barBg}>
              <View style={[S.barFill, { width: barWidth }]} />
            </View>
          </View>

          {filter !== 'all' && (
            <Text style={S.filterNote}>Showing {tcs.length} TCs — {filterLabel} applied</Text>
          )}
        </View>
      </Page>

      {/* ── TC detail pages ─────────────────────────────────────────────────── */}
      {tcs.length > 0 && (
        <Page size="A4" style={S.detailPage}>
          {tcs.map(tc => (
            <TCSection key={tc.id} tc={tc} ev={evidenceMap[tc.id] ?? EMPTY_EV} />
          ))}
          <View fixed style={S.pageFooter}>
            <Text style={S.footerText}>QA Assist — Test Execution Report</Text>
            <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* ── Summary page ────────────────────────────────────────────────────── */}
      {showSummary && (
        <Page size="A4" style={S.detailPage}>
          <Text style={[S.summaryTitle, { marginBottom: 8 }]}>Summary</Text>
          <View style={[S.divider, { marginBottom: 14 }]} />

          {failedTCs.length > 0 && (
            <SummaryTable
              label="Failed"
              headColor="#DC2626"
              isBlocked={false}
              col3Label="Actual Result / Notes"
              tcs={failedTCs.map(tc => ({
                id:    tc.id,
                title: tcTitle(tc),
                extra: tc.actualResult || evidenceMap[tc.id]?.notes || tc.bugTicket || '',
              }))}
            />
          )}

          {blockedTCs.length > 0 && (
            <SummaryTable
              label="Blocked"
              headColor="#D97706"
              isBlocked={true}
              col3Label="Notes / Reason"
              tcs={blockedTCs.map(tc => ({
                id:    tc.id,
                title: tcTitle(tc),
                extra: (tc as StandardTC).notes || evidenceMap[tc.id]?.notes || '',
              }))}
            />
          )}

          <View fixed style={S.pageFooter}>
            <Text style={S.footerText}>QA Assist — Test Execution Report</Text>
            <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  )
}
