-- Alimentación: un registro al día con cantidad 1 (lo pidió el usuario). Cambia la descripción de su
-- categoría, la que tiene el registro del caldo de albóndigas del 13 de octubre, y deja la regla en la
-- memoria del asistente. No toca registros. Se puede correr varias veces.
WITH cat AS (
    SELECT DISTINCT c.id, c.user_id
    FROM categorias c JOIN registros r ON r.categoria_id = c.id
    WHERE c.tipo = 'salud' AND c.nombre ILIKE 'alimentaci%'
      AND r.descripcion ILIKE '%alb_ndigas%'
      AND r.fecha >= '2026-10-13' AND r.fecha < '2026-10-14 12:00'
), cambio AS (
    UPDATE categorias c
    SET descripcion = 'Un registro al día con cantidad 1; en la descripción, qué comí'
    FROM cat
    WHERE c.id = cat.id
    RETURNING c.user_id
)
INSERT INTO memoria_ia (user_id, tema, nota)
SELECT DISTINCT cambio.user_id, 'preferencia', 'Alimentación: un solo registro al día con cantidad 1 (sólo indica que hubo registro); lo que comió en el día va en la descripción.'
FROM cambio
WHERE NOT EXISTS (SELECT 1 FROM memoria_ia m WHERE m.user_id = cambio.user_id AND m.nota LIKE 'Alimentación: un solo registro al día%');
