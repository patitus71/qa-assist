// lib/export-robot.ts
import type { TC, StandardTC, E2ETC, APITC } from './types'

// ── Default template sections ─────────────────────────────────────────────────

export const DEFAULT_SETTINGS = `*** Settings ***
Library    SeleniumLibrary
Library    DatabaseLibrary
Library    RequestsLibrary
Library    Collections
Library    String
Library    DateTime`

export const DEFAULT_VARIABLES = `*** Variables ***
\${BASE_URL}         https://your-app.example.com
\${API_URL}          https://api.example.com
\${BROWSER}          chrome
\${USERNAME}         \${EMPTY}
\${PASSWORD}         \${EMPTY}
\${DB_HOST}          localhost
\${DB_NAME}          testdb
\${DB_USER}          \${EMPTY}
\${DB_PASS}          \${EMPTY}`

export const DEFAULT_KEYWORDS = `*** Keywords ***
Login With Credentials
    [Arguments]    \${username}    \${password}
    Open Browser    \${BASE_URL}/login    \${BROWSER}
    Input Text    id=username    \${username}
    Input Text    id=password    \${password}
    Click Button    xpath=//button[contains(text(),'Login')]
    Wait Until Page Contains Element    id=dashboard    10s

Login With 2FA
    [Arguments]    \${username}    \${password}    \${otp_code}
    Login With Credentials    \${username}    \${password}
    Wait Until Element Is Visible    id=otp-input    5s
    Input Text    id=otp-input    \${otp_code}
    Click Button    xpath=//button[contains(text(),'Verify')]
    Wait Until Page Contains Element    id=dashboard    10s

Connect And Query DB
    [Arguments]    \${query}
    Connect To Database    pymysql    \${DB_NAME}    \${DB_USER}    \${DB_PASS}    \${DB_HOST}
    \${result}=    Query    \${query}
    Disconnect From Database
    RETURN    \${result}

Verify API Response
    [Arguments]    \${response}    \${expected_status}=200
    Should Be Equal As Integers    \${response.status_code}    \${expected_status}`

// ── TC block generators ───────────────────────────────────────────────────────

function standardBlock(tc: StandardTC): string {
  let stepLines: string
  if (tc.stepItems && tc.stepItems.length > 0) {
    stepLines = tc.stepItems
      .map(s => {
        const base = `    ${s.keyword}${s.args ? '    ' + s.args : ''}`
        return s.note ? `${base}    # ${s.note}` : base
      })
      .join('\n')
  } else {
    stepLines = tc.steps
      .split('\n')
      .filter(Boolean)
      .map(s => `    ...    # ${s.trim()}`)
      .join('\n')
  }

  return [
    `${tc.id}: ${tc.title}`,
    `    [Tags]    Standard    AI-generated`,
    `    [Documentation]    Expected: ${tc.expected}`,
    `    Log    === Test: ${tc.id} ===    console=True`,
    `    # Automate the following steps:`,
    stepLines || `    ...    # Add test implementation here`,
    `    Log    Verify: ${tc.expected}    console=True`,
  ].join('\n')
}

function e2eBlock(tc: E2ETC): string {
  const stepLines = tc.steps.length > 0
    ? tc.steps.map(s => {
        const base = `    ${s.keyword}    ${s.args}`
        return s.note ? `${base}    # ${s.note}` : base
      }).join('\n')
    : '    Log    Add E2E implementation steps here'

  return [
    `${tc.id}: ${tc.title}`,
    `    [Tags]    E2E    AI-generated`,
    `    [Documentation]    ${tc.flow}`,
    stepLines,
  ].join('\n')
}

function apiBlock(tc: APITC): string {
  const expectedStatus =
    tc.assertions.find(a => a.type === 'status' && a.operator === 'equals')?.expected ?? '200'
  const methodTitle = tc.method.charAt(0) + tc.method.slice(1).toLowerCase()
  const hasBody = tc.method !== 'GET' && Object.keys(tc.body).length > 0

  const lines: string[] = [
    `${tc.id}: ${tc.method} ${tc.endpoint}`,
    `    [Tags]    API    AI-generated`,
    `    [Documentation]    Verify ${tc.method} ${tc.endpoint} returns ${expectedStatus}`,
    `    Create Session    api_session    \${API_URL}    verify=\${False}`,
  ]

  if (hasBody) {
    lines.push(`    \${body}=    Evaluate    ${JSON.stringify(tc.body)}    json`)
    lines.push(`    \${response}=    ${methodTitle} On Session    api_session    ${tc.endpoint}    json=\${body}`)
  } else {
    lines.push(`    \${response}=    ${methodTitle} On Session    api_session    ${tc.endpoint}`)
  }

  lines.push(`    Verify API Response    \${response}    ${expectedStatus}`)

  for (const a of tc.assertions.filter(a => a.type === 'body' || a.type === 'jsonpath')) {
    if (a.type === 'body') {
      lines.push(`    Should Contain    \${response.text}    ${a.expected}`)
    } else {
      lines.push(`    # Verify JSONPath: ${a.expected}`)
    }
  }

  lines.push(`    Delete All Sessions`)

  return lines.join('\n')
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateDefaultRobot(tcs: TC[]): string {
  const blocks = tcs.map(tc => {
    if (tc.type === 'Standard') return standardBlock(tc)
    if (tc.type === 'E2E') return e2eBlock(tc)
    return apiBlock(tc)
  })

  const testCasesSection = ['*** Test Cases ***', ...blocks].join('\n\n')
  return [DEFAULT_SETTINGS, DEFAULT_VARIABLES, testCasesSection, DEFAULT_KEYWORDS].join('\n\n\n')
}

export function downloadRobotFile(content: string, filename = 'qa-assist.robot') {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
