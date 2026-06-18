// components/pdf/TcmPDF.tsx
// Dynamically imported client-side only — never import at module level in pages/layouts.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { TC, StandardTC } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTitle(tc: TC): string {
  if (tc.type === 'API') return `${tc.method} ${tc.endpoint}`
  return tc.title
}

function getSteps(tc: TC): string {
  if (tc.type === 'Standard') return tc.steps ?? ''
  if (tc.type === 'E2E') return tc.steps.map(s => `${s.num}. ${s.keyword} ${s.args ?? ''}`).join('\n')
  return `${tc.method} ${tc.endpoint}`
}

function getExpected(tc: TC): string {
  if (tc.type === 'Standard') return tc.expected ?? ''
  if (tc.type === 'E2E')      return tc.flow ?? ''
  return tc.assertions.map(a => `${a.type} ${a.operator} ${a.expected}`).join('\n')
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 11,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 28,
    backgroundColor: '#fff',
  },
  header: { marginBottom: 10 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#0D0D0E', marginBottom: 3 },
  meta: { fontSize: 9, color: '#6B7280', marginBottom: 1.5 },
  // Table
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E8E8EC',
    borderStyle: 'solid',
  },
  row: { flexDirection: 'row' },
  altRow: { backgroundColor: '#F4F4F6' },
  cell: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    fontSize: 8.5,
    borderRightWidth: 0.5,
    borderRightColor: '#E8E8EC',
    borderRightStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8E8EC',
    borderBottomStyle: 'solid',
  },
  hCell: {
    backgroundColor: '#1A56DB',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 9,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 10,
    left: 28,
    right: 28,
    fontSize: 7.5,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  footerLeft: {
    position: 'absolute',
    bottom: 10,
    left: 28,
    fontSize: 7.5,
    color: '#9CA3AF',
  },
})

// Column widths must sum to 100%
const COLS = [
  { key: 'id',     label: 'TC ID',    w: '8%'  },
  { key: 'type',   label: 'Type',     w: '6%'  },
  { key: 'title',  label: 'Title',    w: '18%' },
  { key: 'steps',  label: 'Steps',    w: '23%' },
  { key: 'exp',    label: 'Expected', w: '19%' },
  { key: 'prio',   label: 'Priority', w: '7%'  },
  { key: 'posNeg', label: 'Pos/Neg',  w: '9%'  },
  { key: 'status', label: 'Status',   w: '10%' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  tcs: TC[]
  jiraKey?: string
  title?: string
  sprint?: string
}

export function TcmPDF({ tcs, jiraKey, title, sprint }: Props) {
  const today = new Date().toLocaleDateString('en-GB')

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <Text style={S.title}>{title ?? 'Test Case Management Report'}</Text>
          {jiraKey && <Text style={S.meta}>Ticket: {jiraKey}</Text>}
          {sprint  && <Text style={S.meta}>Sprint: {sprint}</Text>}
          <Text style={S.meta}>Date: {today}</Text>
          <Text style={S.meta}>Total TC: {tcs.length}</Text>
        </View>

        {/* Table */}
        <View style={S.table}>
          {/* Header row */}
          <View style={S.row}>
            {COLS.map(col => (
              <View key={col.key} style={[S.cell, S.hCell, { width: col.w }]}>
                <Text>{col.label}</Text>
              </View>
            ))}
          </View>

          {/* Data rows */}
          {tcs.map((tc, i) => {
            const posNeg = tc.type === 'Standard' ? ((tc as StandardTC).positiveNegative ?? '') : ''
            return (
              <View key={tc.id} style={[S.row, i % 2 === 1 ? S.altRow : {}]}>
                <View style={[S.cell, { width: '8%'  }]}><Text>{tc.id}</Text></View>
                <View style={[S.cell, { width: '6%'  }]}><Text>{tc.type}</Text></View>
                <View style={[S.cell, { width: '18%' }]}><Text>{getTitle(tc)}</Text></View>
                <View style={[S.cell, { width: '23%' }]}><Text>{getSteps(tc)}</Text></View>
                <View style={[S.cell, { width: '19%' }]}><Text>{getExpected(tc)}</Text></View>
                <View style={[S.cell, { width: '7%'  }]}><Text>{tc.priority}</Text></View>
                <View style={[S.cell, { width: '9%'  }]}><Text>{posNeg}</Text></View>
                <View style={[S.cell, { width: '10%' }]}><Text>{tc.status}</Text></View>
              </View>
            )
          })}
        </View>

        {/* Footer — page numbers + branding */}
        <Text
          fixed
          style={S.footerLeft}
          render={() => 'QA Assist — Test Case Management Report'}
        />
        <Text
          fixed
          style={S.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  )
}
