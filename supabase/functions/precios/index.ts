// Precios de respaldo desde Yahoo Finance, para cuando Finnhub no contesta.
//
// Yahoo no pide clave, pero no deja que un navegador le pregunte directo (no manda cabeceras CORS),
// así que la app le pregunta a través de esta función. Sólo lee precios públicos: no toca la base ni
// usa secretos. Pide la sesión del usuario (el JWT que Supabase revisa antes de llegar aquí), para
// que no sea un proxy abierto.
//
//   { tickers: ["AAPL", "BRK-B"], tipo_cambio: true }
//   → { precios: { AAPL: 341.94, "BRK-B": 527.7 }, usdmxn: 18.38 }
//
// Lo que no se encuentra no viene en la respuesta (ni con 0): la app sigue con su siguiente fuente.
//
// Con dia ("AAAA-MM-DD") da cómo se movió cada uno ese día, cada 5 minutos, para la vista Hoy:
//   { dia: "2026-10-15", tickers: ["AAPL"], tipo_cambio: true }
//   → { intradia: { AAPL: { t: [1792071000, …], c: [346.89, …], anterior: 342.96 } }, usdmxn: { t, c, anterior } }
// (t en segundos). Yahoo guarda unos 60 días de datos cada 5 minutos.
//
// Con desde y hasta, lo mismo para varios días, cada 30 minutos o cada hora (las curvas de 7 y 30 días):
//   { desde: "2026-10-23", hasta: "2026-10-29", intervalo: "30m", tickers: ["AAPL"], tipo_cambio: true }
// Yahoo guarda unos 60 días cada 30 minutos y unos 2 años cada hora.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
type Json = any;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAXIMO_TICKERS = 80;
const ESPERA_MS = 7000;
// Cuántas preguntas a Yahoo a la vez: todas juntas a veces contestaba 429 (demasiadas)
const A_LA_VEZ = 8;

async function enTandas<T, R>(lista: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(lista.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, lista.length) }, async () => {
    while (i < lista.length) {
      const k = i++;
      salida[k] = await fn(lista[k]);
    }
  }));
  return salida;
}

async function pedirYahoo(simbolo: string, consulta: string): Promise<Json | null> {
  for (const host of ["query1", "query2"]) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ESPERA_MS);
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?${consulta}`, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        signal: control.signal,
      });
      if (!res.ok) continue;
      const datos = await res.json();
      const resultado = datos?.chart?.result?.[0];
      if (resultado) return resultado;
    } catch {
      // Sin respuesta a tiempo: se prueba el otro servidor
    } finally {
      clearTimeout(reloj);
    }
  }
  return null;
}

// Cómo se movió un símbolo de un día a otro (o uno solo), cada 5 minutos o lo que diga el intervalo.
// Los huecos (minutos sin operaciones) se saltan. "anterior" es su cierre del día hábil anterior al
// primero, también de Yahoo: la vista Hoy mide contra él.
async function intradiaYahoo(simbolo: string, dia: string, hastaDia = dia, intervalo = "5m"): Promise<{ t: number[]; c: number[]; anterior?: number } | null> {
  const desde = Math.floor(Date.parse(`${dia}T00:00:00Z`) / 1000);
  const hasta = Math.floor(Date.parse(`${hastaDia}T00:00:00Z`) / 1000) + 30 * 3600;
  const r = await pedirYahoo(simbolo, `period1=${desde}&period2=${hasta}&interval=${intervalo}`);
  const tiempos: number[] = r?.timestamp ?? [];
  const cierres: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const t: number[] = [], c: number[] = [];
  tiempos.forEach((ts, k) => {
    const v = Number(cierres[k]);
    if (v > 0 && Number.isFinite(v)) { t.push(ts); c.push(Math.round(v * 10000) / 10000); }
  });
  const anterior = Number(r?.meta?.chartPreviousClose);
  return t.length ? { t, c, ...(anterior > 0 && Number.isFinite(anterior) ? { anterior } : {}) } : null;
}
const INTERVALOS_RANGO = ["30m", "60m"];
const MAXIMO_DIAS_RANGO = 45;

// Los tickers como los escribe la app y como los entiende Yahoo: letras, números, punto y guion (BRK-B)
const TICKER_VALIDO = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

// El último precio de un símbolo según Yahoo
async function precioYahoo(simbolo: string): Promise<number | null> {
  const r = await pedirYahoo(simbolo, "interval=1d&range=1d");
  const precio = Number(r?.meta?.regularMarketPrice);
  return precio > 0 && Number.isFinite(precio) ? precio : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  let entrada: Json;
  try {
    entrada = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido" }, 400);
  }

  const tickers = [...new Set((Array.isArray(entrada?.tickers) ? entrada.tickers : [])
    .map((t: unknown) => String(t ?? "").trim().toUpperCase())
    .filter((t: string) => TICKER_VALIDO.test(t)))].slice(0, MAXIMO_TICKERS) as string[];

  const dia = String(entrada?.dia ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    const [series, tc] = await Promise.all([
      enTandas(tickers, async (t) => [t, await intradiaYahoo(t, dia)] as const),
      entrada?.tipo_cambio ? intradiaYahoo("MXN=X", dia) : Promise.resolve(null),
    ]);
    return responder({
      intradia: Object.fromEntries(series.filter(([, x]) => x !== null)),
      ...(tc ? { usdmxn: tc } : {}),
    });
  }

  const desde = String(entrada?.desde ?? ""), hasta = String(entrada?.hasta ?? "");
  const intervalo = String(entrada?.intervalo ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && INTERVALOS_RANGO.includes(intervalo)) {
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
    if (!(dias >= 0 && dias <= MAXIMO_DIAS_RANGO)) return responder({ error: "Rango inválido" }, 400);
    const [series, tc] = await Promise.all([
      enTandas(tickers, async (t) => [t, await intradiaYahoo(t, desde, hasta, intervalo)] as const),
      entrada?.tipo_cambio ? intradiaYahoo("MXN=X", desde, hasta, intervalo) : Promise.resolve(null),
    ]);
    return responder({
      intradia: Object.fromEntries(series.filter(([, x]) => x !== null)),
      ...(tc ? { usdmxn: tc } : {}),
    });
  }

  const [precios, usdmxn] = await Promise.all([
    enTandas(tickers, async (t) => [t, await precioYahoo(t)] as const),
    entrada?.tipo_cambio ? precioYahoo("MXN=X") : Promise.resolve(null),
  ]);

  return responder({
    precios: Object.fromEntries(precios.filter(([, p]) => p !== null)),
    ...(usdmxn ? { usdmxn } : {}),
  });
});
