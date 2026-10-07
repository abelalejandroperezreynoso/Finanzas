-- Si los recordatorios del asistente salieron: cuándo tocaban y cuándo se mandaron, las últimas
-- corridas de la tarea recordatorios-ia y las últimas respuestas de la función de avisos.
-- No devuelve textos ni teléfonos. Sólo lectura.
SELECT 'recordatorio' AS fila, id::text AS dato, enviar_en::text AS a, enviado_en::text AS b, creado_en::text AS c
FROM recordatorios_ia
UNION ALL
SELECT 'tarea', status, start_time::text, end_time::text, left(return_message, 200)
FROM (SELECT d.* FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
      WHERE j.jobname = 'recordatorios-ia' ORDER BY d.start_time DESC LIMIT 5) t
UNION ALL
SELECT 'tarea_con_envio', status, start_time::text, end_time::text, left(return_message, 200)
FROM (SELECT d.* FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
      WHERE j.jobname = 'recordatorios-ia' AND d.return_message NOT LIKE '%0%' ORDER BY d.start_time DESC LIMIT 5) t2
UNION ALL
SELECT 'http', status_code::text, created::text, timed_out::text, left(coalesce(error_msg, substring(content from '"status":[0-9]+')), 200)
FROM (SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5) h;
