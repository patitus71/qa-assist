import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { compare } from 'bcryptjs'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: { email: true, role: true, active: true },
    })
    return NextResponse.json({
      ok: true,
      dbConnected: true,
      userCount: users.length,
      users,
      dbUrl: process.env.DATABASE_URL?.slice(0, 40) + '...',
    })
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      dbConnected: false,
      error: err instanceof Error ? err.message : String(err),
      dbUrl: process.env.DATABASE_URL?.slice(0, 40) + '...',
    }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { email, password } = await req.json()
  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return NextResponse.json({ ok: false, reason: 'user_not_found' })
    const isValid = await compare(password, user.passwordHash)
    return NextResponse.json({ ok: isValid, reason: isValid ? 'ok' : 'wrong_password' })
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      reason: 'error',
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
