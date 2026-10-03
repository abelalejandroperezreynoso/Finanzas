// Topes con IA: recibe las categorías de gasto de un mes (con su descripción, prioridad e
// historial) y le pide a Claude un tope para el mes siguiente con una razón corta.
//
// Vive en Supabase y no en la app porque la clave de Anthropic no puede ir en el teléfono:
// cualquiera podría leerla. Aquí se guarda como secreto (ANTHROPIC_API_KEY) y sólo la
// pueden usar los usuarios con sesión iniciada: Supabase rechaza la llamada sin su JWT, y
// cada usuario tiene un número limitado de consultas al día (tabla uso_ia).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_CATEGORIAS = 80;

// La clave es una sola para toda la app: cada usuario puede consultar a la IA esta
// cantidad de veces por cada 24 horas. Se cuenta en la tabla uso_ia.
const CONSULTAS_POR_DIA = 1;
const FUNCION = "topes-ia";

const SISTEMA = `Eres un asesor de finanzas personales para una persona en México (montos en MXN).
Recibes sus categorías de gasto de un mes: nombre, descripción que ella escribió (si la hay),
prioridad según la técnica de las 4 N (vital, operativa, util, prescindible o sin asignar),
lo que gastó en los últimos meses y cuántas veces gastó en el último.

Para cada categoría propón un tope mensual para el mes siguiente:
- Lo vital y lo operativo casi nunca se recorta; deja el tope en lo habitual salvo que el gasto se haya disparado.
- Lo útil se puede reducir con moderación; lo prescindible, con firmeza.
- Si la descripción indica un gasto dañino o innecesario (por ejemplo comida chatarra, apuestas, cigarros), puedes proponer 0.
- Usa la descripción y el historial para ser concreto: un gasto que subió mucho de golpe merece volver a su nivel normal.
- El tope nunca debe ser mayor que lo gastado en el último mes. Redondea a múltiplos de 50.
- "razon": una frase corta en español (máximo 12 palabras), directa y amable, sin repetir el monto.

Responde con un tope por cada categoría recibida, usando su mismo id.`;

const ESQUEMA = {
  type: "object",
  properties: {
    topes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          tope: { type: "number" },
          razon: { type: "string" },
        },
        required: ["id", "tope", "razon"],
        additionalProperties: false,
      },
    },
  },
  required: ["topes"],
  additionalProperties: false,
};

type CategoriaEntrada = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  prioridad?: string | null;
  gastos: number[];
  veces?: number;
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  let entrada: { mes?: string; meses?: string[]; categorias?: CategoriaEntrada[] };
  try {
    entrada = await req.json();
  } catch {
    return responder({ error: "Cuerpo inválido" }, 400);
  }
  const categorias = Array.isArray(entrada.categorias) ? entrada.categorias.slice(0, MAX_CATEGORIAS) : [];
  if (categorias.length === 0) return responder({ topes: [] });

  // Sólo lo necesario y con largo acotado: el texto lo escribe el usuario
  const limpias = categorias.map((c) => ({
    id: String(c.id).slice(0, 64),
    nombre: String(c.nombre ?? "").slice(0, 80),
    descripcion: c.descripcion ? String(c.descripcion).slice(0, 200) : null,
    prioridad: c.prioridad ? String(c.prioridad).slice(0, 20) : "sin asignar",
    gastos: (Array.isArray(c.gastos) ? c.gastos : []).slice(-6).map((n) => Math.round(Number(n) || 0)),
    veces: Math.round(Number(c.veces) || 0),
  }));

  // El usuario que llama, con su propia sesión: así la tabla uso_ia sólo le deja
  // contar y anotar sus propios registros
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: sesion } = await supabase.auth.getUser();
  if (!sesion?.user) return responder({ error: "Inicia sesión para usar la IA." }, 401);

  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recientes, error: errorUso } = await supabase
    .from("uso_ia")
    .select("creado_en")
    .eq("funcion", FUNCION)
    .gte("creado_en", hace24h)
    .order("creado_en", { ascending: true });
  // Sin poder contar no se consulta: sin el límite, la clave quedaría abierta
  if (errorUso) {
    return responder({ error: "Falta preparar la base: ejecuta migracion_uso_ia.sql en Supabase." }, 500);
  }
  if ((recientes ?? []).length >= CONSULTAS_POR_DIA) {
    const primera = new Date((recientes ?? [])[0].creado_en).getTime();
    const horas = Math.max(1, Math.ceil((primera + 24 * 60 * 60 * 1000 - Date.now()) / (60 * 60 * 1000)));
    return responder({ error: `Ya usaste la IA hoy. Podrás volver a calcular en ${horas} h.` }, 429);
  }

  const client = new Anthropic();
  try {
    // fallbacks "default": si el modelo declina, el servidor reintenta con el que corresponda
    const params = {
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{
        role: "user",
        content: `Mes analizado: ${entrada.mes ?? "—"}. Los gastos van del mes más viejo al más reciente` +
          `${Array.isArray(entrada.meses) ? ` (${entrada.meses.join(", ")})` : ""}.\n\n` +
          JSON.stringify(limpias),
      }],
    };
    // deno-lint-ignore no-explicit-any
    const respuesta = await client.beta.messages.create(params as any);

    if (respuesta.stop_reason === "refusal") {
      return responder({ error: "La IA no pudo responder esta vez." }, 422);
    }
    if (respuesta.stop_reason === "max_tokens") {
      return responder({ error: "La respuesta de la IA quedó incompleta." }, 502);
    }
    const bloque = respuesta.content.find((b) => b.type === "text");
    const datos = bloque && bloque.type === "text" ? JSON.parse(bloque.text) : { topes: [] };
    const ids = new Set(limpias.map((c) => c.id));
    const topes = (Array.isArray(datos.topes) ? datos.topes : [])
      .filter((t: { id: string }) => ids.has(String(t.id)))
      .map((t: { id: string; tope: number; razon: string }) => ({
        id: String(t.id),
        tope: Math.max(0, Math.round(Number(t.tope) || 0)),
        razon: String(t.razon ?? "").slice(0, 160),
      }));
    // Se anota sólo la consulta que salió bien: un error no gasta el turno del día
    await supabase.from("uso_ia").insert({ user_id: sesion.user.id, funcion: FUNCION });
    return responder({ topes });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return responder({ error: "La clave de Anthropic no es válida. Revisa el secreto ANTHROPIC_API_KEY." }, 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return responder({ error: "Demasiadas consultas seguidas. Intenta en un minuto." }, 429);
    }
    if (error instanceof Anthropic.APIError) {
      return responder({ error: `Error de la IA (${error.status}).` }, 502);
    }
    if (error instanceof SyntaxError) {
      return responder({ error: "La respuesta de la IA no se pudo leer." }, 502);
    }
    console.error(error);
    return responder({ error: "Error inesperado." }, 500);
  }
});
