import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@bank.th'
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123'

  const users = [
    { name: 'Admin', email: adminEmail, password: adminPassword, role: 'ADMIN' as const },
    { name: 'QA Lead', email: 'lead@bank.th', password: 'lead123', role: 'QA_LEAD' as const },
    { name: 'QA Engineer', email: 'engineer@bank.th', password: 'eng123', role: 'QA_ENGINEER' as const },
    { name: 'Manager', email: 'manager@bank.th', password: 'mgr123', role: 'MANAGER' as const },
  ]

  for (const u of users) {
    const passwordHash = await hash(u.password, 12)
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash, role: u.role, active: true },
    })
  }

  console.log('Seeded 4 users.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
