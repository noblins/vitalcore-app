import { createClient } from '@supabase/supabase-js'

// Public credentials — protected by RLS, ok to ship with the bundle.
// Configure via VITE_SUPABASE_* env vars in Vercel for staging / domain swap.
const FALLBACK_URL = 'https://mnzvexnaemdetznxeeuo.supabase.co'
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uenZleG5hZW1kZXR6bnhlZXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjQxMTksImV4cCI6MjA5MDIwMDExOX0.3GizLSrEKjqrMeL88V1CNyHw9_L0f13t5SA_jk9REq0'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function getFreshToken(): Promise<string> {
  const { data } = await sb.auth.getSession()
  if (data?.session?.access_token) return data.session.access_token
  const { data: refreshed } = await sb.auth.refreshSession()
  return refreshed?.session?.access_token ?? ''
}

export const EDGE_URL = SUPABASE_URL + '/functions/v1'

/**
 * Calls an Edge Function with the user's JWT (default) or anonymously.
 *
 * IMPORTANT: previously sent ANON_KEY as Bearer token, which meant
 * server-side functions couldn't identify the user. Now sends the user's JWT
 * by default; pass `auth: 'anon'` only for genuinely public endpoints.
 */
export async function callEdge(
  path: string,
  body: unknown,
  opts: { auth?: 'user' | 'anon' } = {}
): Promise<Response> {
  const auth = opts.auth ?? 'user'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  }

  if (auth === 'user') {
    const token = await getFreshToken()
    if (!token) {
      throw new Error('Session expirée — reconnectez-vous')
    }
    headers['Authorization'] = `Bearer ${token}`
  } else {
    headers['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`
  }

  return fetch(`${EDGE_URL}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}
