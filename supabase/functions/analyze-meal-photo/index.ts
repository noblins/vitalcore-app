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

    // Check premium
    const { data: profile } = await sb.from('profiles').select('subscription_plan, diet, goal, tdee').eq('id', user.id).single();
    const isPremium = profile && profile.subscription_plan === 'premium';
    if (!isPremium) {
      return new Response(JSON.stringify({ error: 'Premium required', reply: 'L\'analyse photo est une fonctionnalite Premium.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const mType = media_type || 'image/jpeg';
    const systemPrompt = `Tu es un expert nutritionniste IA. Analyse cette photo de repas/aliment et retourne UNIQUEMENT un JSON valide (pas de texte autour) avec cette structure exacte:
{"food_name": "Nom du plat en francais", "calories": nombre, "protein_g": nombre, "carbs_g": nombre, "fat_g": nombre, "fiber_g": nombre, "confidence": "high/medium/low", "details": "Description courte du contenu detecte", "suggestions": "Conseil nutritionnel bref"}
Si tu ne peux pas identifier le plat, mets confidence a 'low' et estime au mieux. Regime de l'utilisateur: ${profile?.diet || 'Standard'}. Objectif: ${profile?.goal || 'health'}. TDEE: ${profile?.tdee || 2000} kcal.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mType, data: image_base64 } },
            { type: 'text', text: 'Analyse ce repas et donne-moi les valeurs nutritionnelles en JSON.' }
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
    const rawText = claudeData.content[0].text;

    // Parse JSON from response (handle markdown code blocks)
    let analysis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawText);
    } catch (e) {
      analysis = { food_name: 'Plat non identifie', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, confidence: 'low', details: rawText, suggestions: '' };
    }

    return new Response(JSON.stringify({ success: true, analysis }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', details: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
