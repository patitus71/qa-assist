import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { ALL_MENU_KEYS, DEFAULT_PERMISSIONS } from '@/lib/permissions'

export const runtime = 'nodejs'

// GET /api/my-permissions
// Returns the current user's effective permission keys from DB (always fresh).
// Used by Sidebar so permission changes are reflected without re-login.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json([], { status: 200 })
  }

  const { role } = session.user

  // ADMIN always has all permissions — don't store in DB
  if (role === 'ADMIN') {
    return NextResponse.json([...ALL_MENU_KEYS])
  }

  const dbPerms = await prisma.permission.findMany({
    where: { role },
  })

  if (dbPerms.length === 0) {
    // No rows yet — fall back to defaults (fail-open)
    return NextResponse.json(DEFAULT_PERMISSIONS[role] ?? [...ALL_MENU_KEYS])
  }

  return NextResponse.json(dbPerms.filter(p => p.enabled).map(p => p.menuKey))
}
