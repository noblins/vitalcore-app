import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mnzvexnaemdetznxeeuo.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uenZleG5hZW1kZXR6bnhlZXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjQxMTksImV4cCI6MjA5MDIwMDExOX0.3GizLSrEKjqrMeL88V1CNyHw9_L0f13t5SA_jk9REq0'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function getFreshToken(): Promise<string> {
  const { data } = await sb.auth.refreshSession()
  return data?.session?.access_token ?? ''
}

export const EDGE_URL = SUPABASE_URL + '/functions/v1'
export const ANON_KEY = SUPABASE_ANON_KEY

export async function callEdge(path: string, body: unknown): Promise<Response> {
  return fetch(`${EDGE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
}
