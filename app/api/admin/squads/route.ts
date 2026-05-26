export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function isAdminOrManager(role: string) {
  return role === 'ADMIN' || role === 'MANAGER'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !isAdminOrManager(session.user.role)) return forbidden()

  const squads = await prisma.squad.findMany({
    include: { _count: { select: { members: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(squads)
}

const createSchema = z.object({ name: z.string().min(1).max(80) })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdminOrManager(session.user.role)) return forbidden()

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { name } = parsed.data
  const existing = await prisma.squad.findUnique({ where: { name } })
  if (existing) return NextResponse.json({ error: 'Squad name already exists' }, { status: 409 })

  const squad = await prisma.squad.create({ data: { name } })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: 'SQUAD_CREATED', details: `name=${name}` },
  })

  return NextResponse.json(squad, { status: 201 })
}
