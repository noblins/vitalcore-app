import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://vitalcore-app.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let cachedStripeKey: string | null = null;
let cachedPriceId: string | null = null;

async function getConfig(sb: any, key: string): Promise<string> {
  const { data } = await sb.from("app_config").select("value").eq("key", key).single();
  if (data && data.value) {
    const val = typeof data.value === "string" ? data.value : JSON.stringify(data.value);
    return val.replace(/^"|"$/g, "");
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Stripe config (server-controlled) ───────────────────────────────────
    if (!cachedStripeKey) cachedStripeKey = await getConfig(sb, "stripe_secret_key");
    if (!cachedPriceId) cachedPriceId = await getConfig(sb, "stripe_price_premium");

    if (!cachedStripeKey || cachedStripeKey === "sk_test_REPLACE_ME" || !cachedPriceId) {
      console.error("Stripe not configured");
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing Stripe customer
    const { data: profile } = await sb.from("profiles")
      .select("stripe_customer_id, subscription_plan")
      .eq("id", user.id).single();

    // Already premium ? Block re-purchase
    if (profile?.subscription_plan === "premium") {
      return new Response(JSON.stringify({ error: "Already premium" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const custRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(cachedStripeKey + ":"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: user.email || "",
          "metadata[supabase_user_id]": user.id,
        }),
      });
      const custData = await custRes.json();
      if (custData.id) {
        customerId = custData.id;
        // SECURITY DEFINER RPC (trigger guard_profile_updates blocks direct UPDATE)
        await sb.rpc("set_stripe_customer_id", { p_user_id: user.id, p_customer_id: customerId });
      }
    }

    const successUrl = `${APP_URL}/dashboard?checkout=success`;
    const cancelUrl = `${APP_URL}/dashboard?checkout=cancel`;

    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": cachedPriceId,
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "metadata[supabase_user_id]": user.id,
      // CRITICAL: ensure Stripe knows which user (used by webhook)
      client_reference_id: user.id,
    });
    if (customerId) params.append("customer", customerId);

    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(cachedStripeKey + ":"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const sessionData = await sessionRes.json();

    if (sessionData.error) {
      console.error("Stripe error:", sessionData.error);
      return new Response(JSON.stringify({ error: "Payment provider error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: sessionData.url, session_id: sessionData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
