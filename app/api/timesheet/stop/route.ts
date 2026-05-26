export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({ timesheetId: z.string() })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const ts = await prisma.timesheet.findUnique({ where: { id: parsed.data.timesheetId } })
  if (!ts || ts.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (ts.status === 'completed') return NextResponse.json(ts)

  const now = new Date()
  let finalDuration = ts.duration ?? 0
  if (ts.status === 'active') {
    finalDuration += Math.floor((now.getTime() - ts.startTime.getTime()) / 60000)
  }

  const updated = await prisma.timesheet.update({
    where: { id: ts.id },
    data: { endTime: now, duration: finalDuration, status: 'completed' },
  })
  return NextResponse.json(updated)
}
