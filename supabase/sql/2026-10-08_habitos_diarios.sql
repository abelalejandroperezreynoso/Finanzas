-- Hábitos de todos los días (agua, sueño, estrés…): si a las 9 de la noche (hora del centro de
-- México) una categoría de Salud marcada con recordar_diario no tiene registro de ese día, llega un
-- aviso al teléfono con lo que falta. Así un día sin registro no se confunde con un día en cero.
-- Sólo agrega una columna (apagada en todas las categorías que ya existen), una función y una
-- tarea programada; no cambia datos. Se puede correr varias veces.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recordar_diario boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION enviar_recordatorio_habitos()
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

    WITH faltan AS (
        SELECT c.user_id, string_agg(c.nombre, ', ' ORDER BY c.nombre) AS nombres, count(*) AS n
        FROM categorias c
        WHERE c.tipo = 'salud' AND c.recordar_diario
          AND NOT EXISTS (
              SELECT 1 FROM registros r
              WHERE r.categoria_id = c.id
                AND (r.fecha AT TIME ZONE 'America/Mexico_City')::date = hoy)
        GROUP BY c.user_id
    )
    SELECT jsonb_agg(jsonb_build_object(
               'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
               'titulo', CASE WHEN f.n = 1 THEN 'Hoy te falta registrar' ELSE 'Hoy te faltan ' || f.n || ' registros' END,
               'cuerpo', f.nombres,
               'destino', 'salud'))
    INTO lista
    FROM faltan f
    JOIN suscripciones_push s ON s.user_id = f.user_id;

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
REVOKE ALL ON FUNCTION enviar_recordatorio_habitos() FROM PUBLIC, anon, authenticated;

-- Todos los días a las 03:00 UTC = 21:00 en el centro de México (sin horario de verano)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recordatorio-habitos';
SELECT cron.schedule('recordatorio-habitos', '0 3 * * *', 'SELECT public.enviar_recordatorio_habitos()');
