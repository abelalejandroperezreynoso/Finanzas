// Ventas por segmento desde el reporte anual (10-K o 20-F) que la empresa entrega a la SEC, en XBRL. Es el
// respaldo gratis de FMP: su plan gratis no trae los segmentos de muchas empresas (MELI, SE, SPOT, DASH).
// Cada empresa etiqueta sus ventas a su manera (por segmento, por producto, por segmento y producto a la vez),
// así que se prueban todas las formas que trae el reporte y se queda la que reparte sus ventas en más partes
// con sentido. Cálculo puro (sin red), para poder probarlo aparte.

// deno-lint-ignore no-explicit-any
type Json = any;

export type SegmentosSec = { anio: number | null; cierre: string; total: number; partes: [string, number][] };

// Conceptos de ventas, del más preciso al más general (US GAAP y IFRS)
const CONCEPTOS = [
  "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
  "us-gaap:Revenues",
  "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
  "ifrs-full:Revenue",
  "ifrs-full:RevenueFromContractsWithCustomers",
];
// Ejes que no dicen de qué negocio es la venta: el de "segmentos operativos" es sólo cómo se consolida
const NEUTROS: Record<string, RegExp> = {
  "srt:ConsolidationItemsAxis": /OperatingSegmentsMember$/,
  "srt:ConsolidatedEntitiesAxis": /./,
};
// Ventas a clientes externos: la cifra buena del segmento, sin lo que le vende a otros segmentos (Caterpillar
// reportaba Power & Energy con $5 mil millones de ventas a sus otras divisiones). Marcan la cifra, no un negocio
const EXTERNAS: Record<string, RegExp> = {
  "srt:ConsolidationItemsAxis": /OperatingSegmentsExcludingIntersegmentEliminationMember$/,
  "srt:MajorCustomersAxis": /ExternalCustomersMember$/,
};
// Ejes por región o por clase de cliente: no son negocios
const DESCARTADOS = /Geograph|CountryAxis|MajorCustomers|ConcentrationRisk|TimingOfTransfer|ContractWithCustomerSalesChannel|RangeAxis|LegalEntityAxis|ScenarioAxis|RestatementAxis|RetirementPlan|ProductInformationAxis/;
// Miembros genéricos (bien o servicio) que no dicen qué vende
const GENERICOS = /:(Product|Service|Products|Services|ProductAndService|Goods)Member$/;
// Partes que son regiones (segmentos por país): se prefiere cualquier otra forma
const REGIONES = /\b(brazil|brasil|mexico|méxico|argentina|chile|colombia|countr(y|ies)|us|u\.s\.|united states|north america|latin america|latam|americas|europe|emea|asia|apac|china|japan|international|domestic|region|rest of world|lu)\b/i;
// Orden en que se nombran las partes: segmento, subsegmento, producto
const ORDEN_EJES = ["us-gaap:StatementBusinessSegmentsAxis", "ifrs-full:SegmentsAxis", "us-gaap:SubsegmentsAxis", "srt:ProductOrServiceAxis", "ifrs-full:ProductsAndServicesAxis"];

export function nombreMiembro(miembro: string): string {
  const n = miembro.split(":").pop()!.replace(/Member$/, "");
  return n.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/\bYou Tube\b/g, "YouTube").trim();
}

const dias = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

