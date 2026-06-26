import { createClient } from '@/lib/supabase/server'
import type { PageAsset } from '@/components/shared/PageAssets'

// Fetch all live page assets (RLS allows public read of is_active rows).
// Used by the player layout to hydrate <PageAssetsProvider>.
export async function getActivePageAssets(): Promise<PageAsset[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('page_assets')
      .select('slot_key, public_url, alt_text, width, height')
      .eq('is_active', true)
    if (error || !data) return []
    return data as PageAsset[]
  } catch {
    return []
  }
}
