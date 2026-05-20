// lib/export-robot-keywords.ts
// Generate a Robot Framework *** Keywords *** file from APITC[].
// Each TC becomes a reusable keyword that wraps one API call + assertions.
// Adapted from robot-test-manager/lib/keyword-generator.ts

import type { APITC } from './types'

const SETTINGS = `*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    String`

const VARIABLES = `*** Variables ***
\${BASE_URL}        https://your-api.example.com
\${DEFAULT_HEADERS}    Content-Type=application/json`

const METHOD_TITLE: Record<string, string> = {
  GET: 'Get', POST: 'Post', PUT: 'Put', DELETE: 'Delete', PATCH: 'Patch',
}

function indent(line: string): string {
  return `    ${line}`
}

function buildAssertions(tc: APITC): string[] {
  const lines: string[] = []
  for (const a of tc.assertions) {
    if (a.type === 'status') {
      lines.push(indent(`Should Be Equal As Integers    \${response.status_code}    ${a.expected}`))
    } else if (a.type === 'body' && a.operator === 'contains') {
      lines.push(indent(`Should Contain    \${response.text}    ${a.expected}`))
    } else if (a.type === 'body' && a.operator === 'equals') {
      lines.push(indent(`Should Be Equal    \${response.text}    ${a.expected}`))
    } else if (a.type === 'jsonpath') {
      lines.push(indent(`# JSONPath assertion: ${a.expected}`))
    } else if (a.type === 'time') {
      lines.push(indent(`Should Be True    \${response_time} < ${a.expected}    Response too slow`))
    }
  }
  return lines
}

function buildKeyword(tc: APITC): string {
  const kwName = `${tc.id}: ${tc.method} ${tc.endpoint}`
  const methodTitle = METHOD_TITLE[tc.method] ?? tc.method

  const lines: string[] = [kwName]
  lines.push(indent(`[Documentation]    ${tc.method} ${tc.endpoint} — Priority: ${tc.priority}`))
  lines.push(indent(`[Arguments]    \${headers}=\${DEFAULT_HEADERS}    \${base_url}=\${BASE_URL}`))

  const hasBody = (tc.method !== 'GET' && tc.method !== 'DELETE') && Object.keys(tc.body).length > 0
  if (hasBody) {
    const bodyJson = JSON.stringify(tc.body)
    lines.push(indent(`\${body}=    Evaluate    ${bodyJson}    json`))
    lines.push(indent(`\${response}=    ${methodTitle} On Session    api_session    \${base_url}${tc.endpoint}    json=\${body}    headers=\${headers}`))
  } else {
    lines.push(indent(`\${response}=    ${methodTitle} On Session    api_session    \${base_url}${tc.endpoint}    headers=\${headers}`))
  }

  if (tc.assertions.some(a => a.type === 'time')) {
    lines.push(indent(`\${response_time}=    Set Variable    \${response.elapsed.total_seconds()}`))
  }

  lines.push(...buildAssertions(tc))
  lines.push(indent('RETURN    ${response}'))

  return lines.join('\n')
}

export function generateKeywordFile(tcs: APITC[]): string {
  if (tcs.length === 0) return ''

  const setupKeyword = [
    'Setup API Session',
    indent('[Arguments]    ${base_url}=${BASE_URL}'),
    indent('Create Session    api_session    ${base_url}    verify=${False}'),
  ].join('\n')

  const teardownKeyword = [
    'Teardown API Session',
    indent('Delete All Sessions'),
  ].join('\n')

  const keywords = [
    setupKeyword,
    teardownKeyword,
    ...tcs.map(buildKeyword),
  ].join('\n\n')

  return [SETTINGS, VARIABLES, `*** Keywords ***\n${keywords}`].join('\n\n\n')
}
