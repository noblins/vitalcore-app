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

const GOAL_LABELS: Record<string, string> = {
  lose: 'perte de poids (déficit calorique)',
  gain: 'prise de masse (surplus calorique)',
  maintain: 'maintien du poids',
  health: 'santé générale',
};

// Generous daily cap (anti-abuse — app is free for everyone)
const DAILY_LIMIT = 15;
const MAX_DESCRIPTION_LEN = 500;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth (JWT obligatoire) ──────────────────────────────────────────────
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

    const { description } = await req.json();

    if (!description?.trim()) {
      return new Response(JSON.stringify({ error: 'Description requise' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (description.length > MAX_DESCRIPTION_LEN) {
      return new Response(JSON.stringify({ error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Daily cap (anti-abuse, all users) ───────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const [profileRes, dailyCountRes] = await Promise.all([
      sb.from('profiles')
        .select('tdee, goal, diet')
        .eq('id', user.id).single(),
      sb.from('ai_usage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('endpoint', 'analyze-ecart')
        .gte('created_at', `${today}T00:00:00`),
    ]);

    const profile = profileRes.data;

    if ((dailyCountRes.count ?? 0) >= DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: 'limit_reached', message: `Limite quotidienne de ${DAILY_LIMIT} analyses atteinte. Réessayez demain.` }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Données du jour : on lit côté serveur, pas client ───────────────────
    const { data: todayMeals } = await sb.from('meals')
      .select('calories')
      .eq('user_id', user.id)
      .eq('meal_date', today);

    const today_cal = (todayMeals ?? []).reduce((s: number, m: any) => s + (m.calories || 0), 0);
    const tdee = profile?.tdee || 2000;
    const goal = profile?.goal || 'maintain';
    const diet = profile?.diet || 'standard';

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI service unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const goalLabel = GOAL_LABELS[goal] || 'maintien du poids';
    const remaining = tdee - today_cal;

    const prompt = `Tu es un nutritionniste bienveillant. Un utilisateur souhaite faire un écart dans son régime.

Contexte utilisateur :
- Objectif journalier : ${tdee} kcal (objectif : ${goalLabel})
- Calories consommées aujourd'hui : ${today_cal} kcal
- Calories restantes aujourd'hui : ${remaining} kcal
- Régime : ${diet}

L'utilisateur veut manger : "${description.replace(/"/g, '\\"')}"

Analyse l'impact et réponds UNIQUEMENT avec un JSON valide (sans markdown) :
{
  "estimated_cal": <estimation calories de l'écart, entier>,
  "verdict": "ok" | "modere" | "important",
  "surplus_cal": <calories au-dessus de l'objectif journalier, peut être négatif si dans le budget>,
  "message_principal": "<phrase courte et bienveillante, max 80 chars>",
  "details": "<explication impact, 2-3 phrases, ton positif>",
  "conseil": "<1 conseil pratique et positif de compensation ou timing>",
  "macro_estimate": {"protein_g": <entier>, "carbs_g": <entier>, "fat_g": <entier>}
}

Règles :
- Ton bienveillant, non-culpabilisant. Un écart occasionnel est normal et sain.
- surplus_cal < 300 → verdict "ok"
- surplus_cal 300-600 → verdict "modere"
- surplus_cal > 600 → verdict "important"
- Si surplus_cal <= 0 : verdict forcément "ok"
- Conseil pratique : marche, repas plus léger demain, timing, etc.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      // Log pour debug, mais ne renvoie pas le détail au client
      console.error('Claude error:', response.status, await response.text());
      return new Response(JSON.stringify({ error: `AI error (${response.status})` }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    let analysis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      return new Response(JSON.stringify({ error: 'Réponse invalide' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Log usage (pour rate limit) ─────────────────────────────────────────
    await sb.from('ai_usage_logs').insert({
      user_id: user.id,
      endpoint: 'analyze-ecart',
    });

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('analyze-ecart error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
