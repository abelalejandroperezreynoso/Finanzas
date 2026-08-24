-- =============================================================
-- Migración: guardar el histórico de precios
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run
-- =============================================================
-- La app pregunta a Finnhub cuánto vale cada empresa HOY y se lo queda en
-- memoria. Al recargar, ese precio se pierde. Por eso podía decirte cuánto
-- vale tu portafolio ahora mismo pero no cómo llegó hasta ahí: sabe cuántas
-- acciones tenías en cualquier fecha pasada —eso sale de tus registros— pero
-- no a cuánto cotizaban ese día.
--
-- Esta tabla es ese segundo dato. Con ella, la curva del portafolio se
-- reconstruye entera: para cada día, las acciones que tenías por el precio
-- que tenían.
--
-- UNA FILA ES UN CIERRE DE UN DÍA
--   ticker  el símbolo, tal como lo escribiste en la categoría
--   dia     el día del cierre
--   cierre  a cuánto cerró, en dólares
--
-- EL TIPO DE CAMBIO ES UN TICKER MÁS
-- Se guarda con ticker = 'USDMXN' y cierre = pesos por dólar. Va aquí y no en
-- una tabla propia porque es exactamente el mismo dato —el precio de algo un
-- día— y separarlo obligaría a escribir dos veces cada consulta. Sin él, la
-- curva en pesos tendría que usar el tipo de cambio de hoy para todo el
-- pasado, que es tanto como decir que el peso nunca se movió.
--
-- SE LLENA DE DOS FORMAS
--   1. Hacia atrás, una sola vez, desde Configuración → "Traer histórico".
--   2. Hacia adelante, sola: cada día que abras la app, guarda el precio de
--      ese día. Así el histórico crece aunque nunca vuelvas a pedirle nada a
--      nadie.
--
-- Los precios son de cada usuario por la misma razón que el resto de tus
-- datos: la tabla vive detrás de RLS y nadie más los ve. Cuesta alguna fila
-- repetida entre usuarios y ahorra tener que abrir un agujero en las
-- políticas de seguridad para una tabla compartida.
--
-- Todo el script usa IF NOT EXISTS, no toca ningún dato y se puede ejecutar
-- las veces que quieras.
-- =============================================================


-- =============================================================
-- PASO 1 · LA TABLA
-- =============================================================

CREATE TABLE IF NOT EXISTS public.precios_historicos (
    user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    ticker     text        NOT NULL,
    dia        date        NOT NULL,
    cierre     numeric     NOT NULL,
    creado_en  timestamptz NOT NULL DEFAULT now(),

    -- La clave es el precio mismo: un ticker no cierra dos veces el mismo día.
    -- Con ella, volver a traer un tramo ya traído no duplica nada: reescribe.
    PRIMARY KEY (user_id, ticker, dia),

    -- Un cierre negativo no existe, y uno en cero es casi siempre la respuesta
    -- de una API que falló. Cualquiera de los dos hundiría la curva sin avisar.
    CONSTRAINT precios_historicos_cierre_positivo CHECK (cierre > 0)
);

-- La consulta que hace la app es siempre la misma: dame todos los cierres de
-- estos tickers, en orden. La clave primaria ya sirve para eso.


-- =============================================================
-- PASO 2 · SEGURIDAD
-- =============================================================
-- Mismo trato que el resto de tus tablas: cada quien ve lo suyo y nada más.

ALTER TABLE public.precios_historicos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'precios_historicos'
          AND policyname = 'precios_historicos_propios'
    ) THEN
        CREATE POLICY precios_historicos_propios
            ON public.precios_historicos
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;


-- =============================================================
-- PASO 3 · COMPROBACIÓN
-- =============================================================
-- Ejecuta esto después. Debe devolver una fila con la tabla ya creada y su
-- política puesta. Con la tabla recién hecha, "cierres" sale en 0: se llena
-- desde la app.

SELECT
    (SELECT count(*) FROM public.precios_historicos)              AS cierres,
    (SELECT count(DISTINCT ticker) FROM public.precios_historicos) AS tickers,
    (SELECT min(dia) FROM public.precios_historicos)              AS desde,
    (SELECT max(dia) FROM public.precios_historicos)              AS hasta,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'precios_historicos') AS politicas;


-- =============================================================
-- PARA DESHACERLO
-- =============================================================
-- Borra la tabla y todo lo que guardó. Los precios se pueden volver a traer,
-- así que no se pierde nada que no se pueda recuperar.
--
--   DROP TABLE IF EXISTS public.precios_historicos;
