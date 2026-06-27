// fal webhook signature verification (Ed25519).
//
// fal signs each webhook with Ed25519 and sends these headers:
//   x-fal-webhook-request-id, x-fal-webhook-user-id,
//   x-fal-webhook-timestamp, x-fal-webhook-signature (hex)
// The signed message is the newline-joined:
//   `${request_id}\n${user_id}\n${timestamp}\n${sha256_hex(rawBody)}`
// verified against fal's public keys (JWKS). Timestamp must be fresh (±5 min)
// to block replays. Reference: fal.ai webhooks docs.

import crypto from 'node:crypto'

const JWKS_URL = process.env.FAL_JWKS_URL ?? 'https://rest.fal.ai/.well-known/jwks.json'
const MAX_SKEW_SECONDS = 300

export interface FalWebhookHeaders {
  requestId?: string | null
  userId?: string | null
  timestamp?: string | null
  signatureHex?: string | null
}

export interface FalVerifyResult {
  valid: boolean
  reason?: string
  requestId?: string
  userId?: string
}

// Build the exact message fal signs.
export function buildSignedMessage(requestId: string, userId: string, timestamp: string, rawBody: string): Buffer {
  const bodyHash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return Buffer.from(`${requestId}\n${userId}\n${timestamp}\n${bodyHash}`, 'utf8')
}

// Turn a JWKS Ed25519 entry ({ kty:'OKP', crv:'Ed25519', x }) into a key object.
function jwkToKey(x: string) {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' })
}

// Verify a hex Ed25519 signature over `message` with any of the given public keys.
export function verifyEd25519(message: Buffer, signatureHex: string, keys: crypto.KeyObject[]): boolean {
  let sig: Buffer
  try { sig = Buffer.from(signatureHex, 'hex') } catch { return false }
  if (sig.length !== 64) return false
  for (const key of keys) {
    try { if (crypto.verify(null, message, key, sig)) return true } catch { /* try next */ }
  }
  return false
}

// JWKS fetch + 10-min cache. (The deployed app can reach fal; this container can't.)
let keyCache: { keys: crypto.KeyObject[]; at: number } = { keys: [], at: 0 }
export async function getFalPublicKeys(): Promise<crypto.KeyObject[]> {
  if (keyCache.keys.length && Date.now() - keyCache.at < 600_000) return keyCache.keys
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`JWKS fetch ${res.status}`)
  const j = await res.json() as { keys?: { x?: string }[] }
  const keys = (j.keys ?? []).filter(k => k.x).map(k => jwkToKey(k.x!))
  if (keys.length) keyCache = { keys, at: Date.now() }
  return keys
}

// Full verification. `keysOverride` lets tests inject a known key (no network).
export async function verifyFalWebhook(
  h: FalWebhookHeaders,
  rawBody: string,
  keysOverride?: crypto.KeyObject[],
): Promise<FalVerifyResult> {
  const { requestId, userId, timestamp, signatureHex } = h
  if (!requestId || !userId || !timestamp || !signatureHex) {
    return { valid: false, reason: 'missing signature headers' }
  }
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) {
    return { valid: false, reason: 'stale or invalid timestamp' }
  }
  const message = buildSignedMessage(requestId, userId, timestamp, rawBody)
  const keys = keysOverride ?? await getFalPublicKeys().catch(() => [])
  if (!keys.length) return { valid: false, reason: 'no public keys available' }
  return verifyEd25519(message, signatureHex, keys)
    ? { valid: true, requestId, userId }
    : { valid: false, reason: 'signature mismatch' }
}
