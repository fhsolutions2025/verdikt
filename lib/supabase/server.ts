import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()          { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* ignore: called from Server Component */ }
        },
      },
    }
  )
}

// A genuine service-role client that bypasses RLS.
//
// IMPORTANT: do NOT build this on @supabase/ssr's createServerClient with the
// request cookies — that client uses the logged-in user's auth cookie as the
// Authorization bearer, so it runs as that user under RLS (the service-role key
// only lands in the apikey header and grants no bypass). That silently
// downgrades admins to non-admins and breaks every "service" query. Use the
// plain supabase-js client with no session/cookies so the service-role key is
// the bearer and RLS is bypassed.
export async function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