// Quita las partes que son la suma de otras (p. ej. "Transaction Based Revenues" = opciones + cripto + acciones),
// sólo mientras sumen más que las ventas: de la más grande a la más chica (un subtotal es más grande que sus
// partes) y parando en cuanto cuadra, para no confundir una parte real con una suma que coincide por casualidad
// (en ASML, cuatro productos sumaban lo mismo que NXE). null si no se pudo deshacer el traslape.
function sinSubtotales(partes: [string, number][], total: number): [string, number][] | null {
  let lista = [...partes].sort((a, b) => b[1] - a[1]);
  const suma = () => lista.reduce((t, [, n]) => t + n, 0);
  while (suma() > total * 1.02) {
    if (lista.length > 16) return null;
    let quitado = false;
    for (let i = 0; i < lista.length && !quitado; i++) {
      const v = lista[i][1];
      const resto = lista.filter((_, j) => j !== i).map(([, n]) => n);
      const n = resto.length;
      for (let mask = 1; mask < (1 << n) && !quitado; mask++) {
        if ((mask & (mask - 1)) === 0) continue; // al menos dos
        let s = 0;
        for (let j = 0; j < n; j++) if (mask & (1 << j)) s += resto[j];
        if (Math.abs(s - v) <= Math.max(1, v * 0.0005)) { lista = lista.filter((_, j) => j !== i); quitado = true; }
      }
    }
    // Sin más subtotales: los segmentos pueden sumar algo más que las ventas por las ventas entre ellos (si la
    // empresa no las separa); eso se acepta, porque los porcentajes se sacan sobre su propia suma
    if (!quitado) return suma() <= total * 1.2 ? lista : null;
  }
  return lista;
}

