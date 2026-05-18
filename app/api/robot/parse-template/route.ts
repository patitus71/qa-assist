export const runtime = 'edge'

// app/api/robot/parse-template/route.ts
import { NextRequest, NextResponse } from 'next/server'

export interface ParsedTemplate {
  settings: string
  variables: string
  testcases: string
  keywords: string
}

function parseRobotSections(content: string): ParsedTemplate {
  const result: ParsedTemplate = { settings: '', variables: '', testcases: '', keywords: '' }

  // Split on section headers, preserving the header text
  const parts = content.split(/(\*\*\*\s*(?:Settings|Variables|Test Cases|Keywords)\s*\*\*\*)/i)

  for (let i = 1; i < parts.length; i += 2) {
    const header = parts[i].replace(/\*/g, '').trim().toLowerCase().replace(/\s+/g, '')
    const body = (parts[i + 1] ?? '').trim()

    if (header === 'settings') result.settings = body
    else if (header === 'variables') result.variables = body
    else if (header === 'testcases') result.testcases = body
    else if (header === 'keywords') result.keywords = body
  }

  return result
}

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No .robot file provided' }, { status: 400 })
  }

  if (!file.name.endsWith('.robot')) {
    return NextResponse.json({ error: 'File must have .robot extension' }, { status: 400 })
  }

  const content = await file.text()
  if (!content.trim()) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  }

  const parsed = parseRobotSections(content)

  if (!parsed.settings && !parsed.keywords) {
    return NextResponse.json({ error: 'Could not parse Robot Framework sections — ensure the file uses *** Settings ***, *** Keywords *** headers' }, { status: 422 })
  }

  return NextResponse.json(parsed)
}
