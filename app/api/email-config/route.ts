export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function canConfigure(role: string) {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'QA_LEAD'
}

function parseRecipients(raw: string): string[] {
  return raw ? raw.split(',').filter(Boolean) : []
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !canConfigure(session.user.role)) return forbidden()

  const config = await prisma.emailConfig.findUnique({ where: { userId: session.user.id } })
  if (!config) return NextResponse.json(null)
  return NextResponse.json({ ...config, recipients: parseRecipients(config.recipients) })
}

const updateSchema = z.object({
  autoSend: z.boolean().optional(),
  sendTime: z.string().optional(),
  recipients: z.array(z.string().email()).optional(),
  squadId: z.string().nullable().optional(),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !canConfigure(session.user.role)) return forbidden()

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (parsed.data.autoSend !== undefined) data.autoSend = parsed.data.autoSend
  if (parsed.data.sendTime !== undefined) data.sendTime = parsed.data.sendTime
  if (parsed.data.recipients !== undefined) data.recipients = parsed.data.recipients.join(',')
  if ('squadId' in parsed.data) data.squadId = parsed.data.squadId

  const config = await prisma.emailConfig.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  })

  return NextResponse.json({ ...config, recipients: parseRecipients(config.recipients) })
}
