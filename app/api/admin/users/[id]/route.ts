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

const patchSchema = z.object({
  role: z.enum(['ADMIN', 'QA_LEAD', 'QA_ENGINEER', 'MANAGER']).optional(),
  active: z.boolean().optional(),
  squadId: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdminOrManager(session.user.role)) return forbidden()

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // MANAGER cannot modify ADMIN users or assign ADMIN role
  if (session.user.role === 'MANAGER') {
    if (target.role === 'ADMIN') {
      return NextResponse.json({ error: 'Managers cannot modify Admin users' }, { status: 403 })
    }
    if (parsed.data.role === 'ADMIN') {
      return NextResponse.json({ error: 'Managers cannot assign the Admin role' }, { status: 403 })
    }
  }

  // Cannot disable own account
  if (parsed.data.active === false && target.id === session.user.id) {
    return NextResponse.json({ error: 'Cannot disable your own account' }, { status: 400 })
  }

  // Last admin guard
  if (target.role === 'ADMIN') {
    const roleChangedAway = parsed.data.role !== undefined && parsed.data.role !== 'ADMIN'
    const deactivating = parsed.data.active === false
    if (roleChangedAway || deactivating) {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', active: true } })
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 })
      }
    }
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active
  if ('squadId' in parsed.data) updateData.squadId = parsed.data.squadId

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true, name: true, email: true, role: true,
      active: true, squadId: true,
    },
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

  if ('squadId' in parsed.data && parsed.data.squadId !== target.squadId) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SQUAD_ASSIGNED',
        details: `email=${target.email}, squadId=${parsed.data.squadId ?? 'none'}`,
      },
    })
  }

  return NextResponse.json(updated)
}
