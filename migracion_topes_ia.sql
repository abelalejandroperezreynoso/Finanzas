-- ============================================================================
-- TOPES CON IA
-- ============================================================================
--
-- descripcion   Lo que tú dices de la categoría ("comida chatarra", "suscripción
--               que casi no uso"). La IA la lee para proponer un tope más preciso.
-- tope_ia       El tope que propuso la IA, en pesos.
-- tope_ia_razon Por qué lo propuso, en una frase.
-- tope_ia_mes   A qué mes aplica ese tope (AAAA-MM). Un tope de otro mes no se usa.
--
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion   text;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tope_ia       numeric;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tope_ia_razon text;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tope_ia_mes   text;

-- Comprobación: deben salir las cuatro columnas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'categorias'
  AND column_name IN ('descripcion', 'tope_ia', 'tope_ia_razon', 'tope_ia_mes');
