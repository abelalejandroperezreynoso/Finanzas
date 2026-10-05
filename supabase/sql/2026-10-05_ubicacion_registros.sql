-- Dónde se hizo un movimiento, sólo cuando se registró en el momento y el usuario activó
-- "Guardar dónde registro" en Configuración. Coordenadas redondeadas (~100 m) y el nombre
-- aproximado del lugar. Sólo agrega columnas vacías; no cambia datos. Se puede correr
-- varias veces. Las protege la misma RLS de registros.
ALTER TABLE registros ADD COLUMN IF NOT EXISTS lat   double precision;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS lng   double precision;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS lugar text;
