export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = session.user.role
  if (role !== 'QA_LEAD' && role !== 'MANAGER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const squadId = searchParams.get('squadId')
  const filter = searchParams.get('filter') ?? 'today'

  // QA_LEAD can only view own squad
  if (role === 'QA_LEAD') {
    const viewer = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { squadId: true },
    })
    if (!viewer?.squadId) return NextResponse.json([])
    if (squadId && squadId !== viewer.squadId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const now = new Date()
  let from: Date
  if (filter === 'week') {
    from = new Date(now)
    from.setDate(now.getDate() - now.getDay())
    from.setHours(0, 0, 0, 0)
  } else {
    // default: today
    from = new Date(now)
    from.setHours(0, 0, 0, 0)
  }

  const members = await prisma.user.findMany({
    where: {
      role: 'QA_ENGINEER',
      active: true,
      ...(squadId ? { squadId } : role === 'QA_LEAD'
        ? { squad: { members: { some: { id: session.user.id } } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      timesheets: {
        where: { createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  const result = members.map(m => {
    const totalMinutes = m.timesheets.reduce((sum, ts) => {
      let d = ts.duration ?? 0
      if (ts.status === 'active') {
        d += Math.floor((now.getTime() - ts.startTime.getTime()) / 60000)
      }
      return sum + d
    }, 0)
    const active = m.timesheets.find(ts => ts.status === 'active')
    return {
      userId: m.id,
      name: m.name,
      totalMinutes,
      activeTicket: active?.ticketKey ?? null,
      activeTicketName: active?.ticketName ?? null,
    }
  })

  return NextResponse.json(result)
}
