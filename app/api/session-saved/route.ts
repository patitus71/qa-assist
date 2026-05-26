export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// GET — latest unresmed saved session for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return forbidden()

  const saved = await prisma.savedSession.findFirst({
    where: { userId: session.user.id, resumed: false },
    orderBy: { savedAt: 'desc' },
  })
  if (!saved) return NextResponse.json(null)

  let parsed: unknown = null
  try { parsed = JSON.parse(saved.sessionData) } catch { /* ignore */ }

  return NextResponse.json({ ...saved, sessionData: parsed })
}

const saveSchema = z.object({
  ticketKey: z.string().optional(),
  sessionData: z.record(z.string(), z.unknown()),
})

// POST — upsert saved session
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return forbidden()

  const body = await req.json()
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { ticketKey, sessionData } = parsed.data

  // Keep only the most recent save per user+ticket
  await prisma.savedSession.deleteMany({
    where: {
      userId: session.user.id,
      ticketKey: ticketKey ?? null,
      resumed: false,
    },
  })

  const saved = await prisma.savedSession.create({
    data: {
      userId: session.user.id,
      ticketKey: ticketKey ?? null,
      sessionData: JSON.stringify(sessionData),
    },
  })
  return NextResponse.json(saved, { status: 201 })
}

const resumeSchema = z.object({ id: z.string() })

// PATCH — mark as resumed
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return forbidden()

  const body = await req.json()
  const parsed = resumeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const saved = await prisma.savedSession.findUnique({ where: { id: parsed.data.id } })
  if (!saved || saved.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.savedSession.update({ where: { id: parsed.data.id }, data: { resumed: true } })
  return NextResponse.json({ ok: true })
}
