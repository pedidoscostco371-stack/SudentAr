// supabase/functions/enviar-email/index.ts
//
// Envía correos vía Resend desde el servidor.
// La API key de Resend vive como secret (RESEND_API_KEY), NUNCA en el cliente.
// Requiere una sesión de Supabase válida: no es un relay abierto de correo.
//
// Deploy:  supabase functions deploy enviar-email
// Secret:  supabase secrets set RESEND_API_KEY=re_xxx  EMAIL_FROM="SudentAr <no-reply@tudominio.mx>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Mientras no verifiques tu dominio en Resend, usa el sandbox:
//   onboarding@resend.dev  -> SOLO envía al email dueño de la cuenta Resend.
const DEFAULT_FROM = Deno.env.get("EMAIL_FROM") ?? "SudentAr <onboarding@resend.dev>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Método no permitido" }, 405);

  try {
    // 1) Exigir sesión válida (evita que la función sea un relay abierto)
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: "No autorizado" }, 401);

    // 2) Payload
    const { to, subject, html, from, reply_to } = await req.json();
    if (!to || !subject || !html) {
      return json({ error: "Faltan campos: to, subject, html" }, 400);
    }

    // 3) Enviar vía Resend (server-to-server: sin CORS y sin exponer la key)
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from ?? DEFAULT_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(reply_to ? { reply_to } : {}),
      }),
    });

    const result = await res.json();
    if (!res.ok) return json({ error: result.message ?? "Error de Resend", detail: result }, 502);
    return json({ ok: true, id: result.id });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
