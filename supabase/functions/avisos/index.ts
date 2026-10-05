// Avisos en el teléfono (notificaciones push), aunque la app esté cerrada.
//
//   accion "clave"  La app pide la clave pública (VAPID) para suscribir el teléfono.
//   accion "prueba" Configuración manda un aviso de prueba al teléfono de quien lo pide.
//   accion "enviar" La base de datos, desde su tarea programada de las 8:00, manda los avisos
//                   del día ya armados (a qué teléfono y qué texto). Esta función sólo los
//                   entrega: no lee ni toca la base, así que no necesita la service role.
//                   Se protege con un secreto compartido que vive en el Vault de la base y en
//                   los secretos de las funciones (AVISOS_SECRETO), nunca en el repositorio.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Json = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const publica = Deno.env.get("VAPID_PUBLIC") ?? "";
  const privada = Deno.env.get("VAPID_PRIVATE") ?? "";
  let entrada: Json;
  try {
    entrada = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido" }, 400);
  }

  if (entrada.accion === "clave") {
    if (!publica) return responder({ error: "Faltan configurar los avisos." }, 503);
    return responder({ clave: publica });
  }

  // Aviso de prueba desde Configuración: sólo al teléfono de quien lo pide, con sesión iniciada
  if (entrada.accion === "prueba") {
    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: sesion } = await sb.auth.getUser();
    if (!sesion?.user) return responder({ error: "Inicia sesión para probar los avisos." }, 401);
    if (!publica || !privada) return responder({ error: "Faltan las claves VAPID." }, 503);
    const s = entrada.suscripcion ?? {};
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return responder({ error: "Falta la suscripción del teléfono." }, 400);
    webpush.setVapidDetails(Deno.env.get("AVISOS_CONTACTO") ?? "mailto:avisos@finanzas.app", publica, privada);
    try {
      const r = await webpush.sendNotification(
        { endpoint: String(s.endpoint), keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } },
        JSON.stringify({ titulo: "Aviso de prueba", cuerpo: "Los avisos funcionan. El día que toque un pago te aviso a las 8:00.", url: "./index.html" }),
        { TTL: 600, urgency: "high" },
      );
      return responder({ status: r.statusCode });
    } catch (e) {
      return responder({ error: "No se pudo entregar el aviso.", status: (e as Json)?.statusCode ?? 0 }, 502);
    }
  }

  if (entrada.accion !== "enviar") return responder({ error: "Acción desconocida" }, 400);
  const secreto = Deno.env.get("AVISOS_SECRETO") ?? "";
  if (!secreto || req.headers.get("x-avisos-secreto") !== secreto) return responder({ error: "No autorizado" }, 401);
  if (!publica || !privada) return responder({ error: "Faltan las claves VAPID." }, 503);

  // Apple exige un contacto (mailto o https) en cada envío; no es el correo del usuario
  webpush.setVapidDetails(Deno.env.get("AVISOS_CONTACTO") ?? "mailto:avisos@finanzas.app", publica, privada);

  const avisos: Json[] = Array.isArray(entrada.avisos) ? entrada.avisos.slice(0, 50) : [];
  const resultados = await Promise.all(avisos.map(async (a: Json) => {
    try {
      const r = await webpush.sendNotification(
        { endpoint: String(a.endpoint), keys: { p256dh: String(a.p256dh), auth: String(a.auth) } },
        JSON.stringify({ titulo: String(a.titulo ?? "Finanzas").slice(0, 80), cuerpo: String(a.cuerpo ?? "").slice(0, 300), url: "./index.html" }),
        // Si el teléfono está apagado, el aviso se guarda hasta 12 horas; después ya no sirve
        { TTL: 12 * 3600, urgency: "high" },
      );
      return { endpoint: a.endpoint, status: r.statusCode };
    } catch (e) {
      // 404/410: el teléfono ya no tiene esa suscripción; la app la renueva al abrirse
      return { endpoint: a.endpoint, status: (e as Json)?.statusCode ?? 0 };
    }
  }));
  // Sólo cuántos salieron: los endpoints no se imprimen en los registros
  console.log(`Avisos: ${resultados.filter((r) => r.status >= 200 && r.status < 300).length} de ${resultados.length} entregados`);
  return responder({ resultados });
});
