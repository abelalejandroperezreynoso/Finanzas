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
// La respuesta de la otra IA trae un bloque con la primera línea de CORRECCIONES_SECTORES: el usuario lo pega en el chat
// y el asistente deja las tarjetas
export const CORRECCIONES_SECTORES = "Correcciones del listado de sectores";
export const PROMPT_REVISION = "Revisa una por una estas empresas. Para cada una dime si los sectores, subsectores y porcentajes coinciden con sus " +
  "ventas por segmento del último reporte anual. Si algo está mal o desactualizado, explícame por qué en una o dos líneas.\n\n" +
  "Formato: cada empresa empieza con su nombre, su ticker y de dónde salen los porcentajes (\"año fiscal 2025\" = de sus ventas por segmento " +
  "de ese año; \"a mano\" = los puse yo; sin nada = tiene un solo subsector) y, si la hay, la fecha de su próximo reporte (T1 a T4 = trimestre de " +
  "su año fiscal; \"anual\" = el que trae sus ventas por segmento del año; ~ = aproximada): si su reporte anual ya salió y es más nuevo que el año " +
  "fiscal que tengo, revisa con ése. Abajo va una línea por subsector: Sector - Subsector y su " +
  "porcentaje de las ventas. Los sectores y subsectores son míos, no la clasificación GICS.\n\n" +
  "Además de los porcentajes, revisa mis nombres de sectores y subsectores: si dos subsectores son lo mismo, únelos con un solo nombre; " +
  "si uno agrupa negocios distintos, sepáralo; y si un nombre no describe bien lo que contiene, cámbialo. No cambies nombres sólo por " +
  "estilo. Explica cada cambio de nombre en una línea, fuera del bloque, e incluye en el bloque todas las empresas afectadas.\n\n" +
  `Al final, en un solo bloque de código, dame las correcciones para pegarlas en mi app: la primera línea dice "${CORRECCIONES_SECTORES}" ` +
  "y luego sólo las empresas que cambian, completas y en el mismo formato (nombre y ticker, y una línea por subsector con su porcentaje), " +
  "con los nombres de sector y subsector que ya uso cuando sirvan. Sin explicaciones dentro del bloque.";

// El listado para copiar y pasárselo a otra IA, que lo revisa empresa por empresa:
//   Google (GOOGL) · año fiscal 2025
//   Tecnología - Publicidad 73.4%
export function listadoSectores(empresas: Json[], conPrompt = false, reportes: Record<string, Json> = {}, hoy = ""): string {
  return (conPrompt ? PROMPT_REVISION + "\n\n" : "") + empresas.map((c) => {
    const { pesos, fuente } = estadoPesos(c);
    const ticker = c?.ticker ? limpio(c.ticker).toUpperCase() : "";
    const reporte = ticker && hoy ? textoReportes(reportes[ticker], hoy) : "";
    const titulo = `${limpio(c?.nombre)}${ticker ? ` (${ticker})` : ""}${fuente ? ` · ${fuente}` : ""}${reporte ? ` · ${reporte}` : ""}`;
    const lineas = Object.keys(pesos).sort((a, b) => pesos[b] - pesos[a]).map((d) => `${d.split(SEPARADOR).join(" - ")} ${pesos[d]}%`);
    return [titulo, ...lineas].join("\n");
  }).join("\n\n");
}

// Lo que hay que arreglar en el listado ("Space X: sin porcentajes"); vacío si nada
export function revisarListado(empresas: Json[]): string[] {
  return empresas.map((c) => [limpio(c?.nombre), estadoPesos(c).revisar]).filter(([, r]) => r).map(([n, r]) => `${n}: ${r}`);
}

// Cuándo reporta cada empresa, de la agenda de Finnhub (calendar/earnings, unos tres trimestres por delante). El anual
// es el del 4º trimestre de su año fiscal (el que trae los segmentos nuevos); si todavía no sale en la agenda, se calcula
// a 91 días por trimestre desde el último que sí sale (aproximado). Se guarda en perfiles_empresas.proximos_reportes.
export type Reporte = { fecha: string; trimestre: number | null; anio: number | null; hora?: string | null };
export type ProximosReportes = { revisado: string; lista: Reporte[]; anual: { fecha: string; estimado: boolean } | null };

