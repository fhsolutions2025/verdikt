// Per-region compliance engine for the Marketing Department.
//
// Loads the region ruleset from mkt_compliance_regions and runs deterministic
// checks (docs/verdikt-marketing-agent/13-guardrails-compliance.md). Fails CLOSED:
// an unconfigured region or framing="blocked" returns a hard block. Reuses the IP
// guard (lib/promptGuard.ts) for creative/IP safety.

import { createServiceClient } from '@/lib/supabase/server'
import { checkPrompt } from '@/lib/promptGuard'

export type Verdict = 'pass' | 'warn' | 'block'

export interface Violation {
  rule:         string
  severity:     'low' | 'med' | 'high'
  excerpt:      string
  jurisdiction: string
  fix:          string
}

export interface ComplianceResult {
  verdict:            Verdict
  violations:         Violation[]
  requires_human:     boolean
  missing_disclaimers: string[]
  region:             string
}

interface RegionRow {
  region: string
  framing: string
  min_age: number
  rules: Record<string, unknown>
  mandatory_disclaimers: string[]
  human_approval: string
}

// High-severity gambling/financial claim patterns (block).
const GAMBLING_GUARANTEE = [
  /\bguarantee[ds]?\b/i, /\brisk[\s-]?free\b/i, /\bcan'?t lose\b/i, /\bcannot lose\b/i,
  /\bsure thing\b/i, /\beasy money\b/i, /\b100%\s*win\b/i, /\bguaranteed win\b/i,
]
const FINANCIAL_CLAIM = [
  /\bguaranteed returns?\b/i, /\bpassive income\b/i, /\binvestment opportunity\b/i,
  /\bget rich\b/i,
]
const MINOR_TARGETING = [
  /\bfor kids\b/i, /\bchildren\b/i, /\bunder[\s-]?18\b/i, /\bteenagers?\b/i,
]

function collectText(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(collectText).join(' ')
  if (typeof content === 'object') return Object.values(content as Record<string, unknown>).map(collectText).join(' ')
  return String(content)
}

async function loadRegion(region: string): Promise<RegionRow | null> {
  try {
    const svc = await createServiceClient()
    const { data } = await svc
      .from('mkt_compliance_regions')
      .select('region, framing, min_age, rules, mandatory_disclaimers, human_approval')
      .eq('region', region)
      .eq('enabled', true)
      .maybeSingle()
    return (data as RegionRow | null) ?? null
  } catch {
    return null
  }
}

/**
 * Check an artifact's content against a region ruleset.
 * @param region    region code (e.g. "NG", "EU")
 * @param content   artifact content (string or jsonb object)
 * @param type      artifact type (blog|social|image|...) — image runs the IP guard
 */
export async function checkCompliance(
  region: string | null | undefined,
  content: unknown,
  type: string,
): Promise<ComplianceResult> {
  const reg = region ?? ''
  const row = reg ? await loadRegion(reg) : null

  // Fail closed: unconfigured region.
  if (!row) {
    return {
      verdict: 'block',
      violations: [{ rule: 'region.unconfigured', severity: 'high', excerpt: '', jurisdiction: reg || 'unknown',
        fix: 'Configure a compliance ruleset for this region before generating marketing.' }],
      requires_human: true, missing_disclaimers: [], region: reg || 'unknown',
    }
  }

  // Fail closed: blocked jurisdiction.
  if (row.framing === 'blocked') {
    return {
      verdict: 'block',
      violations: [{ rule: 'region.blocked', severity: 'high', excerpt: '', jurisdiction: reg,
        fix: 'Marketing is not permitted in this region.' }],
      requires_human: true, missing_disclaimers: [], region: reg,
    }
  }

  const text = collectText(content)
  const violations: Violation[] = []

  const scan = (patterns: RegExp[], rule: string, fix: string) => {
    for (const rx of patterns) {
      const m = text.match(rx)
      if (m) violations.push({ rule, severity: 'high', excerpt: m[0], jurisdiction: reg, fix })
    }
  }

  scan(GAMBLING_GUARANTEE, 'gambling_claims.guarantees',
    'Remove guarantee/“risk-free” language; betting outcomes are uncertain.')
  scan(FINANCIAL_CLAIM, 'financial_claims',
    'Remove investment/returns framing; this is not an investment product.')
  scan(MINOR_TARGETING, 'targeting_minors',
    'Remove minor-appealing language; audience must be of legal age.')

  // IP / brand-safety guard (reuse the page-asset guard), strongest on creatives.
  const ip = checkPrompt(text)
  if (!ip.ok) {
    violations.push({ rule: 'copyright_ip', severity: type === 'image' ? 'high' : 'med',
      excerpt: '', jurisdiction: reg, fix: ip.reason ?? 'Keep imagery/claims generic; avoid real logos, teams, or people.' })
  }

  // Mandatory disclaimers (text artifacts must carry them).
  const missing: string[] = []
  if (type !== 'image') {
    const lower = text.toLowerCase()
    for (const d of row.mandatory_disclaimers ?? []) {
      if (d && !lower.includes(d.toLowerCase())) missing.push(d)
    }
  }

  const hasHigh = violations.some(v => v.severity === 'high')
  let verdict: Verdict = 'pass'
  if (hasHigh) verdict = 'block'
  else if (violations.length > 0 || missing.length > 0) verdict = 'warn'

  const requiresHuman =
    verdict !== 'pass' || row.human_approval === 'required_for_all'

  return { verdict, violations, requires_human: requiresHuman, missing_disclaimers: missing, region: reg }
}
