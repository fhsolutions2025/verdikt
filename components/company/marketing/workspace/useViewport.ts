'use client'

// WS-7 — responsive breakpoints for the five-region workspace (interaction map §15).
//   desktop ≥ 1180 : full five regions
//   tablet  820–1179: Campaign Explorer collapses, Sidebar → icons
//   mobile  < 820  : Director primary; Explorer/Inspector open as sheets, no 5-col stack

import React from 'react'

export type Viewport = 'desktop' | 'tablet' | 'mobile'

export function useViewport(): Viewport {
  const [vp, setVp] = React.useState<Viewport>('desktop')
  React.useEffect(() => {
    const compute = (): Viewport => {
      const w = window.innerWidth
      if (w < 820) return 'mobile'
      if (w < 1180) return 'tablet'
      return 'desktop'
    }
    const onResize = () => setVp(compute())
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vp
}