export function proximosReportes(agenda: Json, hoy: string): ProximosReportes {
  const vistas = new Set<string>();
  const lista: Reporte[] = (Array.isArray(agenda) ? agenda : [])
    .filter((x: Json) => /^\d{4}-\d{2}-\d{2}$/.test(String(x?.date ?? "")) && String(x.date) >= hoy)
    .map((x: Json) => ({ fecha: String(x.date), trimestre: Number(x.quarter) || null, anio: Number(x.year) || null, hora: ["bmo", "amc", "dmh"].includes(x.hour) ? x.hour : null }))
    .sort((a: Reporte, b: Reporte) => a.fecha.localeCompare(b.fecha))
    .filter((r: Reporte) => !vistas.has(r.fecha) && !!vistas.add(r.fecha))
    .slice(0, 4);
  const cuarto = lista.find((r) => r.trimestre === 4);
  const ultimo = lista[lista.length - 1];
  let anual: ProximosReportes["anual"] = cuarto ? { fecha: cuarto.fecha, estimado: false } : null;
  if (!anual && ultimo?.trimestre) {
    const d = new Date(`${ultimo.fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 91 * (4 - ultimo.trimestre));
    anual = { fecha: d.toISOString().slice(0, 10), estimado: true };
  }
  return { revisado: hoy, lista, anual };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (f: string, hoy: string, soloMes = false) => {
  const [a, m, d] = f.split("-").map(Number);
  const anio = String(a) !== hoy.slice(0, 4) ? ` ${a}` : "";
  return `${soloMes ? "" : `${d} `}${MESES_CORTOS[m - 1]}${anio}`;
};

// "próximo reporte 28 oct (T1), anual ~jul 2027" o "próximo reporte 2 nov (anual)"; vacío si no hay (ETFs)
export function textoReportes(pr: Json, hoy: string): string {
  const prox = (Array.isArray(pr?.lista) ? pr.lista : []).find((r: Reporte) => r.fecha >= hoy);
  if (!prox) return "";
  const esAnual = prox.trimestre === 4;
  const anual = pr.anual && pr.anual.fecha >= hoy && !esAnual
    ? `, anual ${pr.anual.estimado ? `~${fechaCorta(pr.anual.fecha, hoy, true)}` : fechaCorta(pr.anual.fecha, hoy)}` : "";
  return `próximo reporte ${fechaCorta(prox.fecha, hoy)} (${esAnual ? "anual" : prox.trimestre ? `T${prox.trimestre}` : "trimestral"})${anual}`;
}

// La agenda de sus empresas, de la más próxima a la más lejana, ya escrita (el modelo contaba mal los días: "pasado
// mañana" por mañana): "1. Google (GOOGL): mañana, miércoles 28 oct, al cierre · T3"
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const HORAS_REPORTE: Record<string, string> = { bmo: "antes de abrir la bolsa", amc: "al cierre", dmh: "durante el día" };
export function agendaReportes(empresas: { nombre: string; ticker: string; pr: Json }[], hoy: string, dias: number): string[] {
  const t0 = Date.parse(`${hoy}T12:00:00Z`);
  return empresas.map((e) => {
    const r: Reporte | undefined = (Array.isArray(e.pr?.lista) ? e.pr.lista : []).find((x: Reporte) => x.fecha >= hoy);
    return r ? { e, r, n: Math.round((Date.parse(`${r.fecha}T12:00:00Z`) - t0) / 86_400_000) } : null;
  }).filter((x): x is { e: { nombre: string; ticker: string; pr: Json }; r: Reporte; n: number } => !!x && x.n <= dias)
    .sort((a, b) => a.r.fecha.localeCompare(b.r.fecha) || a.e.nombre.localeCompare(b.e.nombre, "es"))
    .map(({ e, r, n }, i) => {
      const cuando = n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`;
      const dia = `${DIAS_SEMANA[new Date(`${r.fecha}T12:00:00Z`).getUTCDay()]} ${fechaCorta(r.fecha, hoy)}`;
      return `${i + 1}. ${e.nombre} (${e.ticker}): ${cuando}, ${dia}${r.hora ? `, ${HORAS_REPORTE[r.hora]}` : ""} · ${r.trimestre === 4 ? "anual" : r.trimestre ? `T${r.trimestre}` : "trimestral"}`;
    });
}
