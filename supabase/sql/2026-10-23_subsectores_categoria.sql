-- Subsectores propios: cada sector propio de una empresa puede llevar sus subsectores.
-- Se guardan por sector, con el nombre del sector como llave:
--   {"Tecnología": ["Hardware", "Software"], "Consumo": ["Ropa"]}
-- NULL = sin subsectores. Sólo agrega la columna: no toca datos.

ALTER TABLE public.categorias
    ADD COLUMN IF NOT EXISTS subsectores jsonb;

COMMENT ON COLUMN public.categorias.subsectores IS
    'Subsectores propios por sector propio: {"Sector": ["Subsector", ...]}. NULL = sin subsectores.';
