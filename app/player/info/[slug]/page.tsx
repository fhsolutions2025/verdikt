import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MarkdownLite } from '@/lib/markdownLite'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'

export const dynamic = 'force-dynamic'

// Allowed CMS slugs surfaced from the player hamburger menu.
const SLUGS = new Set(['about', 'privacy', 'terms', 'support', 'rewards'])

interface Props {
  params: { slug: string }
}

export default async function InfoPage({ params }: Props) {
  if (!SLUGS.has(params.slug)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS only returns published rows.
  const { data: page } = await supabase
    .from('cms_pages')
    .select('slug, title, body, is_published')
    .eq('slug', params.slug)
    .single()

  if (!page) notFound()

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-[440px] mx-auto px-4 py-6">
        <h1 className="font-bold mb-4" style={{ fontSize: 22, color: 'var(--text-strong)' }}>
          {page.title}
        </h1>
        <article>
          <MarkdownLite body={page.body} />
        </article>
      </div>
      <PlayerTabBar active="markets" />
    </main>
  )
}
