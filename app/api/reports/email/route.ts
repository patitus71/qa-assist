export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import nodemailer from 'nodemailer'

const bodySchema = z.object({
  recipients: z.array(z.string().email()).min(1),
  subject: z.string().optional(),
  html: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { EMAIL_HOST, EMAIL_USER, EMAIL_PASS } = process.env
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    return NextResponse.json({ error: 'Email not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS)' }, { status: 503 })
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  })

  const subject = parsed.data.subject ?? `QA Assist Daily Report — ${new Date().toLocaleDateString()}`
  const html = parsed.data.html ?? `<p>Daily QA report from QA Assist. No detailed data available yet.</p>`

  await transporter.sendMail({
    from: EMAIL_USER,
    to: parsed.data.recipients.join(', '),
    subject,
    html,
  })

  return NextResponse.json({ ok: true, sentAt: new Date().toISOString() })
}
