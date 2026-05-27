import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { ALL_MENU_KEYS, DEFAULT_PERMISSIONS } from '@/lib/permissions'

export const runtime = 'nodejs'

// GET /api/admin/permissions
// Returns the full permission matrix for all non-ADMIN roles.
// Shape: { [role]: { [menuKey]: boolean } }
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const roles = ['QA_LEAD', 'QA_ENGINEER', 'MANAGER']
  const rows = await prisma.permission.findMany({
    where: { role: { in: roles } },
  })

  // Build a lookup: role → menuKey → enabled
  const lookup: Record<string, Record<string, boolean>> = {}
  for (const role of roles) {
    lookup[role] = {}
    // Start with defaults (in case DB is partial)
    const defaults = DEFAULT_PERMISSIONS[role] ?? [...ALL_MENU_KEYS]
    for (const key of ALL_MENU_KEYS) {
      lookup[role][key] = defaults.includes(key)
    }
  }
  // Override with DB values
  for (const row of rows) {
    if (lookup[row.role]) {
      lookup[row.role][row.menuKey] = row.enabled
    }
  }

  return NextResponse.json(lookup)
}

// PATCH /api/admin/permissions
// Body: { role: string, menuKey: string, enabled: boolean }
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { role, menuKey, enabled } = body as { role?: string; menuKey?: string; enabled?: boolean }

  if (!role || !menuKey || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // ADMIN permissions are immutable
  if (role === 'ADMIN') {
    return NextResponse.json({ error: 'Cannot modify ADMIN permissions' }, { status: 400 })
  }

  if (!(ALL_MENU_KEYS as readonly string[]).includes(menuKey)) {
    return NextResponse.json({ error: 'Unknown menuKey' }, { status: 400 })
  }

  const permission = await prisma.permission.upsert({
    where: { role_menuKey: { role, menuKey } },
    update: { enabled, updatedBy: session.user.id },
    create: { role, menuKey, enabled, updatedBy: session.user.id },
  })

  // Write audit log
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PERMISSION_CHANGE',
      details: `role=${role} menuKey=${menuKey} enabled=${enabled}`,
    },
  })

  return NextResponse.json(permission)
}
