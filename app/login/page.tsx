'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Suspense } from 'react'

function roleDestination(role: string | undefined): string {
  return role === 'ADMIN' ? '/admin' : '/dashboard'
}

function LoginForm() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Already logged in → redirect immediately
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      router.replace(roleDestination(session.user.role))
    }
  }, [status, session, router])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error === 'AccountDisabled') {
        setError('Your account has been disabled. Contact an administrator.')
      } else if (result?.error) {
        setError('Invalid email or password.')
      } else {
        const s = await getSession()
        router.push(roleDestination(s?.user?.role))
      }
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || status === 'authenticated') {
    return (
      <main className="min-h-screen bg-[#F4F4F6] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F4F4F6] flex items-center justify-center p-4">
      <div
        className="w-full max-w-sm bg-white border border-ink-200 rounded-[12px] p-8"
        style={{ boxShadow: '0 4px 24px 0 rgba(13,13,14,0.08)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="white" />
            </svg>
          </span>
          <span className="text-lg font-semibold text-ink-900">QA Assist</span>
          <p className="text-xs text-ink-400">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full text-sm border border-ink-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-ink-300"
              placeholder="you@bank.th"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full text-sm border border-ink-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full btn-primary py-2.5 mt-1"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-ink-400 mt-6">
          No account? Contact your administrator.
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
