import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// reformas-notify — notifica por Telegram un nuevo lead de la demo de
// reformas, electricidad y fontaneria (WHITEMOON-REFORMAS-ELECTRICIDAD).
// El lead ya se inserta en leads_web desde el cliente
// (origen='demo-reformas-electricidad'); esta funcion SOLO envia la
// notificacion via Telegram Bot API, manteniendo el token EXCLUSIVAMENTE
// server-side. Regla fija del proyecto: TODA demo con agente IA avisa por
// Telegram (regla-aviso-telegram.md). Mismo patron que mudanzas-notify.
//
// Recibe (POST JSON): { nombre, telefono, sector, servicio, zona, urgente, origen }.
//
// Secrets usados (nunca en cliente):
//   - TELEGRAM_BOT_TOKEN : token del bot de Telegram
//   - TELEGRAM_CHAT_ID   : chat destino del aviso
//
// Si el envio falla -> console.warn, nunca interrumpe nada.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const data = (payload.args ?? payload) as Record<string, unknown>;
  const nombre = String(data.nombre ?? "").trim();
  const telefono = String(data.telefono ?? "").trim();
  const sector = String(data.sector ?? "reformas-electricidad-fontaneria").trim();
  const servicio = String(data.servicio ?? "").trim();
  const zona = String(data.zona ?? "").trim();
  const origen = String(data.origen ?? "demo-reformas-electricidad").trim();
  const urgente = data.urgente === true || String(data.urgente ?? "") === "true";

  // Guard de lead incompleto — estandar WhiteMoon.
  if (!nombre || !telefono) {
    return json({ ok: false, error: "lead incompleto" }, 400);
  }

  const message =
    (urgente ? "🚨 URGENCIA" : "🔔 Nuevo lead") +
    ` (${origen}) · ${sector}\n` +
    `Nombre: ${nombre || "-"}\n` +
    `Teléfono: ${telefono || "-"}\n` +
    `Servicio: ${servicio || "-"}\n` +
    `Zona: ${zona || "-"}`;

  let notified = false;
  try {
    const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const tgChat = Deno.env.get("TELEGRAM_CHAT_ID");
    if (tgToken && tgChat) {
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChat, text: message }),
      });
      notified = r.ok;
      if (!r.ok) {
        console.warn("[reformas-notify] Telegram fallo:", r.status, await r.text());
      }
    } else {
      console.warn("[reformas-notify] sin TELEGRAM_BOT_TOKEN/CHAT_ID, mensaje:", message);
    }
  } catch (e) {
    console.warn("[reformas-notify] error enviando Telegram:", e);
  }

  return json({ ok: true, notified });
});
