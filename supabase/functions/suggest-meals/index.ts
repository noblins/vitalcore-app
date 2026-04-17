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

async function getAnthropicKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const sb = createClient(supabaseUrl, supabaseServiceKey);
  const { data } = await sb.from('app_config').select('value').eq('key', 'anthropic_api_key').single();
  if (data) {
    const val = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
    cachedApiKey = val.replace(/^\"|\"$/g, '');
  }
  return cachedApiKey || '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { meal_type, target_cal, liked_foods = [], disliked_foods = [], exclude_names = [], count = 3 } = await req.json();

    const apiKey = await getAnthropicKey();
    if (!apiKey) return new Response(JSON.stringify({ error: 'Clé API non configurée' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const mealTypeLabel: Record<string, string> = {
      breakfast: 'petit-déjeuner',
      lunch: 'déjeuner',
      snack: 'collation',
      dinner: 'dîner',
    };
    const label = mealTypeLabel[meal_type] || meal_type;

    const likedPart = liked_foods.length > 0 ? `\nAliments appréciés: ${liked_foods.join(', ')}` : '';
    const dislikedPart = disliked_foods.length > 0 ? `\nAliments non appréciés: ${disliked_foods.join(', ')}` : '';
    const excludePart = exclude_names.length > 0 ? `\nNe pas proposer: ${exclude_names.join(', ')}` : '';

    const prompt = `Tu es un nutritionniste expert. Propose exactement ${count} idées d'aliments/plats pour le ${label} avec un objectif de ${target_cal} kcal pour ce repas.${likedPart}${dislikedPart}${excludePart}

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni texte autour:
{"suggestions":[{"name":"Nom","emoji":"🍳","description":"Description courte","calories":350,"protein_g":25,"carbs_g":30,"fat_g":10}]}

Règles: calories ±20% de ${target_cal}, macros cohérentes, noms en français.`;

    // Retry up to 3 times on 529 (overloaded) with exponential backoff
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
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (response.status !== 529) break;
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 0;
      const err = await response?.text() ?? '';
      const msg = status === 529
        ? 'Le service IA est temporairement surchargé. Réessayez dans quelques secondes.'
        : `Erreur Claude (${status})`;
      return new Response(JSON.stringify({ error: msg, detail: err }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    let parsed: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      return new Response(JSON.stringify({ error: 'Réponse invalide', raw: rawText }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, suggestions: parsed.suggestions ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? 'Erreur interne' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
