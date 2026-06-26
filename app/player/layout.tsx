import { ChatWidget } from '@/components/shared/ChatWidget'
import { PageAssetsProvider } from '@/components/shared/PageAssets'
import { getActivePageAssets } from '@/lib/pageAssetsServer'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const assets = await getActivePageAssets()
  return (
    <PageAssetsProvider assets={assets}>
      {children}
      {/* Vega assistant — theme/skin-agnostic, present in every theme. */}
      <ChatWidget agentType="player" />
    </PageAssetsProvider>
  )
}
