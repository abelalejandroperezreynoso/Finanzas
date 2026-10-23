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
// Palabras que salen en descripciones de todo tipo y no dicen de qué se trata
const PALABRAS_COMUNES = new Set(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre",
  "octubre", "noviembre", "diciembre", "quincena", "semana", "semanal", "mensual", "anual", "dias", "hoy", "ayer", "manana",
  "pesos", "efectivo", "tarjeta", "credito", "debito", "cuenta", "mitad", "resto", "parte", "total", "otra", "este", "esta", "esto",
  "pago", "pagar", "pague", "compre", "comprar", "cobro", "cargo", "nuevo", "nueva", "algo", "cosa", "cosas"]);
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

// Si una categoría se repite con constancia: el mismo criterio con que la app detecta un pago recurrente
// (dashboard.html): 3 o más días con registro, la mediana entre uno y otro, al menos 60 % de los espacios
// dentro de 5 días o 30 % de esa mediana, y el último no más viejo que dos vueltas (mínimo 15 días)
export function constancia(dias: string[], hoy: string) {
  const unicos = [...new Set(dias)].sort();
  if (unicos.length < 3) return null;
  const espacios = unicos.slice(1).map((x, i) => diasEntre(unicos[i], x)).filter((n) => n > 0);
  if (espacios.length < 2) return null;
  const mediana = [...espacios].sort((a, b) => a - b)[Math.floor(espacios.length / 2)];
  const tolerancia = Math.max(5, mediana * 0.3);
  const validos = espacios.filter((n) => Math.abs(n - mediana) <= tolerancia);
  if (mediana <= 0 || validos.length / espacios.length < 0.6) return null;
  const cada = validos.reduce((t, n) => t + n, 0) / validos.length;
  const ultimo = unicos[unicos.length - 1];
  if (diasEntre(ultimo, hoy) > Math.max(15, cada * 2)) return null;
  return { veces: validos.length + 1, cada_dias: Math.round(cada), exacto: Math.max(...validos) - Math.min(...validos) <= 4, ultimo };
}

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

  // Predicciones apagadas ("Omitir predicciones") en lo que sí va con constancia: la app no lo espera y el
  // pronóstico no lo cuenta. Las inversiones las apaga la app a propósito (se compra cuando conviene) y Salud
  // no es dinero: no se sugieren
  const apagadas = new Map<string, { dias: string[]; montos: number[] }>();
  cats.forEach((c: Json) => { if (c.desactivar_prediccion === true && c.tipo !== "inversion" && c.tipo !== "salud") apagadas.set(String(c.id), { dias: [], montos: [] }); });
  if (apagadas.size) {
    for (const r of d.registros ?? []) {
      const a = apagadas.get(String(r.categoria_id));
      if (!a) continue;
      a.dias.push(d.diaDe(r.fecha));
      if (Math.abs(Number(r.monto) || 0) > 0) a.montos.push(Math.abs(Number(r.monto)));
    }
  }
  const constantesApagadas = cats.filter((c: Json) => apagadas.has(String(c.id))).map((c: Json) => {
    const a = apagadas.get(String(c.id))!;
    const k = constancia(a.dias, d.hoy);
    if (!k) return null;
    const ultimos = a.montos.slice(-12).sort((x, y) => x - y);
    return { c, k, monto: ultimos.length ? Math.round(ultimos[Math.floor(ultimos.length / 2)]) : null };
  }).filter((x): x is { c: Json; k: NonNullable<ReturnType<typeof constancia>>; monto: number | null } => x !== null)
    .sort((x, y) => x.k.cada_dias - y.k.cada_dias);

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

  // c) La misma palabra en movimientos de varias categorías de la misma cuenta y tipo ("autolavado" en
  // Necesidades y en Mantenimientos del Auto). No dice cuál está bien: la IA lo decide leyendo la
  // descripción de cada movimiento y el nombre y la descripción de cada categoría. Nunca entre cuentas.
  const yaListados = new Set(malClasificados.flatMap((m) => m.ids.map(String)));
  const palabrasDe = (t: unknown) => [...new Set(claveDescripcion(t).split(" ")
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 4 && !PALABRAS_VACIAS.has(w) && !GENERICAS.has(w) && !PALABRAS_COMUNES.has(w)))];
  const palabrasCat = new Map<string, string[]>();
  cats.forEach((c: Json) => palabrasCat.set(String(c.id), [...palabrasDe(c.nombre), ...palabrasDe(c.descripcion)]));
  const porPalabra = new Map<string, Map<string, { ids: unknown[]; ejemplos: string[] }>>();
  for (const r of ordenados) {
    const c = porId.get(String(r.categoria_id));
    if (!c || c.tipo === "inversion" || c.tipo === "salud") continue;
    const desc = String(r.descripcion ?? "").replace(/\s+/g, " ").trim();
    for (const w of palabrasDe(desc)) {
      const k = `${c.cuenta_id}|${c.tipo}|${w}`;
      const g = porPalabra.get(k) ?? new Map();
      const e = g.get(String(c.id)) ?? { ids: [], ejemplos: [] };
      e.ids.push(r.id);
      if (e.ejemplos.length < 3 && !e.ejemplos.includes(desc)) e.ejemplos.push(desc);
      g.set(String(c.id), e);
      porPalabra.set(k, g);
    }
  }
  const repartidos = new Map<string, { palabras: string[]; c0: Json; lista: Json[]; fuera: number; menciona: boolean }>();
  for (const [k, g] of porPalabra) {
    // En 2 a 4 categorías: en más, la palabra es de uso general ("tienda")
    if (g.size < 2 || g.size > 4) continue;
    const palabra = k.split("|")[2];
    const lista = [...g.entries()].map(([id, e]) => {
      const c = porId.get(id);
      const menciona = (palabrasCat.get(id) ?? []).some((w) => palabra.includes(w) || w.includes(palabra));
      return { c, menciona, ...e };
    }).sort((p, q) => q.ids.length - p.ids.length);
    const total = lista.reduce((t, e) => t + e.ids.length, 0);
    if (total < 3) continue;
    const fueraDeLaMayor = lista.slice(1).flatMap((e) => e.ids.map(String));
    if (fueraDeLaMayor.every((id) => yaListados.has(id))) continue;
    // Varias palabras con los mismos movimientos ("recarga telcel") van en una sola fila
    const firma = lista.map((e) => `${e.c.id}:${e.ids.map(String).sort().join(",")}`).sort().join("|");
    const previo = repartidos.get(firma);
    if (previo) { previo.palabras.push(palabra); continue; }
    const menciona = lista.some((e) => e.menciona) && !lista.every((e) => e.menciona);
    repartidos.set(firma, { palabras: [palabra], c0: lista[0].c, lista, fuera: fueraDeLaMayor.length, menciona });
  }
  // Primero donde una categoría nombra la palabra y otra no (la pista más clara), luego los más movimientos
  const repartidosOrden = [...repartidos.values()].sort((p, q) => Number(q.menciona) - Number(p.menciona) || q.fuera - p.fuera).slice(0, 12);

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
    // Movimientos de lo mismo en varias categorías de la misma cuenta: una fila por categoría; nombra_la_palabra = el
    // nombre o la descripción de la categoría la mencionan
    mismos_movimientos_en_varias_categorias: tabla(["palabra", "cuenta", "tipo", "id_categoria", "categoria", "descripcion_categoria", "nombra_la_palabra", "movimientos", "ejemplos", "registro_ids"],
      repartidosOrden.flatMap((g) => g.lista.map((e) => [g.palabras.join(" "), cuentaDe(g.c0), g.c0.tipo, e.c.id, etiqueta(e.c),
        String(e.c.descripcion ?? "").trim() || null, e.menciona, e.ids.length, e.ejemplos, e.ids.slice(0, MAX_IDS)]))),
    sin_uso: tabla(["id", "categoria", "tipo", "cuenta", "movimientos", "ultimo_uso"],
      sinUso.slice(0, 30).map((c: Json) => [c.id, etiqueta(c), c.tipo, cuentaDe(c), usoDe(c).n, usoDe(c).ultimo])),
    categorias_sin_descripcion: tabla(["id", "categoria", "movimientos"],
      catsSinDescripcion.slice(0, 20).map((c: Json) => [c.id, etiqueta(c), usoDe(c).n])),
    cuentas_sin_descripcion: tabla(["id", "cuenta", "movimientos"],
      cuentasSinDescripcion.map((c: Json) => [c.id, c.nombre, movsPorCuenta.get(String(c.id)) ?? 0])),
    gastos_sin_prioridad: tabla(["id", "categoria", "movimientos"],
      gastosSinPrioridad.slice(0, 20).map((c: Json) => [c.id, etiqueta(c), usoDe(c).n])),
    // monto_tipico: la mediana de sus últimos 12 movimientos
    predicciones_apagadas_con_constancia: tabla(["id", "categoria", "tipo", "cuenta", "veces", "cada_dias", "exacto", "ultimo", "monto_tipico"],
      constantesApagadas.slice(0, 15).map(({ c, k, monto }) => [c.id, etiqueta(c), c.tipo, cuentaDe(c), k.veces, k.cada_dias, k.exacto, k.ultimo, monto])),
  };
}

// Lo mismo, más corto, para la revisión diaria: sólo lo que hay que atender, sin el uso de todas
export function resumenOrden(d: DatosOrden) {
  const { uso_por_categoria: _uso, ...resto } = revisarOrden(d);
  // En la revisión no hacen falta los ids de cada movimiento: basta con cuántos son
  resto.posibles_mal_clasificados = tabla(resto.posibles_mal_clasificados.columnas.slice(0, -1),
    resto.posibles_mal_clasificados.filas.map((f) => f.slice(0, -1)));
  resto.mismos_movimientos_en_varias_categorias = tabla(resto.mismos_movimientos_en_varias_categorias.columnas.slice(0, -1),
    resto.mismos_movimientos_en_varias_categorias.filas.map((f) => f.slice(0, -1)));
  return resto;
}
