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
