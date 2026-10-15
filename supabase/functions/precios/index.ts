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
//   → { intradia: { AAPL: { t: [1792071000, …], c: [346.89, …] } }, usdmxn: { t: […], c: […] } }
// (t en segundos). Yahoo guarda unos 60 días de datos cada 5 minutos.

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

// Cómo se movió un símbolo un día, cada 5 minutos. Los huecos (minutos sin operaciones) se saltan.
async function intradiaYahoo(simbolo: string, dia: string): Promise<{ t: number[]; c: number[] } | null> {
  const desde = Math.floor(Date.parse(`${dia}T00:00:00Z`) / 1000);
  const hasta = desde + 30 * 3600;
  const r = await pedirYahoo(simbolo, `period1=${desde}&period2=${hasta}&interval=5m`);
  const tiempos: number[] = r?.timestamp ?? [];
  const cierres: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const t: number[] = [], c: number[] = [];
  tiempos.forEach((ts, k) => {
    const v = Number(cierres[k]);
    if (v > 0 && Number.isFinite(v)) { t.push(ts); c.push(Math.round(v * 10000) / 10000); }
  });
  return t.length ? { t, c } : null;
}
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

  const [precios, usdmxn] = await Promise.all([
    enTandas(tickers, async (t) => [t, await precioYahoo(t)] as const),
    entrada?.tipo_cambio ? precioYahoo("MXN=X") : Promise.resolve(null),
  ]);

  return responder({
    precios: Object.fromEntries(precios.filter(([, p]) => p !== null)),
    ...(usdmxn ? { usdmxn } : {}),
  });
});
