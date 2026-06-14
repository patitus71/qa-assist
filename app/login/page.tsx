'use client'

import { useState, useEffect, useRef, type FormEvent, type CSSProperties } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function roleDestination(role: string | undefined): string {
  if (role === 'ADMIN' || role === 'MANAGER') return '/admin'
  return '/dashboard'
}

function inputStyle(focused: boolean): CSSProperties {
  return {
    width: '100%',
    fontSize: '0.875rem',
    border: `1px solid ${focused ? '#1A56DB' : '#D1D5DB'}`,
    borderRadius: 8,
    padding: '10px 12px',
    background: 'white',
    outline: 'none',
    color: '#111827',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxShadow: focused ? '0 0 0 3px rgba(26,86,219,0.15)' : 'none',
  }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [shakeCount, setShakeCount] = useState(0)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const isExpired = searchParams.get('expired') === '1'

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      router.replace(roleDestination(session.user.role))
    }
  }, [status, session, router])

  useEffect(() => {
    if (shakeCount > 0 && errorRef.current) {
      errorRef.current.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 400, easing: 'ease' }
      )
    }
  }, [shakeCount])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error === 'AccountDisabled') {
        setError('Your account has been disabled. Contact an administrator.')
        setShakeCount(c => c + 1)
      } else if (result?.error) {
        setError('Invalid email or password.')
        setShakeCount(c => c + 1)
      } else {
        const s = await getSession()
        const dest = roleDestination(s?.user?.role)
        if (isExpired) {
          router.push('/session/generate?resume=1')
        } else {
          router.push(dest)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const bgStyle: CSSProperties = {
    background: 'linear-gradient(135deg, #C7D2FE 0%, #EEF4FF 50%, #F4F4F6 100%)',
    position: 'relative',
    overflow: 'hidden',
  }

  if (status === 'loading' || status === 'authenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>

      {/* Decorative circles */}
      <div style={{
        position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
        width: 360, height: 360,
        background: 'rgba(99,131,219,0.55)',
        filter: 'blur(72px)',
        top: -120, left: -120,
      }} />
      <div style={{
        position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
        width: 300, height: 300,
        background: 'rgba(130,160,255,0.26)',
        filter: 'blur(60px)',
        bottom: -80, right: -80,
      }} />
      <div style={{
        position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
        width: 220, height: 220,
        background: 'rgba(180,205,255,0.30)',
        filter: 'blur(52px)',
        top: '45%', left: '58%',
      }} />

      {/* Card wrapper — fade-in via state */}
      <div
        className="w-full flex flex-col gap-4"
        style={{
          maxWidth: 380,
          position: 'relative',
          zIndex: 1,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.38s ease, transform 0.38s ease',
        }}
      >
        {isExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-0.5">Session expired</p>
            <p className="text-xs text-amber-700">Your work was saved. Sign in to resume where you left off.</p>
          </div>
        )}

        <div
          className="bg-white p-8"
          style={{
            borderRadius: 16,
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 32px 0 rgba(13,13,14,0.10), 0 1px 4px 0 rgba(0,0,0,0.04)',
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 mb-8">
            <span
              className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center"
              style={{ boxShadow: '0 2px 10px rgba(26,86,219,0.30)' }}
            >
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
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                style={inputStyle(emailFocused)}
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
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                style={inputStyle(passwordFocused)}
              />
            </div>

            {error && (
              <p
                ref={errorRef}
                className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full btn-primary py-2.5 mt-1 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {loading && (
                <span
                  className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: 'white' }}
                />
              )}
              {loading ? 'Signing in…' : isExpired ? 'Sign in and resume' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs text-ink-400 mt-6">
            No account? Contact your administrator.
          </p>
        </div>
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
