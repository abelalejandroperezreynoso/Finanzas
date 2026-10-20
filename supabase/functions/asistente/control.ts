// La respuesta a "¿cómo recupero el control?" ya escrita, con las cifras del pronóstico: qué se espera hasta el
// ingreso, cuánto falta, cómo llega con el plan y qué pagos esperados no están registrados. Cálculo puro (sin base
// ni IA), para poder probarlo aparte: el modelo sólo la repite.

// deno-lint-ignore no-explicit-any
type Json = any;

export type DatosRespuesta = {
  saldoHoy: number;
  dia: number;            // día de hoy
  diaIngreso: number;
  entra: number;          // lo que entra ese día
  minimo: number;         // saldo más bajo antes del ingreso (negativo)
  diaMinimo: number;
  movimientos: Json[];    // desglose sin plan: { concepto, monto, es, cuando? }
  plan: Json | null;      // { mover: [{ categoria, monto }], alcanza, saldo_minimo_con_plan, creado }
  planPrevio: boolean;
  vencidos: Json[];       // { categoria, monto (negativo), se_esperaba }
};

const pesos = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const negrita = (v: number) => `**${pesos(v)}**`;
const lista = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : xs[0] ?? "";

export function respuestaRecuperarControl(d: DatosRespuesta): string {
  const renglon = (m: Json) => {
    const cuando = m.cuando ? String(m.cuando).replace(/se esperaba el (\d+) y no está registrado/g, "pendiente del $1")
      : String(m.es ?? "").startsWith("gasto común estimado") ? "lo normal en esos días" : "";
    return `- ${m.concepto}: ${negrita(Math.abs(m.monto))}${cuando ? ` (${cuando})` : ""}`;
  };
  const salen = d.movimientos.filter((m) => m.monto < 0);
  const entran = d.movimientos.filter((m) => m.monto > 0);
  const dias = d.diaIngreso - d.dia;
  const partes = [
    `Con ${negrita(d.saldoHoy)} no llegas al ${d.diaIngreso} (${dias === 1 ? "1 día" : `${dias} días`}), cuando entran ${negrita(d.entra)}.`,
    `Se esperan:\n${salen.map(renglon).join("\n")}` + (entran.length ? `\n\nEntran antes:\n${entran.map(renglon).join("\n")}` : ""),
    `Te van a faltar ${negrita(-d.minimo)}${d.diaMinimo !== d.diaIngreso - 1 ? ` (el ${d.diaMinimo})` : ""}.`,
  ];
  if (d.plan) {
    // Dos listas: lo que se deja para después del ingreso y lo que sí se paga antes (lo esperado menos lo movido)
    const movido = new Map<string, number>();
    (d.plan.mover ?? []).forEach((m: Json) => movido.set(m.categoria, (movido.get(m.categoria) ?? 0) + Number(m.monto)));
    const despues = [...movido.entries()].sort((a, b) => b[1] - a[1]);
    const sePaga = salen.map((m) => [m.concepto, Math.abs(m.monto) - (movido.get(m.concepto) ?? 0)] as [string, number])
      .filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    const renglones = (xs: [string, number][]) => xs.map(([c, v]) => `- ${c}: ${negrita(v)}`).join("\n");
    const total = (xs: [string, number][]) => negrita(xs.reduce((t, [, v]) => t + v, 0));
    const inicio = d.planPrevio && d.plan.creado ? `Tu plan del ${Number(String(d.plan.creado).slice(8, 10))} sigue:` : "El plan:";
    const cierre = d.plan.alcanza
      ? `Y evita lo prescindible. Así llegas con ${negrita(d.plan.saldo_minimo_con_plan).replace("**$", "**+$")}.`
      : `Y evita lo prescindible. Aun así te faltarían ${negrita(-d.plan.saldo_minimo_con_plan)}.`;
    partes.push([
      inicio,
      despues.length ? `Para después del ${d.diaIngreso} (${total(despues)}):\n${renglones(despues)}` : "",
      sePaga.length ? `Sí se paga (${total(sePaga)}):\n${renglones(sePaga)}` : "",
      cierre,
    ].filter(Boolean).join("\n\n"));
  }
  if (d.vencidos.length) {
    const uno = d.vencidos.length === 1;
    const cuales = d.vencidos.map((p) => `${p.categoria} ${negrita(Math.abs(p.monto))} (el ${Number(String(p.se_esperaba).slice(8, 10))})`);
    partes.push(`${uno ? "Hay un pago que esperábamos y no está registrado" : `Hay ${d.vencidos.length} pagos que esperábamos y no están registrados`}: ${lista(cuales)}. ` +
      `Si ya ${uno ? "lo hiciste, regístralo" : "los hiciste, regístralos"}; si ya no ${uno ? "lo esperas" : "los esperas"}, dímelo.`);
  }
  return partes.join("\n\n");
}
