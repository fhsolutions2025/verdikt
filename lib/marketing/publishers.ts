// Channel publishers (VERDIKT Marketing Studio § Publishing).
//
// A publisher adapter turns an approved asset into a live placement on a channel.
// The Home Carousel is fully live (writes promo_banners shown on the player). External
// social channels (Instagram/Meta/LinkedIn/X) require per-tenant OAuth tokens + the
// platform Graph APIs, which are not configured here — so they are declared but report
// `requiresCredentials`, and publishing to them records an export rather than a live
// post until the integration credentials are supplied. This keeps the contract honest:
// the wiring is real, only the external API tokens are missing.

export type PublishMode = 'live' | 'export'

export interface ChannelDescriptor {
  channel: string
  label: string
  mode: PublishMode
  requiresCredentials: boolean
  accepts: ('image' | 'carousel' | 'video' | 'social' | 'copy')[]
  note?: string
}

export const CHANNELS: ChannelDescriptor[] = [
  { channel: 'home_carousel', label: 'Player Home Carousel', mode: 'live', requiresCredentials: false, accepts: ['image', 'carousel'] },
  { channel: 'instagram', label: 'Instagram', mode: 'export', requiresCredentials: true, accepts: ['image', 'carousel', 'video', 'social'], note: 'Connect a Meta token to post live.' },
  { channel: 'facebook', label: 'Facebook', mode: 'export', requiresCredentials: true, accepts: ['image', 'carousel', 'video', 'social'], note: 'Connect a Meta token to post live.' },
  { channel: 'x', label: 'X / Twitter', mode: 'export', requiresCredentials: true, accepts: ['image', 'video', 'social'], note: 'Connect an X API token to post live.' },
  { channel: 'linkedin', label: 'LinkedIn', mode: 'export', requiresCredentials: true, accepts: ['image', 'video', 'social'], note: 'Connect a LinkedIn token to post live.' },
  { channel: 'export', label: 'Export only', mode: 'export', requiresCredentials: false, accepts: ['image', 'carousel', 'video', 'social', 'copy'] },
]

export function channelDescriptor(channel: string): ChannelDescriptor | undefined {
  return CHANNELS.find(c => c.channel === channel)
}

// Whether a channel can actually go live right now (has the integration + no missing creds).
export function isLiveChannel(channel: string): boolean {
  const d = channelDescriptor(channel)
  return !!d && d.mode === 'live' && !d.requiresCredentials
}

// ── Live external publish (token-gated) ───────────────────────────────────────
export interface ChannelConnection {
  channel: string
  account_id: string | null
  access_token: string | null
  status: string
}

export interface LivePublishResult { ok: boolean; ref?: string; error?: string }

// Publish an approved image asset live to a connected channel. Currently implements
// the Instagram Graph API (create media container → publish); other channels return
// "not implemented" so the caller falls back to an export record. Reached only when a
// `status:'connected'` connection with a token + account id exists — so the integration
// is dormant (no live posting) until the operator supplies real credentials.
export async function publishToChannel(
  conn: ChannelConnection, opts: { assetUrl: string; caption?: string },
): Promise<LivePublishResult> {
  if (conn.status !== 'connected' || !conn.access_token || !conn.account_id) {
    return { ok: false, error: 'channel not connected' }
  }
  if (conn.channel === 'instagram') return publishInstagram(conn, opts)
  return { ok: false, error: `live publish not implemented for ${conn.channel}` }
}

// Instagram Graph API image publish: POST /{ig-user-id}/media (image_url + caption)
// → creation_id → POST /{ig-user-id}/media_publish.
async function publishInstagram(
  conn: ChannelConnection, opts: { assetUrl: string; caption?: string },
): Promise<LivePublishResult> {
  const base = 'https://graph.facebook.com/v21.0'
  try {
    const createUrl = new URL(`${base}/${conn.account_id}/media`)
    createUrl.searchParams.set('image_url', opts.assetUrl)
    if (opts.caption) createUrl.searchParams.set('caption', opts.caption)
    createUrl.searchParams.set('access_token', conn.access_token as string)
    const createRes = await fetch(createUrl.toString(), { method: 'POST', signal: AbortSignal.timeout(30_000) })
    const created = await createRes.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!createRes.ok || !created.id) return { ok: false, error: created.error?.message ?? `IG container ${createRes.status}` }

    const pubUrl = new URL(`${base}/${conn.account_id}/media_publish`)
    pubUrl.searchParams.set('creation_id', created.id)
    pubUrl.searchParams.set('access_token', conn.access_token as string)
    const pubRes = await fetch(pubUrl.toString(), { method: 'POST', signal: AbortSignal.timeout(30_000) })
    const published = await pubRes.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!pubRes.ok || !published.id) return { ok: false, error: published.error?.message ?? `IG publish ${pubRes.status}` }
    return { ok: true, ref: published.id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
