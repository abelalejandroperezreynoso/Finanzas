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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAXIMO_TICKERS = 80;
const ESPERA_MS = 7000;
// Los tickers como los escribe la app y como los entiende Yahoo: letras, números, punto y guion (BRK-B)
const TICKER_VALIDO = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

// El último precio de un símbolo según Yahoo. Prueba sus dos servidores: a veces uno contesta 429.
async function precioYahoo(simbolo: string): Promise<number | null> {
  for (const host of ["query1", "query2"]) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ESPERA_MS);
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        signal: control.signal,
      });
      if (!res.ok) continue;
      const datos = await res.json();
      const meta = datos?.chart?.result?.[0]?.meta;
      const precio = Number(meta?.regularMarketPrice);
      if (precio > 0 && Number.isFinite(precio)) return precio;
    } catch {
      // Sin respuesta a tiempo: se prueba el otro servidor
    } finally {
      clearTimeout(reloj);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  // deno-lint-ignore no-explicit-any
  let entrada: any;
  try {
    entrada = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido" }, 400);
  }

  const tickers = [...new Set((Array.isArray(entrada?.tickers) ? entrada.tickers : [])
    .map((t: unknown) => String(t ?? "").trim().toUpperCase())
    .filter((t: string) => TICKER_VALIDO.test(t)))].slice(0, MAXIMO_TICKERS) as string[];

  const [precios, usdmxn] = await Promise.all([
    Promise.all(tickers.map(async (t) => [t, await precioYahoo(t)] as const)),
    entrada?.tipo_cambio ? precioYahoo("MXN=X") : Promise.resolve(null),
  ]);

  return responder({
    precios: Object.fromEntries(precios.filter(([, p]) => p !== null)),
    ...(usdmxn ? { usdmxn } : {}),
  });
});
