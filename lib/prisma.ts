import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

// Vercel serverless has a read-only filesystem except /tmp.
// Prisma resolves file: URLs relative to the schema file (prisma/),
// so DATABASE_URL "file:./prisma/dev.db" → prisma/prisma/dev.db on disk.
// Copy it to /tmp so SQLite can write WAL/journal files at runtime.
function getRuntimeDbUrl(): string {
  const envUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  if (!process.env.VERCEL) return envUrl

  const tmpPath = '/tmp/qa-assist.db'
  if (!fs.existsSync(tmpPath)) {
    // Prisma resolves relative to schema dir, not CWD
    const candidates = [
      path.join(process.cwd(), 'prisma', 'prisma', 'dev.db'),
      path.join(process.cwd(), 'prisma', 'dev.db'),
    ]
    const src = candidates.find(p => fs.existsSync(p))
    if (src) fs.copyFileSync(src, tmpPath)
  }
  return `file:${tmpPath}`
}

function makePrisma() {
  return new PrismaClient({ datasources: { db: { url: getRuntimeDbUrl() } } })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const prisma = globalForPrisma.prisma ?? makePrisma()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
