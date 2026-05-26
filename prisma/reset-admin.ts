// Reset admin password from the command line.
// Run: npx tsx prisma/reset-admin.ts
// Or:  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/reset-admin.ts

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import * as readline from 'readline'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@bank.th'

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const newPassword = await new Promise<string>(resolve => {
    rl.question(`New password for ${adminEmail}: `, answer => { rl.close(); resolve(answer) })
  })

  if (!newPassword || newPassword.length < 6) {
    console.error('Password must be at least 6 characters.')
    process.exit(1)
  }

  const passwordHash = await hash(newPassword, 12)
  await prisma.user.update({ where: { email: adminEmail }, data: { passwordHash } })
  console.log(`Password reset for ${adminEmail}.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
