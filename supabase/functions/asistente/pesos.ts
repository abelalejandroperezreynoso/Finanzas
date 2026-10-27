// Porcentajes de cada subsector de una empresa, sacados de sus ventas por segmento (FMP, año fiscal).
// La "receta" dice a qué división va cada segmento del reporte ("Google Cloud" → "Tecnología › Cloud";
// vacío = no cuenta). Con ella el cálculo es una suma, sin IA, y se repite solo con cada reporte nuevo.
// Una división es "Sector › Subsector", o sólo "Sector" si ese sector no tiene subsectores.
// Cálculo puro (sin base ni red), para poder probarlo aparte.
import { periodosSegmentos } from "./empresa.ts";

// deno-lint-ignore no-explicit-any
type Json = any;

export const SEPARADOR = " › ";
export type Receta = Record<string, string>;
export type Pesos = Record<string, number>;

const limpio = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const clave = (x: unknown) => limpio(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const igual = (a: string, b: string) => clave(a) === clave(b);

// Las divisiones de una categoría: sus sectores propios y, en cada uno, sus subsectores
export function divisionesDe(c: Json): string[] {
  const sectores: string[] = Array.isArray(c?.sectores) ? c.sectores.map(limpio).filter(Boolean) : [];
  const subs = c?.subsectores && typeof c.subsectores === "object" && !Array.isArray(c.subsectores) ? c.subsectores : {};
  const lista: string[] = [];
  sectores.forEach((s) => {
    const llave = Object.keys(subs).find((k) => igual(k, s));
    const delSector = (llave && Array.isArray(subs[llave]) ? subs[llave] : []).map(limpio).filter(Boolean);
    if (delSector.length) delSector.forEach((x: string) => lista.push(`${s}${SEPARADOR}${x}`));
    else lista.push(s);
  });
  return [...new Set(lista)];
}

// La división escrita como la tiene la empresa ("tecnología › cloud" → "Tecnología › Cloud"), o null
export function divisionDe(texto: unknown, divisiones: string[]): string | null {
  const t = limpio(texto).replace(/\s*(›|>|\/)\s*/g, SEPARADOR);
  return divisiones.find((d) => igual(d, t)) ?? null;
}

// Porcentajes enteros a una décima que suman 100 (lo que sobra del redondeo va al más grande)
export function aCien(valores: Record<string, number>): Pesos {
  const total = Object.values(valores).reduce((t, n) => t + Math.max(0, n), 0);
  if (!(total > 0)) return {};
  const pesos: Pesos = {};
  for (const [k, n] of Object.entries(valores)) pesos[k] = Math.round((Math.max(0, n) / total) * 1000) / 10;
  const suma = Object.values(pesos).reduce((t, n) => t + n, 0);
  const mayor = Object.keys(pesos).sort((a, b) => pesos[b] - pesos[a])[0];
  if (mayor) pesos[mayor] = Math.round((pesos[mayor] + 100 - suma) * 10) / 10;
  return pesos;
}

export type Segmentos = { anio: number | null; cierre: string; partes: [string, number][] };

// El último año fiscal con segmentos, de mayor a menor
export function ultimosSegmentos(datos: Json): Segmentos | null {
  const p = periodosSegmentos(datos)[0];
  if (!p) return null;
  const partes = Object.entries(p.partes).map(([k, n]) => [k, Number(n)] as [string, number])
    .filter(([, n]) => Number.isFinite(n) && n > 0).sort((a, b) => b[1] - a[1]);
  return partes.length ? { anio: p.anio, cierre: p.fecha.slice(0, 10), partes } : null;
}

export type Resultado =
  | { ok: true; pesos: Pesos; anio: number | null; cierre: string; ignorados: string[]; sinVentas: string[] }
  | { ok: false; error: string; nuevos?: string[] };

// Aplica la receta a los segmentos. Error si hay un segmento que la receta no conoce (la empresa cambió
// sus segmentos) o si la receta manda algo a una división que la empresa ya no tiene.
export function calcularPesos(seg: Segmentos, receta: Receta, divisiones: string[]): Resultado {
  const llaves = Object.keys(receta ?? {});
  const nuevos = seg.partes.map(([k]) => k).filter((k) => !llaves.some((x) => igual(x, k)));
  if (nuevos.length) return { ok: false, error: `Segmentos nuevos que la receta no tiene: ${nuevos.join(", ")}.`, nuevos };
  const suma: Record<string, number> = Object.fromEntries(divisiones.map((d) => [d, 0]));
  const ignorados: string[] = [];
  for (const [nombre, n] of seg.partes) {
    const destino = receta[llaves.find((x) => igual(x, nombre))!];
    if (!limpio(destino)) { ignorados.push(nombre); continue; }
    const d = divisionDe(destino, divisiones);
    if (!d) return { ok: false, error: `"${nombre}" va a "${destino}", que ya no es una división de la empresa (${divisiones.join(", ")}).` };
    suma[d] += n;
  }
  const pesos = aCien(suma);
  if (!Object.keys(pesos).length) return { ok: false, error: "Ningún segmento cuenta: todos están ignorados." };
  return { ok: true, pesos, anio: seg.anio, cierre: seg.cierre, ignorados, sinVentas: divisiones.filter((d) => !(suma[d] > 0)) };
}

// Si los porcentajes guardados siguen sirviendo: cubren exactamente las divisiones de hoy y suman algo
export function pesosVigentes(pesos: Json, divisiones: string[]): boolean {
  if (!pesos || typeof pesos !== "object") return false;
  const llaves = Object.keys(pesos);
  return llaves.length === divisiones.length && divisiones.every((d) => llaves.some((k) => igual(k, d)))
    && llaves.every((k) => Number(pesos[k]) >= 0) && llaves.some((k) => Number(pesos[k]) > 0);
}

// Los porcentajes de una empresa como los usa el mapa (sin porcentajes, o si ya no cuadran, partes iguales),
// de dónde salen y, si hay algo que arreglar, qué
function estadoPesos(c: Json): { pesos: Pesos; fuente: string; revisar: string | null } {
  const divisiones = divisionesDe(c);
  const ps = c?.pesos_subsectores && typeof c.pesos_subsectores === "object" ? c.pesos_subsectores : null;
  const vigentes = !!ps && !ps.error && pesosVigentes(ps.pesos, divisiones);
  const pesos: Pesos = vigentes
    ? Object.fromEntries(divisiones.map((d) => [d, Number(ps.pesos[Object.keys(ps.pesos).find((k) => igual(k, d))!])]))
    : aCien(Object.fromEntries(divisiones.map((d) => [d, 1])));
  if (!divisiones.length) return { pesos, fuente: "sin sectores propios", revisar: "sin sectores propios" };
  if (vigentes && ps.origen !== "segmentos") return { pesos, fuente: "a mano", revisar: null };
  if (vigentes) {
    const cubre = ps.cobertura ? `los segmentos cubren ${ps.cobertura}%` : "";
    return { pesos, fuente: `año fiscal ${ps.anio ?? ""}`.trim() + (cubre ? `, ${cubre}` : ""), revisar: cubre || null };
  }
  if (ps?.error) return { pesos, fuente: "no se pudieron calcular, en partes iguales", revisar: "no se pudieron calcular" };
  if (ps) return { pesos, fuente: "porcentajes viejos, en partes iguales", revisar: "porcentajes viejos" };
  return divisiones.length > 1 ? { pesos, fuente: "sin porcentajes, en partes iguales", revisar: "sin porcentajes" } : { pesos, fuente: "", revisar: null };
}

// Lo que va arriba del listado si lo pide con prompt: qué revisar y cómo leer el formato
export const PROMPT_REVISION = "Revisa una por una estas empresas. Para cada una dime si los sectores, subsectores y porcentajes coinciden con sus " +
  "ventas por segmento del último reporte anual. Si algo está mal o desactualizado, dame la versión corregida en el mismo formato.\n\n" +
  "Formato: cada empresa empieza con su nombre, su ticker y de dónde salen los porcentajes (\"año fiscal 2025\" = de sus ventas por segmento " +
  "de ese año; \"a mano\" = los puse yo; sin nada = tiene un solo subsector). Abajo va una línea por subsector: Sector - Subsector y su " +
  "porcentaje de las ventas. Los sectores y subsectores son míos, no la clasificación GICS.";

// El listado para copiar y pasárselo a otra IA, que lo revisa empresa por empresa:
//   Google (GOOGL) · año fiscal 2025
//   Tecnología - Publicidad 73.4%
export function listadoSectores(empresas: Json[], conPrompt = false): string {
  return (conPrompt ? PROMPT_REVISION + "\n\n" : "") + empresas.map((c) => {
    const { pesos, fuente } = estadoPesos(c);
    const titulo = `${limpio(c?.nombre)}${c?.ticker ? ` (${limpio(c.ticker).toUpperCase()})` : ""}${fuente ? ` · ${fuente}` : ""}`;
    const lineas = Object.keys(pesos).sort((a, b) => pesos[b] - pesos[a]).map((d) => `${d.split(SEPARADOR).join(" - ")} ${pesos[d]}%`);
    return [titulo, ...lineas].join("\n");
  }).join("\n\n");
}

// Lo que hay que arreglar en el listado ("Space X: sin porcentajes"); vacío si nada
export function revisarListado(empresas: Json[]): string[] {
  return empresas.map((c) => [limpio(c?.nombre), estadoPesos(c).revisar]).filter(([, r]) => r).map(([n, r]) => `${n}: ${r}`);
}
