import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// reformas-notify — notifica por WhatsApp un nuevo lead de la demo de
// reformas, electricidad y fontaneria.
// El lead ya se inserta en leads_web desde el cliente
// (origen='demo-reformas-electricidad', sector='reformas-electricidad-fontaneria');
// esta funcion SOLO envia la notificacion WhatsApp via CallMeBot, manteniendo
// la apikey EXCLUSIVAMENTE server-side.
// Mismo patron que cerrajeros-notify / talleres-notify / estetica-notify.
//
// Secrets del proyecto (Supabase -> Edge Functions -> Secrets):
//   CALLMEBOT_APIKEY  — apikey de CallMeBot vinculada al numero de WhiteMoon
//   WA_NUMBER         — numero destino del aviso (por defecto 34643199580)
//
// El aviso va SIEMPRE al WhatsApp de WhiteMoon, nunca al del cliente.
//
// verify_jwt: false (se llama desde el navegador sin sesion; no expone secretos).
//
// Recibe (POST JSON): { nombre, telefono, servicio, zona, urgente, origen }

const DEFAULT_WA = "34643199580";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  const nombre = String(data.nombre ?? "").trim() || "-";
  const telefono = String(data.telefono ?? "").trim() || "-";
  const servicio = String(data.servicio ?? "").trim() || "-";
  const zona = String(data.zona ?? "").trim() || "-";
  const origen = String(data.origen ?? "demo-reformas-electricidad").trim() || "-";
  const urgente = data.urgente === true || String(data.urgente ?? "") === "true";

  const message =
    (urgente
      ? "URGENCIA — Electricidad/Fontaneria (demo Reformas)\n"
      : "Nuevo lead Reformas · Electricidad · Fontaneria (demo)\n") +
    `Nombre: ${nombre} | Tel: ${telefono}\n` +
    `Servicio: ${servicio}\n` +
    `Zona: ${zona}\n` +
    `Origen: ${origen}`;

  const notifyPhone = (Deno.env.get("WA_NUMBER") ?? DEFAULT_WA).trim();

  let notified = false;
  try {
    const callmebotKey = Deno.env.get("CALLMEBOT_APIKEY");
    if (callmebotKey) {
      const notifyUrl =
        `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(notifyPhone)}` +
        `&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(callmebotKey)}`;
      const r = await fetch(notifyUrl);
      notified = r.ok;
      if (!r.ok) {
        console.warn("[reformas-notify] CallMeBot fallo:", r.status);
      }
    } else {
      console.warn("[reformas-notify] sin CALLMEBOT_APIKEY, mensaje:", message);
    }
  } catch (e) {
    console.warn("[reformas-notify] error enviando WhatsApp:", e);
  }

  return json({ ok: true, notified });
});
