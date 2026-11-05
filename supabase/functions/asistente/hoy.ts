// Cuánto ganó o perdió hoy cada posición, en dólares, con las reglas de la vista Hoy de la app: lo que ya tenía
// cuenta desde el cierre anterior; una compra del día, desde su precio si tiene hora (sin hora, todo el día);
// una venta del día, hasta su precio. Cálculo puro: los precios y los movimientos llegan ya leídos.
//   movimientoDelDia([{ nombre: "Broadcom", ticker: "AVGO", movs }], { AVGO: { precio, anterior, dia } }, 18.4)
//   → { dia, total, subieron: ["…"], bajaron: ["Broadcom (AVGO): −$12.34 USD (precio −10.4 %, $350.10 → $313.70)"], sin_datos }

export type MovDia = { tipo: "compra" | "venta"; acciones: number; precio: number; dia: string; conHora: boolean };
export type Cotizacion = { precio: number; anterior: number; dia: string };
export type EmpresaDia = { nombre: string; ticker: string; movs: MovDia[] };

const usd = (n: number, conSigno = true) =>
  `${n < 0 ? "−" : conSigno && n > 0 ? "+" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${Math.abs(Math.round(n * 10) / 10)} %`;

export function movimientoDelDia(empresas: EmpresaDia[], cotizaciones: Record<string, Cotizacion>, tc: number | null) {
  const filas: { linea: string; cambio: number }[] = [];
  const sinDatos: string[] = [];
  let total = 0, base = 0;
  const dias = new Set<string>();
  for (const e of empresas) {
    const q = cotizaciones[e.ticker];
    const antes = e.movs.filter((m) => q && m.dia < q.dia).reduce((t, m) => t + (m.tipo === "compra" ? m.acciones : -m.acciones), 0);
    const delDia = q ? e.movs.filter((m) => m.dia === q.dia) : [];
    if (!q || !(q.precio > 0) || !(q.anterior > 0)) {
      // Sólo se avisa de las que tiene: una ya vendida no hace falta
      const tiene = e.movs.reduce((t, m) => t + (m.tipo === "compra" ? m.acciones : -m.acciones), 0);
      if (tiene > 0.0001) sinDatos.push(`${e.nombre} (${e.ticker})`);
      continue;
    }
    if (antes <= 0.0001 && !delDia.length) continue;
    let cambio = Math.max(0, antes) * (q.precio - q.anterior);
    let puesto = Math.max(0, antes) * q.anterior;
    for (const m of delDia) {
      if (m.tipo === "compra") {
        const desde = m.conHora && m.precio > 0 ? m.precio : q.anterior;
        cambio += m.acciones * (q.precio - desde);
        puesto += m.acciones * desde;
      } else {
        cambio += m.acciones * ((m.precio > 0 ? m.precio : q.precio) - q.anterior);
      }
    }
    dias.add(q.dia);
    total += cambio; base += puesto;
    filas.push({
      cambio,
      linea: `${e.nombre} (${e.ticker}): ${usd(cambio)} USD (precio ${pct((q.precio / q.anterior - 1) * 100)}, $${q.anterior.toFixed(2)} → $${q.precio.toFixed(2)})`,
    });
  }
  const orden = (a: { cambio: number }, b: { cambio: number }) => Math.abs(b.cambio) - Math.abs(a.cambio);
  const dia = [...dias].sort().at(-1) ?? null;
  return {
    dia,
    total: filas.length
      ? `${usd(total)} USD${base > 0 ? ` (${pct((total / base) * 100)})` : ""}${tc ? ` ≈ ${usd(total * tc)} MXN` : ""}`
      : null,
    subieron: filas.filter((f) => f.cambio >= 0.005).sort(orden).map((f) => f.linea),
    bajaron: filas.filter((f) => f.cambio <= -0.005).sort(orden).map((f) => f.linea),
    sin_datos: sinDatos,
  };
}
