'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
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
  const [visible, setVisible] = useState(false)
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

  const bgStyle = {
    background: 'linear-gradient(135deg, #EEF4FF 0%, #F4F4F6 60%)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  }

  if (status === 'loading' || status === 'authenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <>
      {/*
        #qa-login-card has ID specificity (1-0-0) which beats
        .dark .bg-white and .dark input (0-x-x) in globals.css,
        so !important here wins without touching globals.css.
      */}
      <style>{`
        #qa-login-card {
          background-color: white !important;
          border: 1px solid #E5E7EB !important;
        }
        #qa-login-card .ql-label { color: #374151 !important; }
        #qa-login-card .ql-title { color: #111827 !important; }
        #qa-login-card .ql-muted { color: #9CA3AF !important; }
        #qa-login-card input {
          background-color: white !important;
          color: #111827 !important;
          border: 1px solid #D1D5DB !important;
          border-radius: 8px !important;
          padding: 10px 12px !important;
          width: 100% !important;
          font-size: 0.875rem !important;
          outline: none !important;
          box-shadow: none !important;
          transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
        }
        #qa-login-card input:focus {
          border-color: #1A56DB !important;
          box-shadow: 0 0 0 3px rgba(26,86,219,0.15) !important;
        }
        #qa-login-card input::placeholder {
          color: #9CA3AF !important;
        }
      `}</style>

      <main className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        {/* Decorative blurred circles */}
        <div style={{ position:'absolute', borderRadius:'50%', pointerEvents:'none', width:360, height:360, background:'rgba(99,131,219,0.18)', filter:'blur(64px)', top:-100, left:-100 }} />
        <div style={{ position:'absolute', borderRadius:'50%', pointerEvents:'none', width:280, height:280, background:'rgba(160,185,255,0.22)', filter:'blur(56px)', bottom:-80, right:-80 }} />
        <div style={{ position:'absolute', borderRadius:'50%', pointerEvents:'none', width:200, height:200, background:'rgba(200,215,255,0.26)', filter:'blur(48px)', top:'50%', left:'62%' }} />

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
            id="qa-login-card"
            className="p-8"
            style={{
              borderRadius: 16,
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
              <span className="ql-title text-lg font-semibold">QA Assist</span>
              <p className="ql-muted text-xs">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="ql-label text-xs font-medium" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@bank.th"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="ql-label text-xs font-medium" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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

            <p className="ql-muted text-center text-xs mt-6">
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
