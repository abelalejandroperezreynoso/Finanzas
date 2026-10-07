-- Recordatorios a una hora ("recuérdame en media hora…") que el usuario confirma en el chat del
-- asistente. Llegan como aviso al teléfono por el mismo camino que los avisos de pagos. Sólo crea
-- una tabla, una función y una tarea programada nuevas; no cambia datos existentes. Se puede
-- correr varias veces.

CREATE TABLE IF NOT EXISTS recordatorios_ia (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    enviar_en  timestamptz NOT NULL,
    texto      text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 200),
    creado_en  timestamptz NOT NULL DEFAULT now(),
    enviado_en timestamptz
);
CREATE INDEX IF NOT EXISTS recordatorios_ia_por_enviar ON recordatorios_ia (enviar_en) WHERE enviado_en IS NULL;
ALTER TABLE recordatorios_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recordatorios_ia ver lo propio" ON recordatorios_ia;
CREATE POLICY "recordatorios_ia ver lo propio" ON recordatorios_ia
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "recordatorios_ia anotar lo propio" ON recordatorios_ia;
CREATE POLICY "recordatorios_ia anotar lo propio" ON recordatorios_ia
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND enviado_en IS NULL);
DROP POLICY IF EXISTS "recordatorios_ia borrar lo propio" ON recordatorios_ia;
CREATE POLICY "recordatorios_ia borrar lo propio" ON recordatorios_ia
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Manda los recordatorios que ya tocan (uno por teléfono del usuario) y los marca como enviados.
-- Los que se atrasaron más de 12 horas se marcan sin mandarse: ya no sirven. Sin nada que mandar
-- no llama a la función. Sólo la corre la tarea programada.
CREATE OR REPLACE FUNCTION enviar_recordatorios_ia()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    secreto text;
    lista   jsonb;
BEGIN
    -- Sin el secreto no se puede mandar nada: se quedan pendientes en vez de perderse
    SELECT decrypted_secret INTO secreto FROM vault.decrypted_secrets WHERE name = 'avisos_secreto' LIMIT 1;
    IF secreto IS NULL THEN
        RETURN 0;
    END IF;

    WITH tocan AS (
        UPDATE recordatorios_ia SET enviado_en = now()
        WHERE enviado_en IS NULL AND enviar_en <= now()
        RETURNING user_id, texto, enviar_en
    )
    SELECT jsonb_agg(jsonb_build_object(
               'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
               'titulo', 'Recordatorio', 'cuerpo', t.texto))
    INTO lista
    FROM tocan t
    JOIN suscripciones_push s ON s.user_id = t.user_id
    WHERE t.enviar_en > now() - interval '12 hours';

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
REVOKE ALL ON FUNCTION enviar_recordatorios_ia() FROM PUBLIC, anon, authenticated;

-- Cada minuto: sin recordatorios pendientes es una consulta vacía y no llama a nada
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recordatorios-ia';
SELECT cron.schedule('recordatorios-ia', '* * * * *', 'SELECT public.enviar_recordatorios_ia()');
