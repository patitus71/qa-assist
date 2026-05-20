// lib/export-robot-workflow.ts
// Generate a single Robot Framework test that executes all E2E TCs in sequence.
// Adapted from robot-test-manager/lib/workflow-exporter.ts

import type { E2ETC } from './types'

const SETTINGS = `*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    SeleniumLibrary`

const VARIABLES = `*** Variables ***
\${BASE_URL}        https://your-app.example.com
\${BROWSER}         chrome
\${TEST_USER}       \${EMPTY}
\${TEST_PASS}       \${EMPTY}`

function indent(line: string): string {
  return `    ${line}`
}

const STEP_TYPE_COMMENT: Record<string, string> = {
  Action: 'UI Action',
  Verify: 'Assertion',
  Setup:  'Setup',
  DB:     'DB Query',
}

function buildTCKeyword(tc: E2ETC): string {
  const kwName = `${tc.id}: ${tc.title}`
  const lines: string[] = [kwName]
  lines.push(indent(`[Documentation]    ${tc.flow || tc.title}`))

  if (tc.steps.length === 0) {
    lines.push(indent('# No steps defined — add implementation here'))
    lines.push(indent('Log    ${tc.id} executed    console=True'))
    return lines.join('\n')
  }

  for (const step of tc.steps) {
    const typeComment = STEP_TYPE_COMMENT[step.type] ?? step.type
    const base = step.args.trim() ? `${step.keyword}    ${step.args}` : step.keyword
    const noteStr = step.note ? `    # [${typeComment}] ${step.note}` : `    # [${typeComment}]`
    lines.push(indent(base + noteStr))
  }

  return lines.join('\n')
}

export function generateWorkflowFile(tcs: E2ETC[]): string {
  if (tcs.length === 0) return ''

  // Main test case that calls all TC keywords in sequence
  const testSteps: string[] = [
    indent('# ── Setup ──────────────────────────────────────────────────────'),
    indent('Open Browser    ${BASE_URL}    ${BROWSER}'),
    indent('Set Window Size    1920    1080'),
    '',
    indent('# ── E2E Workflow ────────────────────────────────────────────────'),
  ]

  for (const tc of tcs) {
    testSteps.push(indent(`# ${tc.id}: ${tc.title}`))
    testSteps.push(indent(`${tc.id}: ${tc.title}`))
    testSteps.push('')
  }

  testSteps.push(indent('# ── Teardown ────────────────────────────────────────────────────'))
  testSteps.push(indent('Close Browser'))

  const mainTestCase = [
    'E2E Workflow Test',
    indent(`[Documentation]    Full E2E workflow — ${tcs.length} scenario${tcs.length !== 1 ? 's' : ''}`),
    indent('[Tags]    E2E    Workflow    AI-generated'),
    ...testSteps,
  ].join('\n')

  const keywords = tcs.map(buildTCKeyword).join('\n\n')

  return [
    SETTINGS,
    VARIABLES,
    `*** Test Cases ***\n${mainTestCase}`,
    `*** Keywords ***\n${keywords}`,
  ].join('\n\n\n')
}
