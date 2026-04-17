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

const FREE_DAILY_LIMIT = 20;

const GOAL_LABELS: Record<string, string> = {
  lose: 'perdre du poids',
  maintain: 'maintenir son poids',
  gain: 'prendre du muscle',
  health: 'améliorer sa santé',
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'sédentaire',
  light: 'légèrement actif',
  moderate: 'modérément actif',
  active: 'actif',
  very_active: 'très actif',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    const { message } = await req.json();
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Empty message' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load user data in parallel ──────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    const [profileRes, historyRes, mealsRes, weightRes, fastRes, medRes, dailyCountRes] = await Promise.all([
      sb.from('profiles')
        .select('full_name, goal, tdee, weight_kg, target_weight_kg, diet, activity_level, subscription_plan')
        .eq('id', user.id).single(),
      sb.from('chat_messages')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      sb.from('meals')
        .select('food_name, calories, meal_type')
        .eq('user_id', user.id)
        .eq('meal_date', today),
      sb.from('weight_logs')
        .select('weight_kg, logged_date')
        .eq('user_id', user.id)
        .order('logged_date', { ascending: false })
        .limit(1).maybeSingle(),
      sb.from('fasting_sessions')
        .select('protocol, started_at, target_hours')
        .eq('user_id', user.id)
        .eq('completed', false).maybeSingle(),
      sb.from('medications')
        .select('medication_name, dose_current, dose_unit')
        .eq('user_id', user.id)
        .eq('active', true).maybeSingle(),
      sb.from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', `${today}T00:00:00`),
    ]);

    const profile = profileRes.data;
    const isPremium = profile?.subscription_plan === 'premium';

    // ── Free tier limit ─────────────────────────────────────────────────────
    if (!isPremium && (dailyCountRes.count ?? 0) >= FREE_DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build context ───────────────────────────────────────────────────────
    const name = profile?.full_name?.trim() || 'vous';
    const goalLabel = GOAL_LABELS[profile?.goal] || 'atteindre vos objectifs';
    const activityLabel = ACTIVITY_LABELS[profile?.activity_level] || profile?.activity_level || 'modéré';
    const currentWeight = weightRes.data?.weight_kg ?? profile?.weight_kg ?? '?';
    const targetWeight = profile?.target_weight_kg ?? '?';
    const tdee = profile?.tdee ?? 2000;

    const todayMeals = mealsRes.data ?? [];
    const totalCal = todayMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0);
    const mealsSummary = todayMeals.length > 0
      ? todayMeals.map((m: any) => `${m.meal_type}: ${m.food_name} (${m.calories} kcal)`).join(' | ')
      : 'Aucun repas enregistré';

    const fastInfo = fastRes.data
      ? `Jeûne ${fastRes.data.protocol} en cours (démarré ${new Date(fastRes.data.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, objectif ${fastRes.data.target_hours}h)`
      : 'Pas de jeûne actif';

    const glp1Info = medRes.data
      ? `Traitement GLP-1: ${medRes.data.medication_name} ${medRes.data.dose_current} ${medRes.data.dose_unit}`
      : '';

    const systemPrompt = `Tu es VitalCore Coach, un assistant santé et nutrition IA expert et bienveillant. Tu accompagnes ${name}.

PROFIL:
- Objectif: ${goalLabel}
- TDEE: ${tdee} kcal/jour | Régime: ${profile?.diet ?? 'Standard'} | Activité: ${activityLabel}
- Poids actuel: ${currentWeight} kg | Poids cible: ${targetWeight} kg${glp1Info ? `\n- ${glp1Info}` : ''}

AUJOURD'HUI (${today}):
- Calories: ${totalCal} / ${tdee} kcal consommées
- Repas: ${mealsSummary}
- Jeûne: ${fastInfo}

INSTRUCTIONS:
- Réponds TOUJOURS en français, de façon concise et encourageante (80-150 mots max)
- Utilise les données du profil pour personnaliser tes conseils
- Pour les questions sur calories/macros, base-toi sur le TDEE de l'utilisateur
- Sois direct, actionnable, positif — évite le jargon médical excessif
- Si l'utilisateur pose une question médicale sérieuse, recommande de consulter un médecin`;

    // ── Build message history for Claude ────────────────────────────────────
    // History is fetched in DESC order, reverse to get chronological
    const history = (historyRes.data ?? []).reverse();
    const claudeMessages = [
      ...history.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ];

    // ── Get API key ─────────────────────────────────────────────────────────
    const apiKey = await getAnthropicKey(sb);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Call Claude ─────────────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      return new Response(JSON.stringify({ error: 'AI error', details: errBody }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeRes.json();
    const reply: string = claudeData.content?.[0]?.text ?? 'Désolé, je n\'ai pas pu générer une réponse.';

    // ── Persist both messages ───────────────────────────────────────────────
    await sb.from('chat_messages').insert([
      { user_id: user.id, role: 'user', content: message },
      { user_id: user.id, role: 'assistant', content: reply },
    ]);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal error', details: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
