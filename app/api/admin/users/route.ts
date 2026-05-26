export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hash } from 'bcryptjs'
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

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      squadId: true,
      squad: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'QA_LEAD', 'QA_ENGINEER', 'MANAGER']),
  password: z.string().min(6),
  squadId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdminOrManager(session.user.role)) return forbidden()

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { name, email, role, password, squadId } = parsed.data

  if (session.user.role === 'MANAGER' && role === 'ADMIN') {
    return NextResponse.json({ error: 'Managers cannot create Admin users' }, { status: 403 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, squadId: squadId || null },
    select: {
      id: true, name: true, email: true, role: true,
      active: true, createdAt: true, squadId: true,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'USER_CREATED',
      details: `name=${name}, email=${email}, role=${role}`,
    },
  })

  return NextResponse.json(user, { status: 201 })
}
