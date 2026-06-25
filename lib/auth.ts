import { createClient, createServiceClient } from './supabase/server'
import type { User } from '@supabase/supabase-js'

export type Role = 'admin' | 'player'

export interface AuthContext {
  user: User | null
  role: Role | null
}

/**
 * Resolves the current user and their role. Role is read with the service
 * client to avoid the profiles-table RLS recursion that can otherwise return
 * null and silently downgrade an admin to a non-admin.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null }

  const service = await createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return { user, role: (data?.role as Role) ?? 'player' }
}

/** True when the current user is an authenticated admin. */
export async function isAdmin(): Promise<boolean> {
  const { role } = await getAuthContext()
  return role === 'admin'
}
