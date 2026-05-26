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

const patchSchema = z.object({ name: z.string().min(1).max(80) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdminOrManager(session.user.role)) return forbidden()

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const squad = await prisma.squad.findUnique({ where: { id: params.id } })
  if (!squad) return NextResponse.json({ error: 'Squad not found' }, { status: 404 })

  const conflict = await prisma.squad.findUnique({ where: { name: parsed.data.name } })
  if (conflict && conflict.id !== params.id) {
    return NextResponse.json({ error: 'Squad name already exists' }, { status: 409 })
  }

  const updated = await prisma.squad.update({
    where: { id: params.id },
    data: { name: parsed.data.name },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'SQUAD_RENAMED',
      details: `id=${params.id}, ${squad.name}→${parsed.data.name}`,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdminOrManager(session.user.role)) return forbidden()

  const squad = await prisma.squad.findUnique({
    where: { id: params.id },
    include: { _count: { select: { members: true } } },
  })
  if (!squad) return NextResponse.json({ error: 'Squad not found' }, { status: 404 })

  if (squad._count.members > 0) {
    return NextResponse.json({ error: 'Cannot delete a squad that has members' }, { status: 400 })
  }

  await prisma.squad.delete({ where: { id: params.id } })

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: 'SQUAD_DELETED', details: `name=${squad.name}` },
  })

  return NextResponse.json({ ok: true })
}
