# Finanzas

App personal de finanzas (PWA para iPhone, estilo iOS, en español) sobre Supabase.
La usan dos personas. El dueño trabaja desde el celular: los cambios se suben
directo a `main`, sin ramas ni pull requests, salvo que pida otra cosa.

## Estructura

- `dashboard.html`: toda la app en un solo archivo (CSS y JS en línea). Usa Chart.js
  y librerías locales de `vendor/`.
- `sw.js`: service worker. **En cada cambio de la app sube el número de `CACHE_NAME`**
  (`gastos-app-vNNN`), o el iPhone sigue mostrando la versión vieja. `CACHE_LOGOS`
  no se toca.
- `supabase/functions/asistente/`: Edge Function (Deno) que habla con la API de
  Claude: chat del asistente (meta: todo bajo control y que al usuario le quede más dinero cada
  mes; si algo se sale de control, soluciones claras y directas, sin análisis de más; datos
  correctos como base), revisión diaria proactiva con seguimiento, topes con IA, lectura del saldo desde una captura
  y la pregunta final de Registrar. Para tener todo ordenado, `revisar_orden` (cálculo puro en `orden.ts`) busca
  categorías duplicadas, sin uso, sin descripción y movimientos mal clasificados; `proponer_mover_movimientos` mueve
  varios en una sola tarjeta. La IA no borra categorías: le dice al usuario cuáles borrar.
  En salud, `resumen_salud` compara cada categoría contra lo normal de la persona, sugiere
  hábitos para registrar según la enfermedad y busca relaciones entre hábitos y enfermedades.
  Para inversiones, `mercado_acciones` trae datos del día de Finnhub (precio, rendimientos, P/E,
  analistas, titulares) y `programar_recordatorio` propone un aviso a una hora (`recordatorios_ia`).
  El modelo por defecto es Haiku 4.5 (`claude-haiku-4-5`), con o sin el ajuste
  "Solo Haiku"; en el chat se puede elegir otro a mano. La variable `MODELO_IA`
  sólo cambia el respaldo de la función.
- `supabase/functions/avisos/`: entrega las notificaciones push (Web Push). No toca la
  base: la tarea `avisos-pagos` de pg_cron (8:00 hora de México) arma los avisos con
  `recordatorios` y `suscripciones_push` y se los pasa con el secreto del Vault
  (`avisos_secreto`). La app sincroniza `recordatorios` con los pagos recurrentes de
  fecha exacta. Las claves las pone una vez el flujo `configurar-avisos.yml`. Los recordatorios
  del asistente (`recordatorios_ia`) los manda cada minuto la tarea `recordatorios-ia` por el
  mismo camino, y la tarea `recordatorio-habitos` (9 p.m.) avisa de las categorías de Salud con
  `recordar_diario` que ese día no tienen registro.
- `herramientas/robotito.py`: dibuja al robotito del asistente (pixeles, por capas) y
  reescribe `ROBOT_PNG` en `dashboard.html`. Para cambiar el dibujo se edita este
  archivo y se corre; las animaciones están en el CSS `.robotito`. No edites los
  base64 a mano.
- `migracion_*.sql` en la raíz: migraciones ya aplicadas a mano; quedan como
  historial.
- `supabase/sql/`: migraciones nuevas (ver abajo).

## Publicación automática (GitHub Actions)

Ambos flujos usan los secretos del repositorio `SUPABASE_ACCESS_TOKEN` y
`SUPABASE_PROJECT_REF`.

- `.github/workflows/deploy-functions.yml`: al subir cambios en
  `supabase/functions/**` a `main` publica todas las funciones. No hace falta
  pegar código en el panel de Supabase.
- `.github/workflows/ejecutar-sql.yml`: al subir archivos `.sql` nuevos o
  modificados en `supabase/sql/` a `main` los ejecuta en la base de datos de
  producción. También se corre a mano (Run workflow) con la ruta de un archivo.

Reglas para el SQL:
- Va en `supabase/sql/` con nombre `AAAA-MM-DD_descripcion.sql`; no se le da al
  usuario para copiar y pegar.
- Debe poder correrse varias veces sin romper nada (`IF NOT EXISTS`,
  `DROP ... IF EXISTS`, `CREATE OR REPLACE`).
- Antes de subir SQL que borre o modifique datos existentes, pregunta al usuario.
- El repositorio es público y los registros de Actions también: nunca imprimas
  datos de la base en un flujo.
- Para leer el resultado de una consulta (solo lectura, en `supabase/consultas/`):
  genera un par de claves RSA en el scratchpad, corre el flujo a mano con
  `clave_publica` (PEM en base64) y descifra `LLAVE_CIFRADA` / `RESULTADO_CIFRADO`
  del registro. Nunca subas la clave privada.
- Después de subir, revisa que la ejecución terminara bien.

## Seguridad y datos

- La clave de Anthropic vive solo en el secreto `ANTHROPIC_API_KEY` de las Edge
  Functions de Supabase. Nunca se pide, escribe ni guarda en el chat, el código o
  la app. Lo mismo con el token de Supabase.
- Las tablas usan RLS; la función `asistente` usa el JWT del usuario, no la
  service role.
- El asistente de IA solo propone cambios: la app los aplica cuando el usuario
  toca Confirmar. Lo único que puede proponer borrar son movimientos (`registros`), con una
  tarjeta que enseña cada uno; nunca categorías, cuentas ni su memoria.
- Excepción: su memoria (`memoria_ia`, notas sobre el usuario) la guarda y corrige
  sola, sin confirmar; no puede borrarla. El usuario la ve y borra en Configuración.
- La revisión diaria corre una vez por usuario y día (`revisiones_ia`); sus
  hallazgos quedan en `hallazgos_ia` con lo que hizo el usuario (atendido o
  descartado) para darles seguimiento.
- Ubicación (`registros.lat`, `lng`, `lugar`): sólo con "Guardar dónde registro" activo
  (por usuario y teléfono) y sólo para lo registrado en el momento; redondeada a ~100 m,
  con nombre de OpenStreetMap. Se anota después de guardar, nunca lo retrasa.
- Los registros de tipo `salud` no son dinero (`monto` 0, valor en `cantidad`) y
  se excluyen de todo cálculo monetario. Cada categoría de Salud tiene `grupo_salud`
  (enfermedad o hábito) y `medida_salud`: intensidad 1–10 (se promedia), veces (se suman),
  horas (por día) o valor, una medición con su unidad en `unidad_salud` (°C, mg/dL, kg; se
  promedia con mínimo y máximo). Los detalles van en la descripción del registro.

## Antes de subir

- Extrae los `<script>` en línea de `dashboard.html` a un archivo temporal y
  revisa la sintaxis con `node --check`.
- Si cambias la interfaz, compruébala con Playwright (Chromium ya instalado).
- Textos de la interfaz: en español, cortos, sin explicaciones de más.
