// Los números de una empresa por dentro: los 10-K y 10-Q que reportó a la SEC (como los da Finnhub
// gratis en stock/financials-reported) y sus ventas por segmento y por región (de FMP). Cada empresa
// nombra sus conceptos a su manera, así que de cada cifra se toma el primero que exista de una lista.
// Las cuentas (márgenes, crecimientos, flujo libre) se hacen aquí: el modelo no suma. Cálculo puro
// (sin red), para poder probarlo aparte.

// deno-lint-ignore no-explicit-any
type Json = any;

type Cifras = Record<string, number | null>;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (d: unknown) => {
  const s = String(d ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(8, 10))} ${MESES[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : null;
};

// 402836000000 → "$402.8 mil millones"
export const dinero = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)} mil millones`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)} millones`;
  return `${s}$${Math.round(a).toLocaleString("en-US")}`;
};
const pct = (n: number | null) => n === null || !Number.isFinite(n) ? null : `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10} %`;
// Contra una base negativa (una pérdida) el porcentaje no dice nada
const cambio = (a: number | null, b: number | null) => a === null || b === null || b <= 0 ? null : pct((a / b - 1) * 100);
const parte = (a: number | null, total: number | null) => a === null || total === null || total <= 0 ? null : pct((a / total) * 100)?.replace("+", "") ?? null;

function valor(rep: Json, conceptos: string[], secciones: string[]): number | null {
  for (const c of conceptos) {
    for (const s of secciones) {
      const x = (Array.isArray(rep?.[s]) ? rep[s] : []).find((y: Json) => y?.concept === `us-gaap_${c}` || y?.concept === `us-gaap:${c}`);
      if (x && x.value !== null && x.value !== "" && Number.isFinite(Number(x.value))) return Number(x.value);
    }
  }
  return null;
}
const suma = (...v: (number | null)[]) => v.some((x) => x !== null) ? v.reduce((t: number, x) => t + (x ?? 0), 0) : null;

