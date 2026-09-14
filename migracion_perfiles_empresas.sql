-- =============================================================
-- Migración: guardar el perfil de cada empresa (sector y logo)
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run
-- =============================================================
-- La app ya sabe cuánto vale cada empresa hoy, pero no qué es cada empresa.
-- En la lista de categorías todas se ven igual: un nombre, un ticker y una
-- cifra. Con el sector puesto se lee de un vistazo si el portafolio está
-- repartido o si son cinco formas distintas de apostar por lo mismo, y con el
-- logo se reconoce la empresa antes de leer nada.
--
-- Los dos datos salen del mismo Finnhub que ya da los precios, del endpoint
-- /stock/profile2, que entra en el plan gratuito y no necesita ninguna clave
-- nueva.
--
-- POR QUÉ UNA TABLA Y NO UNA CONSULTA MÁS AL ARRANQUE
-- El precio cambia cada día y por eso se pide cada vez. El sector de una
-- empresa no cambia nunca: pedirlo en cada apertura serían tantos viajes
-- como empresas tengas, cada mañana, para recibir siempre la misma respuesta.
-- Se pregunta una vez por ticker, se guarda aquí y a partir de ahí la app lo
-- lee de su propia base.
--
-- UNA FILA ES UNA EMPRESA
--   ticker    el símbolo, tal como lo escribiste en la categoría
--   nombre    el nombre oficial según Finnhub ("Apple Inc")
--   sector    la clasificación de Finnhub ("Technology", "Retail"…)
--   logo      la dirección de la imagen, servida por el propio Finnhub
--   pais      dos letras ("US")
--   bolsa     dónde cotiza ("NASDAQ NMS - GLOBAL MARKET")
--
-- LAS FILAS VACÍAS TAMBIÉN SIRVEN
-- El plan gratuito de Finnhub sólo perfila acciones de Estados Unidos: de un
-- ETF (VOO, QQQ) o de una empresa de otra bolsa contesta con un objeto vacío.
-- Esa respuesta se guarda igual, como una fila con sector y logo en nulo. Sin
-- ella la app no tendría forma de distinguir "esto no lo he preguntado" de
-- "esto ya lo pregunté y no hay nada", y volvería a preguntar por los mismos
-- tickers cada vez que la abres. La fecha de `actualizado_en` deja la puerta
-- abierta: pasado un mes se vuelve a intentar, por si Finnhub amplió su
-- cobertura.
--
-- Los perfiles son de cada usuario por la misma razón que los precios: la
-- tabla vive detrás de RLS y nadie más ve lo que tienes. Cuesta alguna fila
-- repetida entre usuarios y ahorra abrir un agujero en las políticas para una
-- tabla compartida.
--
-- Todo el script usa IF NOT EXISTS, no toca ningún dato y se puede ejecutar
-- las veces que quieras.
-- =============================================================


-- =============================================================
-- PASO 1 · LA TABLA
-- =============================================================

CREATE TABLE IF NOT EXISTS public.perfiles_empresas (
    user_id        uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    ticker         text        NOT NULL,
    nombre         text,
    sector         text,
    logo           text,
    pais           text,
    bolsa          text,
    actualizado_en timestamptz NOT NULL DEFAULT now(),

    -- Una empresa es una fila. Con esta clave, volver a preguntar por un
    -- ticker que ya estaba no duplica nada: reescribe lo que había.
    PRIMARY KEY (user_id, ticker)
);

-- La consulta que hace la app es siempre la misma: dame todos mis perfiles.
-- La clave primaria ya sirve para eso.


-- =============================================================
-- PASO 2 · SEGURIDAD
-- =============================================================
-- Mismo trato que el resto de tus tablas: cada quien ve lo suyo y nada más.

ALTER TABLE public.perfiles_empresas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'perfiles_empresas'
          AND policyname = 'perfiles_empresas_propios'
    ) THEN
        CREATE POLICY perfiles_empresas_propios
            ON public.perfiles_empresas
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;


-- =============================================================
-- PASO 3 · COMPROBACIÓN
-- =============================================================
-- Ejecuta esto después. Debe devolver una fila con la tabla ya creada y su
-- política puesta. Con la tabla recién hecha sale todo en 0: se llena sola la
-- próxima vez que abras la app.

SELECT
    (SELECT count(*) FROM public.perfiles_empresas)                        AS empresas,
    (SELECT count(*) FROM public.perfiles_empresas WHERE sector IS NOT NULL) AS con_sector,
    (SELECT count(*) FROM public.perfiles_empresas WHERE logo   IS NOT NULL) AS con_logo,
    (SELECT count(DISTINCT sector) FROM public.perfiles_empresas)          AS sectores,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'perfiles_empresas')     AS politicas;


-- =============================================================
-- PARA DESHACERLO
-- =============================================================
-- Borra la tabla y los perfiles guardados. No se pierde nada: se vuelven a
-- pedir a Finnhub en la siguiente apertura.
--
--   DROP TABLE IF EXISTS public.perfiles_empresas;
