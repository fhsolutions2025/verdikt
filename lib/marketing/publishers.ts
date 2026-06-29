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