export function cifrasDeReporte(rep: Json): Cifras {
  const ic = ["ic"], bs = ["bs"], cf = ["cf"];
  const v = (conceptos: string[], secciones: string[]) => valor(rep, conceptos, secciones);
  const ingresos = v(["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax"], ic);
  const flujo = v(["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], cf);
  const capexV = v(["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], cf);
  const capex = capexV === null ? null : Math.abs(capexV);
  // Deuda financiera: largo plazo + lo que vence en el año, sin contar dos veces un total y sus partes
  const papel = v(["CommercialPaper"], bs), bancos = v(["ShortTermBorrowings"], bs);
  const corto = v(["DebtCurrent"], bs) ?? suma(v(["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"], bs), papel, bancos);
  const largo = v(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"], bs);
  const total = v(["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"], bs);
  const deuda = v(["DebtLongtermAndShorttermCombinedAmount"], bs)
    ?? (largo !== null ? suma(largo, corto) : total !== null ? suma(total, papel, bancos) : corto);
  const caja = v(["CashCashEquivalentsAndShortTermInvestments"], bs)
    ?? suma(v(["CashAndCashEquivalentsAtCarryingValue", "Cash"], bs), v(["MarketableSecuritiesCurrent", "ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"], bs));
  const dividendos = v(["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"], cf);
  const recompras = v(["PaymentsForRepurchaseOfCommonStock"], cf);
  return {
    ingresos,
    utilidad_operativa: v(["OperatingIncomeLoss"], ic),
    // Ganancias o pérdidas que no son del negocio (p. ej. lo que subieron sus inversiones): explican una utilidad
    // neta que crece mucho más que la operativa
    fuera_de_operacion: v(["NonoperatingIncomeExpense", "OtherNonoperatingIncomeExpense"], ic),
    utilidad_neta: v(["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"], [...ic, ...cf]),
    flujo_operativo: flujo,
    capex,
    flujo_libre: flujo !== null && capex !== null ? flujo - capex : null,
    dividendos: dividendos === null ? null : Math.abs(dividendos),
    recompras: recompras === null ? null : Math.abs(recompras),
    caja,
    deuda,
    patrimonio: v(["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], bs),
  };
}

const moneda = (rep: Json) => {
  const u = (Array.isArray(rep?.ic) ? rep.ic : []).find((x: Json) => typeof x?.unit === "string" && !x.unit.includes("/"))?.unit;
  return u ? String(u).toUpperCase() : "USD";
};
const ordenar = (data: Json) => (Array.isArray(data) ? data : []).filter((r: Json) => r?.report && r.endDate)
  .sort((a: Json, b: Json) => String(b.endDate).localeCompare(String(a.endDate)));

export const COLUMNAS_ANUAL = ["año_fiscal", "cierre", "ventas", "crec_ventas", "utilidad_operativa", "margen_operativo", "utilidad_neta", "margen_neto",
  "crec_utilidad", "fuera_de_operacion", "flujo_operativo", "inversion_activos", "flujo_libre", "dividendos", "recompras", "caja_e_inversiones", "deuda", "patrimonio"];

// Los últimos años fiscales completos (10-K), del más reciente al más viejo, con el crecimiento contra el anterior
export function resumenAnual(data: Json, anios = 3) {
  const reportes = ordenar(data).filter((r: Json) => Number(r.quarter) === 0).slice(0, anios + 1);
  const cifras = reportes.map((r: Json) => cifrasDeReporte(r.report));
  const filas = reportes.slice(0, anios).map((r: Json, i: number) => {
    const c = cifras[i], antes = cifras[i + 1] ?? null;
    return [
      Number(r.year) || null, fecha(r.endDate), dinero(c.ingresos), antes ? cambio(c.ingresos, antes.ingresos) : null,
      dinero(c.utilidad_operativa), parte(c.utilidad_operativa, c.ingresos), dinero(c.utilidad_neta), parte(c.utilidad_neta, c.ingresos),
      antes ? cambio(c.utilidad_neta, antes.utilidad_neta) : null, dinero(c.fuera_de_operacion), dinero(c.flujo_operativo), dinero(c.capex), dinero(c.flujo_libre),
      dinero(c.dividendos), dinero(c.recompras), dinero(c.caja), dinero(c.deuda), dinero(c.patrimonio),
    ];
  });
  return { filas, moneda: reportes.length ? moneda(reportes[0].report) : "USD", ultimoCierre: reportes[0]?.endDate ? String(reportes[0].endDate).slice(0, 10) : null };
}

// Lo que va del año fiscal (el último 10-Q, que en Finnhub viene acumulado desde que empezó el año) contra el
// mismo periodo del año anterior; la caja y la deuda son a la fecha del 10-Q. Nada si no hay 10-Q más nuevo que el 10-K
export function loQueVa(trimestral: Json, ultimoCierreAnual: string | null) {
  const qs = ordenar(trimestral).filter((r: Json) => Number(r.quarter) > 0);
  const ultimo = qs[0];
  if (!ultimo || (ultimoCierreAnual && String(ultimo.endDate).slice(0, 10) <= ultimoCierreAnual)) return null;
  const dias = (r: Json) => (Date.parse(String(r.endDate).slice(0, 10)) - Date.parse(String(r.startDate).slice(0, 10))) / 86_400_000;
  const antes = qs.find((r: Json) => Number(r.year) === Number(ultimo.year) - 1 && Number(r.quarter) === Number(ultimo.quarter)
    && Math.abs(dias(r) - dias(ultimo)) <= 10);
  const c = cifrasDeReporte(ultimo.report), a = antes ? cifrasDeReporte(antes.report) : null;
  // Muchos 10-Q llegan sin balance: lo que falta no se manda
  const datos: Json = {
    periodo: `${fecha(ultimo.startDate)} a ${fecha(ultimo.endDate)} (${ultimo.form ?? "10-Q"})`,
    ...(antes ? { contra: `${fecha(antes.startDate)} a ${fecha(antes.endDate)}` } : {}),
    ventas: dinero(c.ingresos), crec_ventas: a ? cambio(c.ingresos, a.ingresos) : null,
    utilidad_operativa: dinero(c.utilidad_operativa), margen_operativo: parte(c.utilidad_operativa, c.ingresos),
    crec_utilidad_operativa: a ? cambio(c.utilidad_operativa, a.utilidad_operativa) : null,
    fuera_de_operacion: dinero(c.fuera_de_operacion),
    utilidad_neta: dinero(c.utilidad_neta), margen_neto: parte(c.utilidad_neta, c.ingresos), crec_utilidad: a ? cambio(c.utilidad_neta, a.utilidad_neta) : null,
    flujo_operativo: dinero(c.flujo_operativo), crec_flujo_operativo: a ? cambio(c.flujo_operativo, a.flujo_operativo) : null,
    flujo_libre: dinero(c.flujo_libre),
    caja_e_inversiones: dinero(c.caja), deuda: dinero(c.deuda),
  };
  return Object.fromEntries(Object.entries(datos).filter(([, x]) => x !== null));
}

// FMP (revenue-product-segmentation y revenue-geographic-segmentation). La API "stable" da
// [{ fiscalYear, date, data: { "Google Cloud": 43229000000, ... } }]; la vieja, [{ "2024-12-31": { ... } }]
export function periodosSegmentos(datos: Json): { anio: number | null; fecha: string; partes: Record<string, number> }[] {
  const lista: { anio: number | null; fecha: string; partes: Record<string, number> }[] = [];
  for (const x of Array.isArray(datos) ? datos : []) {
    if (x?.data && typeof x.data === "object") {
      lista.push({ anio: Number(x.fiscalYear) || null, fecha: String(x.date ?? ""), partes: x.data });
    } else if (x && typeof x === "object") {
      for (const [f, partes] of Object.entries(x)) if (/^\d{4}-\d{2}-\d{2}/.test(f) && partes && typeof partes === "object") {
        lista.push({ anio: Number(f.slice(0, 4)), fecha: f, partes: partes as Record<string, number> });
      }
    }
  }
  return lista.filter((p) => Object.values(p.partes).some((n) => Number(n) > 0)).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// El último año con cada segmento, su parte del total de los segmentos y cuánto creció contra el año anterior
export function resumenSegmentos(datos: Json) {
  const periodos = periodosSegmentos(datos);
  const ultimo = periodos[0];
  if (!ultimo) return null;
  const antes = periodos.find((p) => p.fecha.slice(0, 4) < ultimo.fecha.slice(0, 4)) ?? null;
  const partes = Object.entries(ultimo.partes).map(([nombre, n]) => [nombre, Number(n)] as [string, number]).filter(([, n]) => Number.isFinite(n) && n !== 0)
    .sort((a, b) => b[1] - a[1]);
  const total = partes.reduce((t, [, n]) => t + n, 0);
  return {
    año_fiscal: ultimo.anio, cierre: fecha(ultimo.fecha),
    total_segmentos: dinero(total),
    filas: partes.map(([nombre, n]) => [nombre, dinero(n), parte(n, total), antes ? cambio(n, Number(antes.partes[nombre]) || null) : null]),
  };
}
