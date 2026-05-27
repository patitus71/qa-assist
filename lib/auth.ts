// Phase 3: Replace credentials with Azure AD SSO
// NextAuth Azure provider — only change is the provider config
// All role/permission logic stays identical
// User sync: GET /api/admin/sync-jira to import users from Jira

import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import prisma from './prisma'
import type { NextAuthOptions, DefaultSession } from 'next-auth'
import { ALL_MENU_KEYS, DEFAULT_PERMISSIONS } from './permissions'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
      permissions: string[]
    }
  }
  interface User {
    role: 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
    permissions: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
    permissions: string[]
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        const isValid = await compare(credentials.password, user.passwordHash)
        if (!isValid) return null

        if (!user.active) throw new Error('AccountDisabled')

        // Load permissions from DB and embed in the JWT.
        // ADMIN always gets all keys (not stored in DB).
        // Other roles fall back to defaults if no rows exist (fail-open).
        let permissions: string[]
        if (user.role === 'ADMIN') {
          permissions = [...ALL_MENU_KEYS]
        } else {
          const dbPerms = await prisma.permission.findMany({
            where: { role: user.role },
          })
          if (dbPerms.length === 0) {
            permissions = DEFAULT_PERMISSIONS[user.role] ?? [...ALL_MENU_KEYS]
          } else {
            permissions = dbPerms.filter(p => p.enabled).map(p => p.menuKey)
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER',
          permissions,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 60,  // 30-minute inactivity timeout
    updateAge: 0,     // reset expiry on every request
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.permissions = user.permissions
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.permissions = token.permissions ?? []
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
