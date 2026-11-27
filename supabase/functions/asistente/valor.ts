// Valor justo de una empresa: varias estimaciones de distintas fuentes y su promedio. Cálculo puro (sin red).

export type Fuente = "analistas_yahoo" | "analistas_av" | "analistas_fmp" | "dcf_fmp" | "dcf_propio" | "graham";
export type Valor = { fuente: Fuente; valor: number; detalle?: Record<string, unknown> };

// El orden en que se enseñan (y el nombre que se ve). La lista está copiada en dashboard.html (NOMBRES_VALOR_JUSTO)
export const NOMBRES_FUENTE: Record<Fuente, string> = {
  analistas_yahoo: "Analistas · Yahoo",
  analistas_av: "Analistas · Alpha Vantage",
  analistas_fmp: "Analistas · FMP",
  dcf_fmp: "DCF · FMP",
  dcf_propio: "DCF propio",
  graham: "Graham",
};

const num = (x: unknown): number | null => {
  const n = Number(x);
  return x === null || x === undefined || x === "" || !Number.isFinite(n) ? null : n;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

// Número de Graham: √(22.5 × utilidad por acción × valor en libros por acción). Sin utilidades o con capital
// negativo no hay número
export function graham(eps: unknown, libros: unknown): number | null {
  const e = num(eps), b = num(libros);
  if (e === null || b === null || e <= 0 || b <= 0) return null;
  return r2(Math.sqrt(22.5 * e * b));
}

// Supuestos del DCF propio: 5 años creciendo como en los últimos 5 (entre 0 y 15 %), otros 5 bajando poco a poco
// hasta el crecimiento final, y lo que sigue a perpetuidad; todo descontado al 9 %
export const SUPUESTOS_DCF = { descuento: 0.09, final: 0.03, maximo: 0.15 };

// Flujo libre por acción de los últimos 12 meses y crecimiento de referencia (% de ventas y utilidades a 5 años)
export function dcfPropio(fcfPorAccion: unknown, crecimientos: unknown[]): { valor: number; crecimiento: number; fcf: number } | null {
  const fcf = num(fcfPorAccion);
  if (fcf === null || fcf <= 0) return null;
  const cs = crecimientos.map(num).filter((x): x is number => x !== null);
  const { descuento, final, maximo } = SUPUESTOS_DCF;
  const g = Math.min(maximo, Math.max(0, cs.length ? cs.reduce((t, x) => t + x, 0) / cs.length / 100 : final));
  let flujo = fcf, total = 0;
  for (let anio = 1; anio <= 10; anio++) {
    const ga = anio <= 5 ? g : g + (final - g) * ((anio - 5) / 5);
    flujo *= 1 + ga;
    total += flujo / (1 + descuento) ** anio;
  }
  total += (flujo * (1 + final)) / (descuento - final) / (1 + descuento) ** 10;
  return { valor: r2(total), crecimiento: Math.round(g * 1000) / 10, fcf: r2(fcf) };
}

// Precio objetivo de analistas o DCF: sólo un número positivo sirve
export function positivo(x: unknown): number | null {
  const n = num(x);
  return n !== null && n > 0 ? r2(n) : null;
}

export type Resumen = { promedio: number; minimo: number; maximo: number; fuentes: number; diferencia: number | null };

// Promedio, rango y cuánto está el promedio arriba (+) o abajo (−) del precio, en %
export function resumenValores(valores: { valor: number }[], precio: number | null): Resumen | null {
  const vs = valores.map((v) => v.valor).filter((v) => Number.isFinite(v) && v > 0);
  if (!vs.length) return null;
  const promedio = r2(vs.reduce((t, v) => t + v, 0) / vs.length);
  return {
    promedio,
    minimo: r2(Math.min(...vs)),
    maximo: r2(Math.max(...vs)),
    fuentes: vs.length,
    diferencia: precio && precio > 0 ? Math.round(((promedio - precio) / precio) * 1000) / 10 : null,
  };
}

// Dos familias que suelen discrepar: lo que esperan los analistas (precio objetivo a ~12 meses) y lo que dicen los
// modelos con los números de hoy (DCF y Graham)
export const esAnalistas = (f: string) => f.startsWith("analistas_");

// El texto para el asistente: ya escrito, para que el modelo no sume ni promedie
export function textoValorJusto(ticker: string, precio: number | null, valores: Valor[], faltan: string[]): string {
  const orden = Object.keys(NOMBRES_FUENTE) as Fuente[];
  const lista = [...valores].sort((a, b) => orden.indexOf(a.fuente) - orden.indexOf(b.fuente));
  const res = resumenValores(lista, precio);
  const lineas = [`${ticker}${precio ? ` · precio $${precio.toFixed(2)}` : ""}`];
  for (const v of lista) lineas.push(`- ${NOMBRES_FUENTE[v.fuente]}: $${v.valor.toFixed(2)}`);
  if (res) {
    lineas.push(`Promedio de ${res.fuentes}: $${res.promedio.toFixed(2)} (de $${res.minimo.toFixed(2)} a $${res.maximo.toFixed(2)})` +
      (res.diferencia === null ? "" : ` · ${Math.abs(res.diferencia)} % ${res.diferencia >= 0 ? "arriba" : "abajo"} del precio`));
    const tipos: [string, Valor[]][] = [["Analistas", lista.filter((v) => esAnalistas(v.fuente))], ["Modelos (DCF y Graham)", lista.filter((v) => !esAnalistas(v.fuente))]];
    for (const [nombre, deTipo] of tipos) {
      const r = resumenValores(deTipo, precio);
      if (r && r.fuentes < res.fuentes) {
        lineas.push(`${nombre}: $${r.promedio.toFixed(2)} (${r.fuentes})` +
          (r.diferencia === null ? "" : ` · ${Math.abs(r.diferencia)} % ${r.diferencia >= 0 ? "arriba" : "abajo"} del precio`));
      }
    }
  } else lineas.push("Sin valor justo de ninguna fuente.");
  if (faltan.length) lineas.push(`Sin dato: ${faltan.join("; ")}`);
  return lineas.join("\n");
}
