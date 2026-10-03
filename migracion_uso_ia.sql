-- ============================================================================
-- USO DE LA IA: un registro por cada consulta que hace un usuario
-- ============================================================================
--
-- La clave de Anthropic es una sola para toda la app, así que la función asistente
-- limita cuántas veces la puede usar cada usuario (una vez cada 24 horas). Para eso
-- cuenta aquí las consultas del usuario antes de llamar a la IA y anota la nueva
-- cuando sale bien. Cada usuario sólo ve y crea sus propios registros.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS uso_ia (
    id        bigserial PRIMARY KEY,
    user_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    funcion   text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uso_ia_usuario_fecha ON uso_ia (user_id, creado_en DESC);

ALTER TABLE uso_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uso_ia ver lo propio" ON uso_ia;
CREATE POLICY "uso_ia ver lo propio" ON uso_ia
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uso_ia anotar lo propio" ON uso_ia;
CREATE POLICY "uso_ia anotar lo propio" ON uso_ia
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Comprobación: debe salir la tabla con RLS activo
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'uso_ia';
