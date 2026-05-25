// Phase 3: Replace credentials with Azure AD SSO
// NextAuth Azure provider — only change is the provider config
// All role/permission logic stays identical
// User sync: GET /api/admin/sync-jira to import users from Jira

import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import prisma from './prisma'
import type { NextAuthOptions, DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
    }
  }
  interface User {
    role: 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER'
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

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'MANAGER',
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
