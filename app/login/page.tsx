'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { signIn, getSession, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function roleDestination(role: string | undefined): string {
  if (role === 'ADMIN' || role === 'MANAGER') return '/admin'
  return '/dashboard'
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  const isExpired = searchParams.get('expired') === '1'

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
        setShakeKey(k => k + 1)
      } else if (result?.error) {
        setError('Invalid email or password.')
        setShakeKey(k => k + 1)
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

  if (status === 'loading' || status === 'authenticated') {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #EEF4FF 0%, #F4F4F6 60%)' }}
      >
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-6px); }
          40%       { transform: translateX(6px); }
          60%       { transform: translateX(-4px); }
          80%       { transform: translateX(4px); }
        }
        .login-card {
          animation: fadeIn 0.35s ease both;
        }
        .error-shake {
          animation: shake 0.4s ease;
        }
        .login-input {
          width: 100%;
          font-size: 0.875rem;
          border: 1px solid #D1D5DB;
          border-radius: 8px;
          padding: 10px 12px;
          background: white;
          outline: none;
          color: #111827;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .login-input:focus {
          border-color: #1A56DB;
          box-shadow: 0 0 0 3px rgba(26,86,219,0.15);
        }
        .login-input::placeholder {
          color: #9CA3AF;
        }
        .login-btn {
          width: 100%;
          background: #1A56DB;
          color: white;
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          padding: 10px 16px;
          margin-top: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .login-btn:hover:not(:disabled) {
          background: #1447BE;
        }
        .login-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .login-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>

      <main
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: 'linear-gradient(135deg, #EEF4FF 0%, #F4F4F6 60%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative blurred circles */}
        <div style={{
          position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
          width: 340, height: 340,
          background: 'rgba(99,131,219,0.18)',
          filter: 'blur(64px)',
          top: -100, left: -100,
        }} />
        <div style={{
          position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
          width: 280, height: 280,
          background: 'rgba(160,185,255,0.22)',
          filter: 'blur(56px)',
          bottom: -80, right: -80,
        }} />
        <div style={{
          position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
          width: 200, height: 200,
          background: 'rgba(200,215,255,0.28)',
          filter: 'blur(48px)',
          top: '50%', left: '62%',
        }} />

        <div className="w-full flex flex-col gap-4" style={{ maxWidth: 380, position: 'relative', zIndex: 1 }}>
          {isExpired && (
            <div className="bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3 text-sm text-amber-800">
              <p className="font-medium mb-0.5">Session expired</p>
              <p className="text-xs text-amber-700">Your work was saved. Sign in to resume where you left off.</p>
            </div>
          )}

          <div
            className="login-card bg-white p-8"
            style={{
              borderRadius: 16,
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 32px 0 rgba(13,13,14,0.09), 0 1px 4px 0 rgba(0,0,0,0.04)',
            }}
          >
            {/* Logo */}
            <div className="flex flex-col items-center gap-2 mb-8">
              <span
                className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center"
                style={{ boxShadow: '0 2px 10px rgba(26,86,219,0.28)' }}
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
                  className="login-input"
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
                  className="login-input"
                />
              </div>

              {error && (
                <p
                  key={shakeKey}
                  className="error-shake text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="login-btn"
              >
                {loading && (
                  <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
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
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
