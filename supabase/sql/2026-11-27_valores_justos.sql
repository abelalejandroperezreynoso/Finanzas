-- Valor justo de cada empresa según varias fuentes, un registro por día, para ver cómo se mueve el promedio
-- contra el precio.
--
-- Lo llena la función asistente (modo valor_justo): al abrir la ficha de una empresa (si hoy no hay dato) y una
-- vez al día con las empresas que llevan una semana sin revisar.
--   fuente   analistas_yahoo, analistas_av, analistas_fmp, dcf_fmp, dcf_propio, graham, o precio (el del día)
--   valor    dólares por acción
--   detalle  de dónde salió (alto y bajo de los analistas, cuántos son, supuestos del DCF...)
--
-- Cada quien ve lo suyo, como perfiles_empresas. Sólo crea la tabla; no cambia datos. Se puede correr varias veces.

CREATE TABLE IF NOT EXISTS public.valores_justos (
    user_id   uuid    NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    ticker    text    NOT NULL,
    dia       date    NOT NULL,
    fuente    text    NOT NULL,
    valor     numeric NOT NULL,
    detalle   jsonb,
    PRIMARY KEY (user_id, ticker, dia, fuente)
);

ALTER TABLE public.valores_justos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS valores_justos_propios ON public.valores_justos;
CREATE POLICY valores_justos_propios ON public.valores_justos
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
