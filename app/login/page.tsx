'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerdiktLogo } from '@/components/shared/VerdiktLogo'

export default function LoginPage() {
  const [email,    setEmail]    = useState('demo@verdikt.io')
  const [password, setPassword] = useState('verdikt2025')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const router                  = useRouter()
  const supabase                = createClient()

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/company')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: '#0D1117' }}
    >
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <VerdiktLogo size={48} />
          <h1 className="font-bold text-2xl" style={{ color: '#FFFFFF' }}>
            Verdikt
          </h1>
          <p className="text-sm text-center" style={{ color: '#6B7280' }}>
            Binary prediction markets · iGaming operator platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={signIn} className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: '#6B7280', letterSpacing: '0.08em' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                backgroundColor: '#161B22',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#FFFFFF',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: '#6B7280', letterSpacing: '0.08em' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{
                backgroundColor: '#161B22',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#FFFFFF',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: '#DC2626' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all"
            style={{
              backgroundColor: loading ? '#374151' : '#00C853',
              color: '#FFFFFF',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: '#374151' }}>
          Demo: demo@verdikt.io · verdikt2025
        </p>
      </div>
    </div>
  )
}
