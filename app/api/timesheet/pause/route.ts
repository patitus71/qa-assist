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
  if (ts.status !== 'active') return NextResponse.json(ts)

  const addedMinutes = Math.floor((Date.now() - ts.startTime.getTime()) / 60000)
  const updated = await prisma.timesheet.update({
    where: { id: ts.id },
    data: {
      duration: (ts.duration ?? 0) + addedMinutes,
      status: 'paused',
    },
  })
  return NextResponse.json(updated)
}
