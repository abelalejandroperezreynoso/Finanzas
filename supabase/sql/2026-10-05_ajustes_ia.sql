-- Ajustes de la IA compartidos por todos los usuarios (el crédito de Anthropic es uno solo).
-- Una sola fila: solo_haiku obliga a toda la app a usar Haiku 4.5, lo active quien lo active.
-- Sólo crea una tabla nueva; no cambia datos existentes. Se puede correr varias veces.
CREATE TABLE IF NOT EXISTS ajustes_ia (
    id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    solo_haiku   boolean NOT NULL DEFAULT false,
    cambiado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    cambiado_en  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ajustes_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ajustes_ia leer" ON ajustes_ia;
CREATE POLICY "ajustes_ia leer" ON ajustes_ia
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ajustes_ia cambiar" ON ajustes_ia;
CREATE POLICY "ajustes_ia cambiar" ON ajustes_ia
    FOR UPDATE TO authenticated USING (true) WITH CHECK (id = 1);

-- Arranca activo: ya estaba encendido en el teléfono del dueño. Si la fila existe, no se toca.
INSERT INTO ajustes_ia (id, solo_haiku) VALUES (1, true) ON CONFLICT (id) DO NOTHING;
