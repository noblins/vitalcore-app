import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let cachedWebhookSecret: string | null = null;

async function getWebhookSecret(sb: any): Promise<string> {
  if (cachedWebhookSecret) return cachedWebhookSecret;
  const { data } = await sb.from("app_config").select("value").eq("key", "stripe_webhook_secret").single();
  if (data && data.value) {
    const val = typeof data.value === "string" ? data.value : JSON.stringify(data.value);
    cachedWebhookSecret = val.replace(/^"|"$/g, "");
  }
  return cachedWebhookSecret || "";
}

// ── Stripe-style signature verification ───────────────────────────────────────
// Format: t=<timestamp>,v1=<signature>
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Reject events older than 5 minutes (replay protection)
  const eventAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (Number.isNaN(eventAge) || eventAge > 300 || eventAge < -60) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.text();
    const sigHeader = req.headers.get("stripe-signature") || "";
    const secret = await getWebhookSecret(sb);

    if (!secret) {
      console.error("Webhook secret not configured");
      return new Response("Misconfigured", { status: 500 });
    }

    const verified = await verifyStripeSignature(body, sigHeader, secret);
    if (!verified) {
      console.warn("Webhook signature verification failed");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(body);

    // Idempotency : enregistre l'event_id pour éviter les double-traitements
    const { data: existing } = await sb.from("stripe_events").select("id").eq("event_id", event.id).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ received: true, idempotent: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      // Defensive : prefer client_reference_id over metadata
      const userId = session.client_reference_id || session.metadata?.supabase_user_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (userId) {
        // Update profile via SECURITY DEFINER function (bypasses subscription lock trigger)
        await sb.rpc("set_user_premium", { p_user_id: userId, p_customer_id: customerId });

        await sb.from("subscriptions").upsert({
          user_id: userId,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          status: "active",
          plan: "premium",
          current_period_start: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const { data: profile } = await sb.from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile) {
        await sb.rpc("set_user_free", { p_user_id: profile.id });
        await sb.from("subscriptions").update({ status: "canceled" }).eq("user_id", profile.id);
      }
    }

    // Log event for idempotency + audit trail
    await sb.from("stripe_events").insert({
      event_id: event.id,
      event_type: event.type,
      payload: event,
    });

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
