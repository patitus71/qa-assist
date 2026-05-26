export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'all'  // today | week | all

  const now = new Date()
  let from: Date | undefined

  if (filter === 'today') {
    from = new Date(now)
    from.setHours(0, 0, 0, 0)
  } else if (filter === 'week') {
    from = new Date(now)
    from.setDate(now.getDate() - now.getDay())
    from.setHours(0, 0, 0, 0)
  }

  const entries = await prisma.timesheet.findMany({
    where: {
      userId: session.user.id,
      ...(from ? { createdAt: { gte: from } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  // For active entries add live elapsed to duration for accurate totals
  const enriched = entries.map(e => {
    let liveDuration = e.duration ?? 0
    if (e.status === 'active') {
      liveDuration += Math.floor((now.getTime() - e.startTime.getTime()) / 60000)
    }
    return { ...e, liveDuration }
  })

  return NextResponse.json(enriched)
}
