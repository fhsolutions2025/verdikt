'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'warning'

interface ToastItem {
  id:      number
  message: string
  type:    ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  let counter = 0

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2800)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastBubble key={t.id} {...t} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastBubble({ message, type }: Omit<ToastItem, 'id'>) {
  const config = {
    success: { bg: '#0A2A0A', border: '#00C853', text: '#00E676' },
    error:   { bg: '#2A0A0A', border: '#DC2626', text: '#FCA5A5' },
    warning: { bg: '#2A1A0A', border: '#E05C20', text: '#FCD34D' },
  }[type]

  return (
    <div
      className="px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl pointer-events-auto"
      style={{
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        color: config.text,
        animation: 'slide-up 220ms ease',
      }}
    >
      {message}
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
