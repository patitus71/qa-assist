export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

const patchSchema = z.object({
  role: z.enum(['ADMIN', 'QA_LEAD', 'QA_ENGINEER', 'MANAGER']).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') return forbidden()

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (parsed.data.active === false && target.id === session.user.id) {
    return NextResponse.json({ error: 'Cannot disable your own account' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, active: true },
  })

  if (parsed.data.role !== undefined && parsed.data.role !== target.role) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ROLE_CHANGED',
        details: `email=${target.email}, role=${target.role}→${parsed.data.role}`,
      },
    })
  }

  if (parsed.data.active !== undefined && parsed.data.active !== target.active) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'USER_TOGGLED',
        details: `email=${target.email}, active=${parsed.data.active}`,
      },
    })
  }

  return NextResponse.json(updated)
}
