export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// GET — active timesheet for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return forbidden()

  const active = await prisma.timesheet.findFirst({
    where: { userId: session.user.id, endTime: null },
    orderBy: { startTime: 'desc' },
  })
  return NextResponse.json(active ?? null)
}

const startSchema = z.object({ ticketKey: z.string().min(1) })

// POST — start timer
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'QA_ENGINEER') return forbidden()

  const body = await req.json()
  const parsed = startSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // Close any open timesheets for this user first
  const open = await prisma.timesheet.findMany({
    where: { userId: session.user.id, endTime: null },
  })
  for (const ts of open) {
    const duration = Math.round((Date.now() - ts.startTime.getTime()) / 60000)
    await prisma.timesheet.update({
      where: { id: ts.id },
      data: { endTime: new Date(), duration },
    })
  }

  const timesheet = await prisma.timesheet.create({
    data: {
      userId: session.user.id,
      ticketKey: parsed.data.ticketKey,
      startTime: new Date(),
    },
  })
  return NextResponse.json(timesheet, { status: 201 })
}

const stopSchema = z.object({ timesheetId: z.string() })

// PATCH — stop timer
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return forbidden()

  const body = await req.json()
  const parsed = stopSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const ts = await prisma.timesheet.findUnique({ where: { id: parsed.data.timesheetId } })
  if (!ts || ts.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (ts.endTime) return NextResponse.json(ts) // already stopped

  const duration = Math.round((Date.now() - ts.startTime.getTime()) / 60000)
  const updated = await prisma.timesheet.update({
    where: { id: parsed.data.timesheetId },
    data: { endTime: new Date(), duration },
  })
  return NextResponse.json(updated)
}
