// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: DEFAULT_HEADERS,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: DEFAULT_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, message: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const pin = String(body?.pin ?? "");
    const limit = Math.min(100, Math.max(1, Number(body?.limit) || 50));

    const adminPin = Deno.env.get("ADMIN_PIN") || "";
    if (!adminPin) {
      return jsonResponse({ ok: false, message: "ADMIN_PIN no configurado" }, 500);
    }

    if (pin !== adminPin) {
      return jsonResponse({ ok: false, message: "PIN incorrecto" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: "Config faltante para leer feedback" }, 500);
    }

    const apiUrl = `${supabaseUrl}/rest/v1/feedback?select=id,kind,message,alias,page,user_agent,created_at&order=created_at.desc&limit=${limit}`;
    const feedbackResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!feedbackResponse.ok) {
      const text = await feedbackResponse.text();
      return jsonResponse(
        {
          ok: false,
          message: "No se pudieron cargar reportes",
          details: text || `HTTP ${feedbackResponse.status}`,
        },
        500
      );
    }

    const rows = await feedbackResponse.json();
    return jsonResponse({ ok: true, items: Array.isArray(rows) ? rows : [] }, 200);
  } catch (_error) {
    return jsonResponse({ ok: false, message: "Body inválido" }, 400);
  }
});
