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
    cachedApiKey = val.replace(/^\"|\"$/g, '');
  }
  return cachedApiKey || '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { image_base64, media_type } = await req.json();
    if (!image_base64) return new Response(JSON.stringify({ error: 'No image' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Daily cap (anti-abuse — all users)
    const today = new Date().toISOString().slice(0, 10);
    const [profileRes, dailyCountRes] = await Promise.all([
      sb.from('profiles').select('diet, goal, tdee').eq('id', user.id).single(),
      sb.from('ai_usage_logs').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('endpoint', 'analyze-meal-photo')
        .gte('created_at', `${today}T00:00:00`),
    ]);
    const profile = profileRes.data;
    if ((dailyCountRes.count ?? 0) >= 20) {
      return new Response(JSON.stringify({ error: 'limit_reached', message: 'Limite quotidienne de scans atteinte (20/jour).' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const mType = media_type || 'image/jpeg';
    const systemPrompt = `Tu es un expert nutritionniste et diététicien spécialisé dans l'estimation visuelle des portions alimentaires.

CONTEXTE UTILISATEUR :
- Régime : ${profile?.diet || 'Standard'}
- Objectif : ${profile?.goal || 'health'}
- TDEE : ${profile?.tdee || 2000} kcal/jour

MÉTHODE D'ANALYSE :
1. Identifie chaque aliment visible dans l'image (légumes, féculents, protéines, sauces, garnitures…).
2. Estime les portions en grammes en utilisant des repères visuels : taille d'une assiette standard (24-28 cm), bol, verre, ustensiles.
3. Calcule les macros pour chaque composant à partir de tables nutritionnelles standard (Ciqual / USDA).
4. Additionne pour obtenir le total du repas.

RÈGLES :
- Sois RÉALISTE sur les portions visibles, ne sous-estime pas. Une assiette pleine = 400-700 kcal typiquement.
- N'oublie pas les sauces, huiles de cuisson, vinaigrettes — elles ajoutent significativement aux lipides.
- Confidence "high" si plat clairement identifiable + portions estimables ; "medium" si certains composants ambigus ; "low" si photo floue ou plat exotique.
- Si plusieurs plats visibles (ex: assiette + dessert), additionne tout.

RETOURNE UNIQUEMENT UN JSON VALIDE, AUCUN TEXTE AUTOUR :
{
  "food_name": "Nom descriptif court en français (ex: 'Saumon grillé, riz et légumes')",
  "calories": <entier total kcal>,
  "protein_g": <entier grammes>,
  "carbs_g": <entier grammes>,
  "fat_g": <entier grammes>,
  "fiber_g": <entier grammes>,
  "confidence": "high" | "medium" | "low",
  "details": "Décomposition : '120g saumon (~250kcal) + 150g riz (~195kcal) + 100g légumes (~30kcal) + 1cs huile (~90kcal)'",
  "suggestions": "Conseil nutritionnel personnalisé selon régime/objectif (max 1 phrase)"
}`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mType, data: image_base64 } },
            { type: 'text', text: 'Analyse ce repas en détaillant chaque composant visible et son poids estimé, puis donne les valeurs nutritionnelles totales en JSON.' }
          ]
        }]
      })
    });

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text();
      console.error('Claude Vision error:', errBody);
      return new Response(JSON.stringify({ error: 'AI Vision error', details: errBody }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const claudeData = await claudeResponse.json();
    const rawText: string = claudeData.content?.[0]?.text ?? '';

    // Parse JSON from response (handle markdown code blocks, leading text)
    let analysis: any;
    try {
      // Strip markdown code fences if present
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse Claude response:', rawText);
      analysis = {
        food_name: 'Plat non identifié',
        calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
        confidence: 'low',
        details: 'Impossible d\'extraire les valeurs nutritionnelles. Remplissez manuellement.',
        suggestions: '',
      };
    }

    // Defensive : coerce numeric fields, clamp to realistic ranges
    const num = (v: any, max: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : 0;
    };
    analysis.calories  = num(analysis.calories,  5000);
    analysis.protein_g = num(analysis.protein_g, 500);
    analysis.carbs_g   = num(analysis.carbs_g,   1000);
    analysis.fat_g     = num(analysis.fat_g,     500);
    analysis.fiber_g   = num(analysis.fiber_g,   200);
    if (!['high', 'medium', 'low'].includes(analysis.confidence)) {
      analysis.confidence = 'medium';
    }

    // Log usage for daily cap
    await sb.from('ai_usage_logs').insert({ user_id: user.id, endpoint: 'analyze-meal-photo' });

    return new Response(JSON.stringify({ success: true, analysis }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', details: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
