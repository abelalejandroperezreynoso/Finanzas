-- Memoria del asistente y seguimiento de la revisión diaria. Sólo crea tablas nuevas;
-- no cambia datos existentes. Se puede correr varias veces.

-- Notas que la IA guarda sola sobre cada usuario (metas, ingresos esperados, decisiones,
-- compromisos, preferencias) y corrige cuando algo cambia. El usuario las ve y borra en
-- Configuración; la IA no puede borrarlas.
CREATE TABLE IF NOT EXISTS memoria_ia (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    tema           text NOT NULL DEFAULT 'contexto'
                   CHECK (tema IN ('meta', 'ingreso', 'deuda', 'compromiso', 'preferencia', 'contexto')),
    nota           text NOT NULL CHECK (char_length(nota) BETWEEN 1 AND 300),
    creado_en      timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memoria_ia_usuario ON memoria_ia (user_id, actualizado_en DESC);
ALTER TABLE memoria_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memoria_ia ver lo propio" ON memoria_ia;
CREATE POLICY "memoria_ia ver lo propio" ON memoria_ia
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "memoria_ia anotar lo propio" ON memoria_ia;
CREATE POLICY "memoria_ia anotar lo propio" ON memoria_ia
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "memoria_ia corregir lo propio" ON memoria_ia;
CREATE POLICY "memoria_ia corregir lo propio" ON memoria_ia
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "memoria_ia borrar lo propio" ON memoria_ia;
CREATE POLICY "memoria_ia borrar lo propio" ON memoria_ia
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Un registro por usuario y día en que corrió la revisión: la segunda vez que se abre el
-- chat ese día (en cualquier teléfono) se devuelve lo guardado sin consultar a la IA.
CREATE TABLE IF NOT EXISTS revisiones_ia (
    user_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    dia       date NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, dia)
);
ALTER TABLE revisiones_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revisiones_ia ver lo propio" ON revisiones_ia;
CREATE POLICY "revisiones_ia ver lo propio" ON revisiones_ia
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "revisiones_ia anotar lo propio" ON revisiones_ia;
CREATE POLICY "revisiones_ia anotar lo propio" ON revisiones_ia
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Lo que encontró cada revisión y qué hizo el usuario con ello, para darle seguimiento
CREATE TABLE IF NOT EXISTS hallazgos_ia (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    dia            date NOT NULL,
    tipo           text NOT NULL,
    titulo         text NOT NULL,
    detalle        text,
    mensaje        text,
    impacto_mxn    numeric NOT NULL DEFAULT 0,
    estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'atendido', 'descartado')),
    creado_en      timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hallazgos_ia_usuario_dia ON hallazgos_ia (user_id, dia DESC);
ALTER TABLE hallazgos_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hallazgos_ia ver lo propio" ON hallazgos_ia;
CREATE POLICY "hallazgos_ia ver lo propio" ON hallazgos_ia
    FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "hallazgos_ia anotar lo propio" ON hallazgos_ia;
CREATE POLICY "hallazgos_ia anotar lo propio" ON hallazgos_ia
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "hallazgos_ia marcar lo propio" ON hallazgos_ia;
CREATE POLICY "hallazgos_ia marcar lo propio" ON hallazgos_ia
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
