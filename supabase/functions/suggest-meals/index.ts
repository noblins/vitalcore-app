import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let cachedApiKey: string | null = null;

async function getAnthropicKey(sb: any): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const { data } = await sb.from('app_config').select('value').eq('key', 'anthropic_api_key').single();
  if (data) {
    const val = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
    cachedApiKey = val.replace(/^"|"$/g, '');
  }
  return cachedApiKey || '';
}

const FREE_DAILY_LIMIT = 10;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── JWT auth (CRITICAL — était absent) ──────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      meal_type, target_cal, liked_foods = [], disliked_foods = [],
      exclude_names = [], count = 3, diet = 'standard', goal = 'maintain',
    } = await req.json();

    // Validation des inputs
    if (!['breakfast','lunch','snack','dinner'].includes(meal_type)) {
      return new Response(JSON.stringify({ error: 'Invalid meal_type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isFinite(target_cal) || target_cal < 50 || target_cal > 3000) {
      return new Response(JSON.stringify({ error: 'Invalid target_cal' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const safeCount = Math.min(Math.max(parseInt(count) || 3, 1), 5);

    // ── Rate limit + check Premium en parallèle ─────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const [profileRes, dailyCountRes] = await Promise.all([
      sb.from('profiles')
        .select('subscription_plan')
        .eq('id', user.id).single(),
      sb.from('ai_usage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('endpoint', 'suggest-meals')
        .gte('created_at', `${today}T00:00:00`),
    ]);

    const isPremium = profileRes.data?.subscription_plan === 'premium';
    if (!isPremium && (dailyCountRes.count ?? 0) >= FREE_DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: 'limit_reached',
        message: `Limite gratuite ${FREE_DAILY_LIMIT} suggestions/jour atteinte.`,
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI service unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mealTypeLabel: Record<string, string> = {
      breakfast: 'petit-déjeuner',
      lunch: 'déjeuner',
      snack: 'collation',
      dinner: 'dîner',
    };
    const label = mealTypeLabel[meal_type];

    // Sanitize arrays — pas de prompt injection
    const sanitize = (arr: any[]) => arr.filter(Boolean).map(String).slice(0, 30).map(s => s.slice(0, 100));
    const safeLiked = sanitize(liked_foods);
    const safeDisliked = sanitize(disliked_foods);
    const safeExclude = sanitize(exclude_names);

    const likedPart = safeLiked.length > 0 ? `\nAliments appréciés: ${safeLiked.join(', ')}` : '';
    const dislikedPart = safeDisliked.length > 0 ? `\nAliments non appréciés: ${safeDisliked.join(', ')}` : '';
    const excludePart = safeExclude.length > 0 ? `\nNe pas proposer: ${safeExclude.join(', ')}` : '';

    const prompt = `Tu es un nutritionniste expert. Propose exactement ${safeCount} idées d'aliments/plats pour le ${label} avec un objectif de ${target_cal} kcal pour ce repas.
Régime: ${diet}. Objectif global: ${goal}.${likedPart}${dislikedPart}${excludePart}

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni texte autour:
{"suggestions":[{"name":"Nom","emoji":"🍳","description":"Description courte","calories":350,"protein_g":25,"carbs_g":30,"fat_g":10}]}

Règles: calories ±20% de ${target_cal}, macros cohérentes, noms en français.`;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (response.status !== 529) break;
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 0;
      console.error('Claude error:', status, await response?.text());
      const msg = status === 529
        ? 'Le service IA est temporairement surchargé. Réessayez dans quelques secondes.'
        : `Erreur Claude (${status})`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    let parsed: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      return new Response(JSON.stringify({ error: 'Réponse invalide' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log usage
    await sb.from('ai_usage_logs').insert({ user_id: user.id, endpoint: 'suggest-meals' });

    return new Response(JSON.stringify({ success: true, suggestions: parsed.suggestions ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('suggest-meals error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
