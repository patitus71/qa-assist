export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  ticketKey: z.string().min(1),
  ticketName: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'QA_ENGINEER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { ticketKey, ticketName } = parsed.data

  // Pause (not complete) any other active timesheets for this user
  const active = await prisma.timesheet.findMany({
    where: { userId: session.user.id, status: 'active' },
  })
  for (const ts of active) {
    const addedMinutes = Math.floor((Date.now() - ts.startTime.getTime()) / 60000)
    await prisma.timesheet.update({
      where: { id: ts.id },
      data: {
        duration: (ts.duration ?? 0) + addedMinutes,
        status: 'paused',
      },
    })
  }

  // Check if there's already a paused entry for this exact ticket — resume it instead
  const existing = await prisma.timesheet.findFirst({
    where: { userId: session.user.id, ticketKey, status: 'paused' },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) {
    const resumed = await prisma.timesheet.update({
      where: { id: existing.id },
      data: { startTime: new Date(), status: 'active' },
    })
    return NextResponse.json(resumed, { status: 200 })
  }

  const entry = await prisma.timesheet.create({
    data: {
      userId: session.user.id,
      ticketKey,
      ticketName: ticketName ?? null,
      startTime: new Date(),
      duration: 0,
      status: 'active',
    },
  })
  return NextResponse.json(entry, { status: 201 })
}
