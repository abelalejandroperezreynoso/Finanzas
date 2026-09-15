-- =============================================================
-- Migración: los sectores que tú le pones a cada categoría
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run
-- =============================================================
-- Finnhub ya dice de qué es cada empresa, pero dice una sola cosa y no siempre
-- la que tú tienes en la cabeza: Apple sale como "Technology" aunque viva del
-- hardware y también del software, y en el mapa por sectores acaba contando
-- entera en una industria que no la explica. Otras ni eso: de un ETF o de algo
-- que cotiza fuera de Estados Unidos el plan gratuito no contesta nada.
--
-- Esta columna guarda los sectores que le pones tú, en el modal de la
-- categoría, y pueden ser varios:
--
--   sectores   un arreglo de texto: {"Hardware","Software"}
--              NULL = no le pusiste ninguno
--
-- QUIÉN MANDA
-- Los tuyos, cuando los hay. El de Finnhub no desaparece: es lo que se usa
-- mientras no digas otra cosa, que no es lo mismo que ser una etiqueta por
-- encima de la tuya. Una categoría sin sectores propios se comporta hoy igual
-- que ayer, y por eso esta migración no necesita rellenar nada: las filas que
-- ya existen se quedan en NULL y siguen leyendo a Finnhub.
--
-- POR QUÉ UN ARREGLO Y NO UNA TABLA APARTE
-- Un sector aquí no es una entidad: no tiene color, ni orden, ni nada suyo que
-- guardar. Es su nombre, y nada más —el mapa agrupa por nombre y así es como
-- se vuelve a encontrar un sector al entrar en él—. Una tabla de sectores con
-- su tabla de unión sería más base de datos para guardar exactamente la misma
-- información, y obligaría a una consulta más en cada apertura de la app.
--
-- QUÉ PASA EN EL MAPA CON VARIOS
-- Una empresa con dos sectores es de los dos, pero su dinero es uno solo: el
-- mapa lo reparte en partes iguales entre ellos. Contarla entera en cada uno
-- haría que los sectores sumaran más de lo que tienes, y el mapa dejaría de
-- ser un mapa de dinero —donde el área es dinero y las partes suman el todo—.
--
-- Todo el script usa IF NOT EXISTS, no toca ningún dato y se puede ejecutar
-- las veces que quieras.
-- =============================================================


-- =============================================================
-- PASO 1 · LA COLUMNA
-- =============================================================

ALTER TABLE public.categorias
    ADD COLUMN IF NOT EXISTS sectores text[];

COMMENT ON COLUMN public.categorias.sectores IS
    'Sectores puestos a mano para esta categoría de inversión. NULL = usar el de perfiles_empresas (Finnhub).';


-- =============================================================
-- PASO 2 · SEGURIDAD
-- =============================================================
-- No hay nada que hacer. La columna vive dentro de `categorias`, que ya está
-- detrás de las mismas políticas que el resto de la fila: quien puede ver su
-- categoría puede ver sus sectores, y nadie más.


-- =============================================================
-- PASO 3 · COMPROBACIÓN
-- =============================================================
-- Ejecuta esto después. Recién hecha la migración salen ceros en las dos
-- últimas columnas: aún no le has puesto sectores a ninguna categoría.

SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'categorias'
        AND column_name = 'sectores')                                    AS columna_lista,
    (SELECT count(*) FROM public.categorias WHERE tipo = 'inversion')    AS categorias_de_inversion,
    (SELECT count(*) FROM public.categorias
      WHERE sectores IS NOT NULL AND cardinality(sectores) > 0)          AS con_sectores_propios,
    (SELECT count(*) FROM public.categorias
      WHERE sectores IS NOT NULL AND cardinality(sectores) > 1)          AS en_varios_sectores;


-- =============================================================
-- PARA DESHACERLO
-- =============================================================
-- Borra la columna y con ella los sectores que hayas escrito. Nada más se
-- pierde: las categorías vuelven a leer el sector de Finnhub, como antes.
--
--   ALTER TABLE public.categorias DROP COLUMN IF EXISTS sectores;
