# Librerías locales

Aquí viven las librerías que antes se pedían a `cdn.jsdelivr.net`. Están en el repo por dos razones:

1. **La app abre sin internet.** El service worker sólo puede guardar en caché archivos del mismo
   origen, así que mientras venían de un CDN, un arranque sin red se quedaba sin Supabase ni
   gráficas y la app no servía de nada.
2. **Abre más rápido y no depende de nadie.** Un archivo propio se precarga en la instalación del
   service worker y se sirve desde el teléfono. Si el CDN va lento, está caído o bloqueado, da igual.

Son los mismos archivos que servía jsdelivr para cada paquete (su campo `jsdelivr` en el
`package.json`), sin tocar nada salvo el comentario final `sourceMappingURL`, que se quitó para que
el navegador no pida un `.map` que no está.

| Archivo | Paquete npm | Versión |
| --- | --- | --- |
| `supabase-js.js` | `@supabase/supabase-js` (`dist/umd/supabase.js`) | 2.112.3 |
| `chart.umd.min.js` | `chart.js` (`dist/chart.umd.min.js`) | 4.5.1 |
| `chartjs-chart-treemap.min.js` | `chartjs-chart-treemap` (`dist/chartjs-chart-treemap.min.js`) | 4.2.0 |
| `fullcalendar.global.min.js` | `fullcalendar` (`index.global.min.js`) | 6.1.10 |
| `pdf.min.mjs` | `pdfjs-dist` (`build/pdf.min.mjs`) | 4.10.38 |
| `pdf.worker.min.mjs` | `pdfjs-dist` (`build/pdf.worker.min.mjs`) | 4.10.38 |

`pdf.js` sólo se usa al auditar un estado de cuenta y pesa casi dos megas, así que no entra en la
precarga del service worker: se guarda solo la primera vez que se audita.

## Cómo actualizarlas

```bash
npm pack @supabase/supabase-js@2   # o el paquete que toque
tar xzf supabase-supabase-js-*.tgz
cp package/dist/umd/supabase.js vendor/supabase-js.js
```

Después hay que quitar la última línea `//# sourceMappingURL=...` del archivo copiado y **subir la
versión de `CACHE_NAME` en `sw.js`**. Sin eso, los teléfonos que ya tengan la app instalada seguirán
usando la copia vieja que tienen guardada.

`chartjs-chart-treemap` es un complemento de `chart.js`: si actualizas uno, comprueba que la versión
del otro le sirve (la 4.2.0 del treemap pide `chart.js >= 3`).
