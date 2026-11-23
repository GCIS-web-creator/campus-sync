import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createECDH } from "node:crypto";
import { POST as earthquakes } from "./earthquakes.ts";
import { POST as weatherAlerts } from "./weather-alerts.ts";
import { POST as pushDispatch } from "./push-dispatch.ts";
import { POST as pushReminders } from "./push-reminders.ts";
import { POST as lightningWatch } from "./lightning-watch.ts";

type Handler = (request: Request) => Promise<Response>;

const handlers: Record<string, Handler> = {
  earthquakes,
  "weather-alerts": weatherAlerts,
  "push-dispatch": pushDispatch,
  "push-reminders": pushReminders,
  "lightning-watch": lightningWatch,
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ success: false, message: "POST only" }, { status: 405 });
  }

  const task = new URL(request.url).searchParams.get("task") || "";

  // Protected VAPID key rotation. The private key is written directly to Supabase Vault and never returned.
  if (task === "rotate-vapid" || task === "auth-check" || task === "config-check") {
    const expected = Deno.env.get("CRON_SECRET") || "";
    const received = request.headers.get("authorization") || "";
    if (!expected || received !== `Bearer ${expected}`) {
      return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (task === "auth-check") return Response.json({ success: true, authenticated: true });
    if (task === "rotate-vapid") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (!supabaseUrl || !serviceRoleKey) {
        return Response.json({ success: false, message: "Server configuration missing" }, { status: 503 });
      }
      const pair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
      const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
        return Response.json({ success: false, message: "Could not export VAPID key pair" }, { status: 500 });
      }
      const decode = (value: string) => {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
        return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
      };
      const encode = (value: Uint8Array) =>
        btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const publicBytes = new Uint8Array(65);
      publicBytes[0] = 4;
      publicBytes.set(decode(publicJwk.x), 1);
      publicBytes.set(decode(publicJwk.y), 33);
      const publicKey = encode(publicBytes);
      const privateKey = privateJwk.d;
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin.rpc("campussync_store_vapid_credentials", {
        p_public_key: publicKey,
        p_private_key: privateKey,
      });
      if (error || data !== true) {
        console.error("VAPID Vault rotation failed:", error?.message || "RPC returned false");
        return Response.json({ success: false, message: "VAPID credentials could not be stored" }, { status: 500 });
      }
      return Response.json({
        success: true,
        publicKey,
        privateKeyStoredInVault: true,
      });
    }
    const slots = [1, 2, 3, 4, 5].filter(slot =>
      Boolean(Deno.env.get(`LINE_CHANNEL_SECRET_${slot}`) && Deno.env.get(`LINE_CHANNEL_ACCESS_TOKEN_${slot}`))
    );
    return Response.json({
      success: true,
      supabaseUrlConfigured: Boolean(Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")),
      serviceRoleConfigured: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
      vapidConfigured: Boolean((Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")) &&
        Deno.env.get("VAPID_PRIVATE_KEY") && Deno.env.get("VAPID_SUBJECT")),
      // Public key only: safe for comparing the browser subscription key without exposing private material.
      vapidPrivateKeyPresent: Boolean(Deno.env.get("VAPID_PRIVATE_KEY")),
      vapidPairMatches: (() => {
        try {
          const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") || "";
          const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
          if (!publicKey || !privateKey) return false;
          const ecdh = createECDH("prime256v1");
          ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
          return ecdh.getPublicKey(undefined, "uncompressed").toString("base64url") === publicKey;
        } catch { return false; }
      })(),
      lineCredentialSlots: slots,
      legacyLineConfigured: Boolean(Deno.env.get("LINE_CHANNEL_SECRET") && Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"))
    });
  }

  const handler = handlers[task];
  if (!handler) {
    return Response.json({ success: false, message: "Unknown CampusSync task" }, { status: 400 });
  }

  return await handler(request);
});
