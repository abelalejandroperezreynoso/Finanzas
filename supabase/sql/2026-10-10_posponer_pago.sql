-- "Retrasarlo" en un pago recurrente: el pago de este ciclo se espera otro día (el que eligió el
-- usuario) en vez de quitarse como con ignorar_hasta. La app lo usa para la fecha del pago, el
-- pronóstico y el aviso de las 8:00. Sólo agrega una columna vacía; no cambia datos existentes.
-- Se puede correr varias veces.
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS posponer_a date;
