// Banned-terms guard for product/page imagery prompts.
//
// Page assets ship inside the product UI, so they carry real IP / right-of-
// publicity risk if a prompt steers Ideogram toward real logos, named brands,
// leagues, or recognisable people. This is a pragmatic (not exhaustive) blocklist
// that catches the common cases; the admin still reviews before an asset goes
// live. Marketing collateral is NOT guarded by this — only page_assets.

const BANNED_PATTERNS: { rx: RegExp; reason: string }[] = [
  { rx: /\b(logo|trademark|trademarked|branded|brand name)\b/i, reason: 'logos / trademarks' },
  { rx: /\b(jersey|kit|crest|emblem|team colou?rs)\b/i,         reason: 'team identifiers' },
  // Brands / leagues commonly requested for sports & crypto markets
  { rx: /\b(nike|adidas|puma|coca[- ]?cola|pepsi|red bull|emirates)\b/i, reason: 'commercial brands' },
  { rx: /\b(premier league|la ?liga|nba|nfl|fifa|uefa|ipl|cricket world cup|champions league)\b/i, reason: 'sports leagues / competitions' },
  { rx: /\b(real madrid|barcelona|manchester|chelsea|arsenal|lakers|warriors|chennai super kings|mumbai indians)\b/i, reason: 'named teams' },
  { rx: /\b(bitcoin logo|btc logo|ethereum logo|binance|coinbase)\b/i, reason: 'crypto brand marks' },
  // Real-person / likeness cues
  { rx: /\b(president|prime minister|senator|congressman|politician)\s+[A-Z][a-z]+/, reason: 'named real people' },
  { rx: /\b(portrait|likeness|face)\s+of\s+[A-Z][a-z]+/, reason: 'likeness of a real person' },
  { rx: /\b(messi|ronaldo|kohli|dhoni|lebron|trump|biden|modi|putin)\b/i, reason: 'named public figures' },
]

export interface GuardResult {
  ok:     boolean
  reason?: string
}

export function checkPrompt(prompt: string): GuardResult {
  const text = prompt ?? ''
  for (const { rx, reason } of BANNED_PATTERNS) {
    if (rx.test(text)) {
      return { ok: false, reason: `Prompt appears to reference ${reason}. Keep page imagery generic/abstract — no real logos, brands, teams, or people.` }
    }
  }
  return { ok: true }
}

// ── Quality-keyword cleanser ────────────────────────────────────────────────────
// Models like fal/FLUX produce worse, not better, output when prompts are stuffed
// with hollow "quality" tokens (8k, photorealistic, masterpiece, …). The
// prompt-optimizer sub-agent runs every generated prompt through this to strip them.
// This is a hygiene pass, NOT an IP guard — run checkPrompt() separately for safety.
const QUALITY_NOISE: RegExp[] = [
  /\b\d+\s*k\b/gi,                                   // 8k, 4 k, 16K
  /\b(ultra[\s-]?)?hd\b/gi,                          // hd, ultra-hd
  /\bphoto[\s-]?realistic\b/gi,
  /\bhyper[\s-]?realistic\b/gi,
  /\bphoto[\s-]?realism\b/gi,
  /\bultra[\s-]?detailed\b/gi,
  /\b(highly|super|extremely)\s+detailed\b/gi,
  /\bhigh(ly)?[\s-]?(quality|res(olution)?)\b/gi,
  /\bbest\s+quality\b/gi,
  /\bmasterpiece\b/gi,
  /\baward[\s-]?winning\b/gi,
  /\btrending\s+on\s+artstation\b/gi,
  /\bartstation\b/gi,
  /\boctane\s+render\b/gi,
  /\bunreal\s+engine\b/gi,
  /\bcinematic\s+lighting,?\s*$/gi,                  // trailing filler only
  /\b(sharp\s+)?focus\b/gi,
  /\bintricate\s+details?\b/gi,
  /\bvray\b/gi,
]

/** Strip empty "quality" keywords and tidy punctuation/whitespace. */
export function cleanseVisualPrompt(prompt: string): string {
  let out = prompt ?? ''
  for (const rx of QUALITY_NOISE) out = out.replace(rx, '')
  return out
    .replace(/\s*,\s*,+/g, ', ')   // collapse doubled commas left behind
    .replace(/\s{2,}/g, ' ')        // collapse whitespace
    .replace(/\s+([,.;])/g, '$1')   // no space before punctuation
    .replace(/(^[\s,;.]+)|([\s,;.]+$)/g, '')  // trim stray edge punctuation
    .trim()
}
