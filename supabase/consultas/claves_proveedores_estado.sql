-- Qué claves de proveedores tiene guardadas cada usuario: sólo el proveedor, el largo y la fecha,
-- nunca la clave. Sólo lectura.
SELECT left(user_id::text, 8) AS usuario, proveedor, char_length(clave) AS largo,
       clave ~ '^\s|\s$' AS con_espacios, actualizado_en
FROM claves_proveedores
ORDER BY 1, 2;
