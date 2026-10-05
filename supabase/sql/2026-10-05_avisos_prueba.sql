-- Aviso de prueba por el mismo camino que la tarea de las 8:00 (Vault → pg_net → función
-- "avisos"), a todos los teléfonos con los avisos activados. No lee ni cambia datos de
-- dinero. Sólo la corre el flujo "Ejecutar SQL" con supabase/consultas/aviso_prueba.sql.
-- Se puede correr varias veces.
CREATE OR REPLACE FUNCTION enviar_aviso_prueba()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    secreto text;
    lista   jsonb;
BEGIN
    SELECT decrypted_secret INTO secreto FROM vault.decrypted_secrets WHERE name = 'avisos_secreto' LIMIT 1;
    IF secreto IS NULL THEN
        RAISE EXCEPTION 'Falta avisos_secreto en el Vault: corre el flujo Configurar avisos';
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
               'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth,
               'titulo', 'Aviso de prueba',
               'cuerpo', 'Así te llegará el recordatorio de las 8:00 cuando toque un pago.'))
    INTO lista
    FROM suscripciones_push;
    IF lista IS NULL THEN
        RETURN 0;
    END IF;
    PERFORM net.http_post(
        url := 'https://wmqxajsgqvhpuvqtrtsp.supabase.co/functions/v1/avisos',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcXhhanNncXZocHV2cXRydHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTk3NTAsImV4cCI6MjA5NDA5NTc1MH0.bOZUxGN4t2tcFg8_Lpi2GD7l4vRHaWRteWhKpvAeDX0',
            'x-avisos-secreto', secreto),
        body := jsonb_build_object('accion', 'enviar', 'avisos', lista),
        timeout_milliseconds := 20000);
    RETURN jsonb_array_length(lista);
END;
$$;
REVOKE ALL ON FUNCTION enviar_aviso_prueba() FROM PUBLIC, anon, authenticated;
