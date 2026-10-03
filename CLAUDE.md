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
  Claude: chat del asistente, topes con IA y lectura del saldo desde una captura.
  El modelo sale de la variable `MODELO_IA` (por defecto `claude-sonnet-5-5`).
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
- Después de subir, revisa que la ejecución terminara bien.

## Seguridad y datos

- La clave de Anthropic vive solo en el secreto `ANTHROPIC_API_KEY` de las Edge
  Functions de Supabase. Nunca se pide, escribe ni guarda en el chat, el código o
  la app. Lo mismo con el token de Supabase.
- Las tablas usan RLS; la función `asistente` usa el JWT del usuario, no la
  service role.
- El asistente de IA solo propone cambios: la app los aplica cuando el usuario
  toca Confirmar. La IA no puede borrar nada.
- Los registros de tipo `salud` no son dinero (`monto` 0, valor en `cantidad`) y
  se excluyen de todo cálculo monetario.

## Antes de subir

- Extrae los `<script>` en línea de `dashboard.html` a un archivo temporal y
  revisa la sintaxis con `node --check`.
- Si cambias la interfaz, compruébala con Playwright (Chromium ya instalado).
- Textos de la interfaz: en español, cortos, sin explicaciones de más.
