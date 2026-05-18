// lib/export-postman.ts
import type { APITC } from './types'

interface PostmanCollection {
  info: { name: string; schema: string }
  item: PostmanItem[]
  variable: { key: string; value: string; type: string }[]
}

interface PostmanItem {
  name: string
  request: {
    method: string
    header: { key: string; value: string }[]
    url: { raw: string; host: string[]; path: string[] }
    body?: { mode: string; raw: string; options: { raw: { language: string } } }
  }
  event?: {
    listen: string
    script: { type: string; exec: string[] }
  }[]
}

function tcToItem(tc: APITC): PostmanItem {
  const pathParts = tc.endpoint.split('/').filter(Boolean)
  const item: PostmanItem = {
    name: `${tc.id}: ${tc.method} ${tc.endpoint}`,
    request: {
      method: tc.method,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: {
        raw: '{{base_url}}' + tc.endpoint,
        host: ['{{base_url}}'],
        path: pathParts,
      },
    },
  }

  if (tc.method !== 'GET' && Object.keys(tc.body).length > 0) {
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(tc.body, null, 2),
      options: { raw: { language: 'json' } },
    }
  }

  // Generate test assertions
  const tests = tc.assertions.map(a => {
    if (a.type === 'status') return `pm.test("Status is ${a.expected}", () => pm.response.to.have.status(${a.expected}));`
    if (a.type === 'time') return `pm.test("Response time < ${a.expected}ms", () => pm.expect(pm.response.responseTime).to.be.below(${a.expected}));`
    if (a.type === 'body') return `pm.test("Body contains '${a.expected}'", () => pm.expect(pm.response.text()).to.include("${a.expected}"));`
    if (a.type === 'jsonpath') return `pm.test("${a.expected} exists", () => { const json = pm.response.json(); pm.expect(json).to.have.nested.property("${a.expected.replace(/^\$\.?/, '')}"); });`
    return ''
  }).filter(Boolean)

  if (tests.length > 0) {
    item.event = [{
      listen: 'test',
      script: { type: 'text/javascript', exec: tests },
    }]
  }

  return item
}

export function exportPostmanCollection(tcs: APITC[], name = 'QA Assist — API Tests') {
  const collection: PostmanCollection = {
    info: {
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: tcs.map(tcToItem),
    variable: [
      { key: 'base_url', value: 'https://api.example.com', type: 'string' },
    ],
  }

  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
