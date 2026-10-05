-- Estado de los avisos de pagos: la tarea programada, si el secreto está en el Vault y
-- cuántos teléfonos y recordatorios hay. Sólo lectura, sin datos personales.
SELECT (SELECT schedule FROM cron.job WHERE jobname = 'avisos-pagos') AS tarea,
       (SELECT count(*) FROM vault.secrets WHERE name = 'avisos_secreto') AS secreto_en_vault,
       (SELECT count(*) FROM suscripciones_push) AS telefonos,
       (SELECT count(*) FROM recordatorios WHERE enviado_en IS NULL) AS recordatorios_pendientes;