export function segmentosDeXbrl(xml: string): SegmentosSec | null {
  const contextos = new Map<string, { s: string | null; e: string | null; dims: [string, string][]; tipado: boolean }>();
  for (const m of xml.matchAll(/<(?:xbrli:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const cuerpo = m[2];
    contextos.set(m[1], {
      s: cuerpo.match(/startDate>([^<]+)</)?.[1]?.trim() ?? null,
      e: cuerpo.match(/endDate>([^<]+)</)?.[1]?.trim() ?? null,
      dims: [...cuerpo.matchAll(/explicitMember[^>]*dimension="([^"]+)"[^>]*>([^<]+)</g)].map((x) => [x[1], x[2].trim()] as [string, string]),
      tipado: /typedMember/.test(cuerpo),
    });
  }
  const hechos: { c: string; ctx: string; v: number }[] = [];
  const patron = new RegExp(`<(${CONCEPTOS.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b([^>]*)>([^<]*)</\\1>`, "g");
  for (const m of xml.matchAll(patron)) {
    const ctx = m[2].match(/contextRef="([^"]+)"/)?.[1];
    const v = Number(m[3]);
    if (ctx && Number.isFinite(v) && contextos.has(ctx)) hechos.push({ c: m[1], ctx, v });
  }
  // El año fiscal más reciente y sus ventas totales (sin dimensiones)
  const anuales = hechos.filter((h) => {
    const k = contextos.get(h.ctx)!;
    return !k.dims.length && !k.tipado && k.s && k.e && dias(k.s, k.e) >= 350 && dias(k.s, k.e) <= 380;
  });
  if (!anuales.length) return null;
  const cierre = anuales.map((h) => contextos.get(h.ctx)!.e!).sort().pop()!;
  const inicio = contextos.get(anuales.find((h) => contextos.get(h.ctx)!.e === cierre)!.ctx)!.s!;
  const total = Math.max(...anuales.filter((h) => contextos.get(h.ctx)!.e === cierre).map((h) => h.v));
  if (!(total > 0)) return null;

  // Las ventas de ese año por cada combinación de ejes (sin los neutros); una cifra por miembro, del mejor concepto.
  // Si el mismo segmento trae varias cifras, manda la de clientes externos, luego la que no dice nada y al final la de
  // "segmentos operativos", que puede traer las ventas entre segmentos
  const porCombinacion = new Map<string, Map<string, Map<string, { v: number; r: number }>>>();
  // Las partes con un miembro genérico ("Service", "Product"): sirven, pero se prefiere otra forma
  const genericas = new Set<string>();
  for (const h of hechos) {
    const k = contextos.get(h.ctx)!;
    if (k.e !== cierre || k.s !== inicio || k.tipado || !k.dims.length) continue;
    const externa = k.dims.some(([eje, m]) => EXTERNAS[eje]?.test(m));
    const rango = externa ? 2 : k.dims.some(([eje]) => eje === "srt:ConsolidationItemsAxis") ? 0 : 1;
    const dims = k.dims.filter(([eje, m]) => !(NEUTROS[eje] && NEUTROS[eje].test(m)) && !EXTERNAS[eje]?.test(m));
    if (!dims.length || dims.some(([eje]) => DESCARTADOS.test(eje))) continue;
    const orden = (eje: string) => { const i = ORDEN_EJES.indexOf(eje); return i < 0 ? 99 : i; };
    dims.sort((a, b) => orden(a[0]) - orden(b[0]));
    const combinacion = dims.map(([eje]) => eje).join("|");
    // El eje de consolidación ("sin eliminaciones entre segmentos") separa combinaciones pero no va en el nombre
    const nombre = dims.filter(([eje]) => eje !== "srt:ConsolidationItemsAxis").map(([, m]) => nombreMiembro(m)).join(" · ") || nombreMiembro(dims[0][1]);
    if (dims.some(([, m]) => GENERICOS.test(m))) genericas.add(nombre);
    const delCombo = porCombinacion.get(combinacion) ?? new Map();
    const porConcepto = delCombo.get(nombre) ?? new Map();
    if ((porConcepto.get(h.c)?.r ?? -1) <= rango) porConcepto.set(h.c, { v: h.v, r: rango });
    delCombo.set(nombre, porConcepto);
    porCombinacion.set(combinacion, delCombo);
  }
  const elegir = (m: Map<string, { v: number }>) => { for (const c of CONCEPTOS) if (m.has(c)) return m.get(c)!.v; return 0; };
  const candidatas: [string, number][][] = [];
  for (const [combinacion, miembros] of porCombinacion) {
    let partes: [string, number][] = [...miembros].map(([n, m]) => [n, elegir(m)] as [string, number]).filter(([, v]) => v > 0);
    // Con segmento y producto a la vez, los segmentos que no se abren por producto se completan con su cifra
    const ejes = combinacion.split("|");
    const ejeSegmento = ejes.find((e) => /SegmentsAxis$/.test(e) && !/Subsegments/.test(e));
    if (ejeSegmento && ejes.length > 1) {
      const solos = porCombinacion.get(ejeSegmento);
      if (solos) {
        const cubiertos = new Set(partes.map(([n]) => n.split(" · ")[0]));
        for (const [n, m] of solos) if (!cubiertos.has(n) && elegir(m) > 0) partes.push([n, elegir(m)]);
      }
    }
    const limpias = sinSubtotales(partes, total);
    if (!limpias || limpias.length < 2) continue;
    candidatas.push(limpias);
  }
  const suma = (p: [string, number][]) => p.reduce((t, [, n]) => t + n, 0);
  const validas = candidatas.filter((p) => suma(p) <= total * 1.2 && suma(p) >= total * 0.5 && p.length <= 12);
  // Primero las que cubren casi todo; luego las que no parten por región ni por "bien o servicio"; entre ellas,
  // la de más partes; si ninguna cubre 90%, la que más cubra
  const castigo = (p: [string, number][]) => (p.some(([n]) => REGIONES.test(n)) ? 2 : 0) + (p.some(([n]) => genericas.has(n)) ? 1 : 0);
  validas.sort((a, b) => {
    const ca = suma(a) / total >= 0.9 ? 1 : 0, cb = suma(b) / total >= 0.9 ? 1 : 0;
    return cb - ca || castigo(a) - castigo(b) || (ca ? b.length - a.length : suma(b) - suma(a)) || suma(b) - suma(a);
  });
  // Un solo negocio (o nada desglosado): todo es una parte
  const partes = validas[0] ?? [["Ventas totales", total] as [string, number]];
  return { anio: Number(cierre.slice(0, 4)) || null, cierre, total, partes: [...partes].sort((a, b) => b[1] - a[1]) };
}
