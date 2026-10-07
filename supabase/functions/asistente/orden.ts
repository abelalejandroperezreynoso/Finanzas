// Orden de cuentas y categorías: lo que hace falta para que sigan claras para el usuario y para
// la IA. Busca categorías duplicadas, movimientos que parecen ir en otra categoría, categorías
// sin uso y lo que no tiene descripción. Son pistas: la IA las confirma con las descripciones
// antes de proponer nada. Cálculo puro (sin base ni IA), para poder probarlo aparte.

// deno-lint-ignore no-explicit-any
type Json = any;

export type DatosOrden = {
  cuentas: Json[];
  categorias: Json[];
  // id, categoria_id, fecha, monto, descripcion
  registros: Json[];
  // Hoy y el día de cada movimiento en la zona del usuario (AAAA-MM-DD)
  hoy: string;
  diaDe: (iso: string) => string;
};

// Sin uso: más de este tiempo sin movimientos
export const DIAS_SIN_USO = 180;
const MAX_IDS = 40;

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "por", "mi", "mis", "con", "a", "al"]);

// "Comidas" y "comida", "Súper" y "super": la misma clave
export function claveNombre(nombre: unknown): string {
  return sinAcentos(String(nombre ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((w) => w && !PALABRAS_VACIAS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

// Descripción de un movimiento sin números ni signos ("Oxxo 45" y "OXXO" son lo mismo)
function claveDescripcion(desc: unknown): string {
  return sinAcentos(String(desc ?? "")).toLowerCase().replace(/[0-9]+/g, " ").replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}
// Descripciones que no dicen de qué se trata: aparecen en cualquier categoría
const GENERICAS = new Set(["pago", "pagos", "compra", "compras", "varios", "otro", "otros", "gasto", "gastos", "ingreso", "ingresos",
  "abono", "transferencia", "retiro", "deposito", "comision", "sin descripcion", "na", "x"]);

function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = fila;
  }
  return previa[b.length];
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

const tabla = (columnas: string[], filas: unknown[][]) => ({ columnas, filas });

export function revisarOrden(d: DatosOrden) {
  const cats = d.categorias ?? [];
  const porId = new Map<string, Json>(cats.map((c: Json) => [String(c.id), c]));
  const cuentaDe = (c: Json) => (d.cuentas ?? []).find((x: Json) => String(x.id) === String(c.cuenta_id))?.nombre ?? c.cuentas?.nombre ?? null;
  // Si dos categorías se llaman igual (en cuentas distintas), se distinguen por su cuenta
  const repetidos = new Set<string>();
  const vistos = new Set<string>();
  cats.forEach((c: Json) => { const n = String(c.nombre); if (vistos.has(n)) repetidos.add(n); vistos.add(n); });
  const etiqueta = (c: Json) => (repetidos.has(String(c.nombre)) && cuentaDe(c) ? `${c.nombre} (${cuentaDe(c)})` : String(c.nombre));

  // Uso de cada categoría
  const hace90 = new Date(Date.parse(`${d.hoy}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const uso = new Map<string, { n: number; n90: number; primero: string | null; ultimo: string | null; suma: number }>();
  cats.forEach((c: Json) => uso.set(String(c.id), { n: 0, n90: 0, primero: null, ultimo: null, suma: 0 }));
  const movsPorCuenta = new Map<string, number>();
  for (const r of d.registros ?? []) {
    const u = uso.get(String(r.categoria_id));
    if (!u) continue;
    const dia = d.diaDe(r.fecha);
    u.n++;
    if (dia >= hace90) u.n90++;
    if (!u.ultimo || dia > u.ultimo) u.ultimo = dia;
    if (!u.primero || dia < u.primero) u.primero = dia;
    u.suma += Number(r.monto) || 0;
    const cuenta = String(porId.get(String(r.categoria_id))?.cuenta_id);
    movsPorCuenta.set(cuenta, (movsPorCuenta.get(cuenta) ?? 0) + 1);
  }
  const usoDe = (c: Json) => uso.get(String(c.id))!;

  // Posibles duplicadas: misma cuenta y mismo tipo (la misma categoría en dos cuentas es normal:
  // cada cuenta tiene las suyas)
  const ORDEN_MOTIVO: Record<string, number> = { "mismo nombre": 0, "mismo ticker": 1, "casi igual": 2, "uno contiene al otro": 3 };
  const parecidas: Json[] = [];
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i], b = cats[j];
      if (String(a.cuenta_id) !== String(b.cuenta_id) || a.tipo !== b.tipo) continue;
      let motivo: string | null = null;
      if (a.tipo === "inversion") {
        if (a.ticker && String(a.ticker).toUpperCase() === String(b.ticker ?? "").toUpperCase()) motivo = "mismo ticker";
      } else {
        const ka = claveNombre(a.nombre), kb = claveNombre(b.nombre);
        if (!ka || !kb) continue;
        if (ka === kb) motivo = "mismo nombre";
        else if (Math.min(ka.length, kb.length) >= 4 && 1 - distancia(ka, kb) / Math.max(ka.length, kb.length) >= 0.8) motivo = "casi igual";
        else {
          const ta = ka.split(" "), tb = kb.split(" ");
          const [corta, larga] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
          if (corta.some((w) => w.length >= 4) && corta.every((w) => larga.includes(w))) motivo = "uno contiene al otro";
        }
      }
      if (!motivo) continue;
      // Primero la de más movimientos: es la que normalmente se queda
      const [x, y] = usoDe(a).n >= usoDe(b).n ? [a, b] : [b, a];
      parecidas.push({ x, y, motivo, peso: usoDe(a).n + usoDe(b).n });
    }
  }
  parecidas.sort((p, q) => ORDEN_MOTIVO[p.motivo] - ORDEN_MOTIVO[q.motivo] || q.peso - p.peso);

  // Movimientos que parecen ir en otra categoría de la misma cuenta y tipo:
  // a) su descripción es el nombre de otra categoría ("Gasolina" registrada en Comida);
  // b) la misma descripción casi siempre va en otra ("Oxxo": 12 en Comida y 2 en Snacks).
  const porNombreEnCuenta = new Map<string, Json>();
  cats.forEach((c: Json) => {
    if (c.tipo === "inversion") return;
    const k = claveNombre(c.nombre);
    if (k) porNombreEnCuenta.set(`${c.cuenta_id}|${c.tipo}|${k}`, c);
  });
  const ordenados = [...(d.registros ?? [])].sort((p: Json, q: Json) => String(q.fecha).localeCompare(String(p.fecha)));
  const grupos = new Map<string, Map<string, { ids: unknown[]; muestra: string }>>();
  const comoOtra = new Map<string, { de: Json; a: Json; ids: unknown[]; muestra: string }>();
  for (const r of ordenados) {
    const c = porId.get(String(r.categoria_id));
    if (!c || c.tipo === "inversion") continue;
    const desc = String(r.descripcion ?? "").replace(/\s+/g, " ").trim();
    const kn = claveNombre(desc);
    const otra = kn ? porNombreEnCuenta.get(`${c.cuenta_id}|${c.tipo}|${kn}`) : null;
    if (otra && String(otra.id) !== String(c.id)) {
      const k = `${c.id}>${otra.id}`;
      const g = comoOtra.get(k) ?? { de: c, a: otra, ids: [], muestra: desc };
      g.ids.push(r.id);
      comoOtra.set(k, g);
      continue;
    }
    const kd = claveDescripcion(desc);
    if (kd.length < 3 || GENERICAS.has(kd)) continue;
    const k = `${c.cuenta_id}|${c.tipo}|${kd}`;
    const g = grupos.get(k) ?? new Map();
    const e = g.get(String(c.id)) ?? { ids: [], muestra: desc };
    e.ids.push(r.id);
    g.set(String(c.id), e);
    grupos.set(k, g);
  }
  const malClasificados: Json[] = [...comoOtra.values()].map((g) => ({
    descripcion: g.muestra, de: g.de, a: g.a, ids: g.ids, motivo: "se llama como la otra categoría",
  }));
  for (const g of grupos.values()) {
    if (g.size < 2) continue;
    const lista = [...g.entries()].map(([id, e]) => ({ c: porId.get(id), ...e })).sort((p, q) => q.ids.length - p.ids.length);
    const mayor = lista[0];
    if (mayor.ids.length < 3) continue;
    for (const menor of lista.slice(1)) {
      if (menor.ids.length > mayor.ids.length / 2) continue;
      malClasificados.push({
        descripcion: mayor.muestra, de: menor.c, a: mayor.c, ids: menor.ids,
        motivo: `casi siempre va en la otra (${mayor.ids.length} contra ${menor.ids.length})`,
      });
    }
  }
  malClasificados.sort((p, q) => q.ids.length - p.ids.length);

  // Sin uso: nunca, o hace más de DIAS_SIN_USO. No cuentan las inversiones que sí tuvieron
  // movimientos (pueden pasar meses sin tocarse), las deudas o préstamos con saldo pendiente, Salud
  // (meses sin una migraña es buena noticia) ni lo que se paga de año en año (aguinaldo, seguro).
  const sinUso = cats.filter((c: Json) => {
    const u = usoDe(c);
    if (u.n === 0) return true;
    if (c.tipo === "inversion" || c.tipo === "salud") return false;
    if ((c.tipo === "deuda" || c.tipo === "prestamo") && Math.abs(u.suma) >= 1) return false;
    if (u.n >= 2 && u.primero && u.ultimo && diasEntre(u.primero, u.ultimo) / (u.n - 1) >= 300) return false;
    return !!u.ultimo && diasEntre(u.ultimo, d.hoy) >= DIAS_SIN_USO;
  }).sort((a: Json, b: Json) => (usoDe(a).ultimo ?? "").localeCompare(usoDe(b).ultimo ?? ""));

  const catsSinDescripcion = cats.filter((c: Json) => c.tipo !== "inversion" && !String(c.descripcion ?? "").trim() && usoDe(c).n >= 3)
    .sort((a: Json, b: Json) => usoDe(b).n - usoDe(a).n);
  const cuentasSinDescripcion = (d.cuentas ?? []).filter((c: Json) => !String(c.descripcion ?? "").trim() && (movsPorCuenta.get(String(c.id)) ?? 0) >= 3);
  const gastosSinPrioridad = cats.filter((c: Json) => c.tipo === "gasto" && !c.prioridad && usoDe(c).n >= 1)
    .sort((a: Json, b: Json) => usoDe(b).n - usoDe(a).n);

  return {
    nota: `Pistas para ordenar; confírmalas con las descripciones antes de proponer. Sin uso = nunca o sin movimientos en ${DIAS_SIN_USO} días (sin contar Salud, pagos de año en año, deudas o préstamos con saldo pendiente ni inversiones con movimientos).`,
    uso_por_categoria: tabla(["id", "categoria", "tipo", "cuenta", "movimientos", "ultimos_90_dias", "ultimo_uso"],
      cats.map((c: Json) => [c.id, etiqueta(c), c.tipo, cuentaDe(c), usoDe(c).n, usoDe(c).n90, usoDe(c).ultimo])),
    posibles_duplicadas: tabla(["id", "categoria", "movimientos", "id_otra", "otra", "movimientos_otra", "cuenta", "tipo", "motivo"],
      parecidas.slice(0, 25).map((p) => [p.x.id, etiqueta(p.x), usoDe(p.x).n, p.y.id, etiqueta(p.y), usoDe(p.y).n, cuentaDe(p.x), p.x.tipo, p.motivo])),
    posibles_mal_clasificados: tabla(["descripcion", "id_de", "de", "id_a", "a", "movimientos", "motivo", "registro_ids"],
      malClasificados.slice(0, 15).map((m) => [m.descripcion, m.de.id, etiqueta(m.de), m.a.id, etiqueta(m.a), m.ids.length, m.motivo, m.ids.slice(0, MAX_IDS)])),
    sin_uso: tabla(["id", "categoria", "tipo", "cuenta", "movimientos", "ultimo_uso"],
      sinUso.slice(0, 30).map((c: Json) => [c.id, etiqueta(c), c.tipo, cuentaDe(c), usoDe(c).n, usoDe(c).ultimo])),
    categorias_sin_descripcion: tabla(["id", "categoria", "movimientos"],
      catsSinDescripcion.slice(0, 20).map((c: Json) => [c.id, etiqueta(c), usoDe(c).n])),
    cuentas_sin_descripcion: tabla(["id", "cuenta", "movimientos"],
      cuentasSinDescripcion.map((c: Json) => [c.id, c.nombre, movsPorCuenta.get(String(c.id)) ?? 0])),
    gastos_sin_prioridad: tabla(["id", "categoria", "movimientos"],
      gastosSinPrioridad.slice(0, 20).map((c: Json) => [c.id, etiqueta(c), usoDe(c).n])),
  };
}

// Lo mismo, más corto, para la revisión diaria: sólo lo que hay que atender, sin el uso de todas
export function resumenOrden(d: DatosOrden) {
  const { uso_por_categoria: _uso, ...resto } = revisarOrden(d);
  // En la revisión no hacen falta los ids de cada movimiento: basta con cuántos son
  resto.posibles_mal_clasificados = tabla(resto.posibles_mal_clasificados.columnas.slice(0, -1),
    resto.posibles_mal_clasificados.filas.map((f) => f.slice(0, -1)));
  return resto;
}
