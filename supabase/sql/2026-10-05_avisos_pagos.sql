-- Avisos de pagos en el teléfono (notificaciones push). Sólo crea tablas, funciones y una
-- tarea programada nuevas; no cambia datos existentes. Se puede correr varias veces.
--
-- Cómo funciona:
-- 1. La app guarda los teléfonos que activaron los avisos (suscripciones_push) y, cada vez que
--    carga los datos, los próximos pagos recurrentes que calcula (recordatorios).
-- 2. Todos los días a las 8:00 (hora del centro de México) la base arma los avisos del día y
--    se los pasa a la función "avisos", que los entrega. La base lee sus propias tablas; la
--    función nunca toca la base.
-- 3. El secreto que comparten la base y la función vive en el Vault (avisos_secreto) y en los
--    secretos de las funciones; lo pone el flujo "Configurar avisos", nunca el repositorio.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Teléfonos con los avisos activados. Un teléfono puede cambiar de usuario: el endpoint manda.
CREATE TABLE IF NOT EXISTS suscripciones_push (
    endpoint   text PRIMARY KEY,
    user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    p256dh     text NOT NULL,
    auth       text NOT NULL,
    creado_en  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE suscripciones_push ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suscripciones_push ver lo propio" ON suscripciones_push;
CREATE POLICY "suscripciones_push ver lo propio" ON suscripciones_push
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "suscripciones_push anotar lo propio" ON suscripciones_push;
CREATE POLICY "suscripciones_push anotar lo propio" ON suscripciones_push
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "suscripciones_push cambiar lo propio" ON suscripciones_push;
CREATE POLICY "suscripciones_push cambiar lo propio" ON suscripciones_push
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "suscripciones_push borrar lo propio" ON suscripciones_push;
CREATE POLICY "suscripciones_push borrar lo propio" ON suscripciones_push
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Si el mismo teléfono ya estaba suscrito con otro usuario, la app no lo ve (RLS) y no
-- puede reemplazarlo: esta función lo pasa al usuario actual.
CREATE OR REPLACE FUNCTION guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO suscripciones_push (endpoint, user_id, p256dh, auth)
    VALUES (p_endpoint, auth.uid(), p_p256dh, p_auth)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
$$;
REVOKE ALL ON FUNCTION guardar_suscripcion_push(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_suscripcion_push(text, text, text) TO authenticated;

-- Próximos pagos recurrentes, como los calcula la app (fecha local del usuario)
CREATE TABLE IF NOT EXISTS recordatorios (
    user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    categoria_id text NOT NULL,
    fecha        date NOT NULL,
    titulo       text NOT NULL CHECK (char_length(titulo) <= 120),
    detalle      text CHECK (char_length(detalle) <= 120),
    enviado_en   timestamptz,
    PRIMARY KEY (user_id, categoria_id, fecha)
);
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recordatorios ver lo propio" ON recordatorios;
CREATE POLICY "recordatorios ver lo propio" ON recordatorios
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "recordatorios anotar lo propio" ON recordatorios;
CREATE POLICY "recordatorios anotar lo propio" ON recordatorios
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "recordatorios borrar lo propio" ON recordatorios;
CREATE POLICY "recordatorios borrar lo propio" ON recordatorios
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Arma los avisos de hoy (uno por teléfono, con todos sus pagos del día), los manda a la
-- función "avisos" y los marca como enviados. Sólo la corre la tarea programada.
CREATE OR REPLACE FUNCTION enviar_avisos_pagos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    hoy     date := (now() AT TIME ZONE 'America/Mexico_City')::date;
    secreto text;
    lista   jsonb;
BEGIN
    SELECT decrypted_secret INTO secreto FROM vault.decrypted_secrets WHERE name = 'avisos_secreto' LIMIT 1;
    IF secreto IS NULL THEN
        RETURN 0;
    END IF;

    WITH pagos AS (
        SELECT user_id,
               count(*) AS n,
               string_agg(titulo || coalesce(' ' || detalle, ''), ' · ' ORDER BY titulo) AS texto
        FROM recordatorios
        WHERE fecha = hoy AND enviado_en IS NULL
        GROUP BY user_id
    )
    SELECT jsonb_agg(jsonb_build_object(
               'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
               'titulo', CASE WHEN p.n = 1 THEN 'Hoy toca pagar' ELSE 'Hoy toca pagar ' || p.n || ' cosas' END,
               'cuerpo', p.texto,
               -- Al tocarlo, la app abre los pendientes de Finanzas con el pago del día primero
               'destino', 'pagos'))
    INTO lista
    FROM pagos p
    JOIN suscripciones_push s ON s.user_id = p.user_id;

    UPDATE recordatorios SET enviado_en = now() WHERE fecha = hoy AND enviado_en IS NULL;
    IF lista IS NULL THEN
        RETURN 0;
    END IF;

    PERFORM net.http_post(
        url := 'https://wmqxajsgqvhpuvqtrtsp.supabase.co/functions/v1/avisos',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            -- La clave pública (anon) de la app: la misma que ya está en dashboard.html
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcXhhanNncXZocHV2cXRydHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTk3NTAsImV4cCI6MjA5NDA5NTc1MH0.bOZUxGN4t2tcFg8_Lpi2GD7l4vRHaWRteWhKpvAeDX0',
            'x-avisos-secreto', secreto),
        body := jsonb_build_object('accion', 'enviar', 'avisos', lista),
        timeout_milliseconds := 20000);
    RETURN jsonb_array_length(lista);
END;
$$;
REVOKE ALL ON FUNCTION enviar_avisos_pagos() FROM PUBLIC, anon, authenticated;

-- Todos los días a las 14:00 UTC = 8:00 en el centro de México (sin horario de verano)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'avisos-pagos';
SELECT cron.schedule('avisos-pagos', '0 14 * * *', 'SELECT public.enviar_avisos_pagos()');
