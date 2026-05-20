// lib/types.ts

export type TCStatus = 'Pending' | 'Pass' | 'Fail' | 'Skip' | 'Blocked'
export type TCPriority = 'High' | 'Med' | 'Low'
export type TCType = 'Standard' | 'E2E' | 'API'

export interface StepItem {
  keyword: string
  args: string
  note: string
}

export interface StandardTC {
  id: string
  type: 'Standard'
  title: string
  steps: string
  stepItems?: StepItem[]
  expected: string
  priority: TCPriority
  positiveNegative?: 'Positive' | 'Negative'
  testData?: string
  prerequisite?: string
  aiGenerated?: boolean
  source?: 'ai' | 'jira' | 'manual'
  status: TCStatus
  actualResult?: string
  evidenceFiles?: string[]
  bugTicket?: string
  notes?: string
  runDate?: string
}

export interface E2EStep {
  num: number
  keyword: string
  args: string
  type: 'Action' | 'Verify' | 'Setup' | 'DB'
  note: string
}

export interface E2ETC {
  id: string
  type: 'E2E'
  title: string
  flow: string
  steps: E2EStep[]
  priority: TCPriority
  aiGenerated?: boolean
  source?: 'ai' | 'jira' | 'manual'
  status: TCStatus
  actualResult?: string
  evidenceFiles?: string[]
  bugTicket?: string
  notes?: string
  runDate?: string
}

export interface Assertion {
  type: 'status' | 'body' | 'jsonpath' | 'time'
  operator: 'equals' | 'contains' | 'less_than'
  expected: string
  fromSpec?: boolean
}

export interface APITC {
  id: string
  type: 'API'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  endpoint: string
  body: Record<string, unknown>
  assertions: Assertion[]
  priority: TCPriority
  aiGenerated?: boolean
  source?: 'ai' | 'jira' | 'manual'
  status: TCStatus
  actualResult?: string
  bugTicket?: string
  notes?: string
  runDate?: string
}

export type TC = StandardTC | E2ETC | APITC

export interface AutoSaveTC {
  id: string
  title: string
  priority: TCPriority
  status: TCStatus
  type: TCType
  aiGenerated?: boolean
}

export interface TCMGroup {
  id: string
  name: string
  values: string[]
}

export interface JiraIssue {
  key: string
  title: string
  description: string
  acceptanceCriteria: string
}

export interface ClassifyResult {
  safe: boolean
  warnings: string[]
}

export interface BugDraft {
  title: string
  steps: string
  expected: string
  actual: string
  priority: 'Critical' | 'High' | 'Med' | 'Low'
  labels: string[]
}

export interface Evidence {
  screenshots: string[]
  apiResponse: string
  dbResult: string
  notes: string
  stepScreenshots?: Record<string, string[]>  // key: "1","2",… (1-based step number)
}

export interface AssertionResult {
  assertion: Assertion
  passed: boolean
  actual: string
}

export interface APIRunResult {
  statusCode: number
  responseBody: unknown
  responseTimeMs: number
  assertionResults: AssertionResult[]
  error?: string
}

export interface JiraIssueLink {
  key: string
  type: string
}

export interface TestReport {
  summary: string
  passRate: number
  totalTC: number
  passed: number
  failed: number
  blocked: number
  failedTCs: { id: string; issue: string }[]
  recommendation: string
}
