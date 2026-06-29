'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// The splash sign-in card. Email/password only (our working demo cred is prefilled).
// No social / signup / forgot — those features don't exist, so no dead controls.
export function LoginForm() {
  const [email, setEmail]       = useState('demo@verdikt.io')
  const [password, setPassword] = useState('verdikt2025')
  const [show, setShow]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router                  = useRouter()
  const supabase                = createClient()

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message || 'Sign-in failed. Please try again.'); return }
    router.push('/player'); router.refresh()
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', margin: 0, color: '#0B1220' }}>
        Welcome to <span style={{ color: '#00C853' }}>VERDIKT</span>
      </h2>
      <p style={{ textAlign: 'center', fontSize: 14, color: '#64748B', margin: '6px 0 22px' }}>
        Log in to start predicting
      </p>

      <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={label}>Email</label>
          <div style={field}>
            <span style={icon} aria-hidden>✉</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="Enter your email" style={input} />
          </div>
        </div>

        <div>
          <label style={label}>Password</label>
          <div style={field}>
            <span style={icon} aria-hidden>🔒</span>
            <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Enter your password" style={input} />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 15, padding: '0 4px' }}>
              {show ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {error && <p style={{ color: '#DC2626', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          marginTop: 4, padding: '14px', borderRadius: 12, border: 'none',
          fontSize: 15, fontWeight: 800, color: '#04130B',
          cursor: loading ? 'wait' : 'pointer',
          background: loading ? '#CBD5E1' : 'linear-gradient(90deg, #00C853, #A8E80B)',
        }}>
          {loading ? 'Logging in…' : 'Log In'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 16 }}>
        Demo: demo@verdikt.io · verdikt2025
      </p>
    </div>
  )
}

const card: React.CSSProperties = {
  width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 24,
  boxShadow: '0 24px 60px rgba(15,23,42,0.10)', border: '1px solid #EEF2F6',
  padding: '36px 40px', boxSizing: 'border-box',
}
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: 8 }
const field: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, height: 52,
}
const icon: React.CSSProperties = { fontSize: 15, color: '#94A3B8', flexShrink: 0 }
const input: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent',
  fontSize: 14.5, color: '#0B1220', height: '100%', fontFamily: 'inherit',
}
