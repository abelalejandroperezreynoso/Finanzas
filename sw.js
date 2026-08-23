// La versión es lo que dispara el recambio: al cambiarla, el navegador vuelve a instalar el service
// worker, rellena la caché con los archivos frescos y tira la anterior. Súbela cada vez que cambies
// alguno de los archivos de abajo; si no, los teléfonos que ya tengan la app instalada seguirán
// arrancando con la copia guardada hasta que algo más los obligue a mirar la red.
const CACHE_NAME = 'gastos-app-v46';

// El armazón de la app: todo lo que hace falta para que abra y se vea, sin datos todavía.
// Se guarda entero durante la instalación para que el primer arranque desde el icono no dependa
// de la red ni un segundo.
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './dashboard.html',
    './calendario.html',
    './manifest.json',
    './icono-192.png',
    './icono-512.png',
    // Las librerías viven en el repo, no en un CDN: así se pueden guardar en caché como cualquier
    // otro archivo propio y la app abre aunque no haya internet. Un CDN es de otro origen y sus
    // respuestas no se pueden inspeccionar ni cachear con garantías, de modo que sin red la app se
    // quedaba sin Supabase ni gráficas y no arrancaba en absoluto.
    './vendor/supabase-js.js',
    './vendor/chart.umd.min.js',
    './vendor/chartjs-chart-treemap.min.js',
    './vendor/fullcalendar.global.min.js'
];

// pdf.js pesa casi dos megas y sólo se usa al auditar un estado de cuenta. No entra en la
// instalación —haría eterna la primera apertura— pero sí se guarda la primera vez que se pide,
// como cualquier otro archivo propio, así que a partir de la segunda auditoría ya es instantáneo.

// Dominios que siempre tienen que ir a la red: son datos vivos, no archivos de la app.
// Guardar una respuesta de Supabase en caché sería servir saldos viejos como si fueran de hoy.
const DOMINIOS_SIEMPRE_RED = [
    'supabase.co',
    'alphavantage.co',
    'open.er-api.com',
    'finnhub.io'
];

// Avisa a las pestañas abiertas de que hay una versión nueva ya guardada. Sin esto, la copia
// fresca se queda esperando en la caché y sólo se ve al siguiente arranque: el usuario tenía que
// cerrar la app dos veces para que un cambio apareciera, una para que se descargara y otra para
// verlo. Ahora se avisa en cuanto está lista y la app decide qué hacer con el aviso.
function avisarDeVersionNueva() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((ventanas) => ventanas.forEach((v) => v.postMessage({ tipo: 'version-nueva' })));
}

// 1. Instalación: se guarda el armazón completo.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // cache: 'reload' salta la caché HTTP del navegador. Sin esto, al subir de versión
                // se podría reguardar la misma copia vieja que ya tenía Safari y el cambio no
                // llegaría nunca al teléfono.
                return Promise.all(ASSETS_TO_CACHE.map((url) => {
                    return cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
                        // Un archivo que falle no puede impedir la instalación entera: mejor una
                        // caché incompleta, que se completa sola al usarse, que quedarse sin ninguna.
                        console.warn('No se pudo precargar', url, err);
                    });
                }));
            })
            .then(() => self.skipWaiting())
    );
});

// 2. Activación: se borran las cachés de versiones anteriores.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nombres) => {
            const viejas = nombres.filter((nombre) => nombre !== CACHE_NAME);
            viejas.forEach((nombre) => console.log('Borrando caché antigua:', nombre));
            // Que hubiera cachés viejas es lo que distingue una actualización de una instalación
            // desde cero. En la primera instalación no hay a quién avisar —nadie está mirando una
            // versión anterior— y avisar recargaría la app recién abierta sin motivo.
            return Promise.all(viejas.map((nombre) => caches.delete(nombre)))
                .then(() => viejas.length > 0);
        }).then((eraUnaActualizacion) => {
            return self.clients.claim().then(() => {
                if (eraUnaActualizacion) return avisarDeVersionNueva();
            });
        })
    );
});

// 3. Peticiones: "servir de la caché y actualizar por detrás" (stale-while-revalidate).
//
// Antes se iba a la red primero y sólo se caía a la caché si fallaba. Eso significaba que cada
// apertura de la app en el teléfono esperaba a descargar el HTML —y el dashboard pesa más de un
// mega— antes de pintar nada; con la señal de datos floja, eran varios segundos mirando una
// pantalla en blanco aun teniendo el archivo guardado.
//
// Ahora la copia guardada se entrega de inmediato y la descarga sigue en segundo plano para dejar
// la versión nueva lista. El precio es que un cambio recién publicado se ve al siguiente arranque
// y no en el mismo; a cambio, la app abre al instante siempre, con red o sin ella.
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Sólo se gestionan lecturas: un POST o un PATCH nunca se guardan ni se sirven de caché.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Datos vivos y cualquier otro origen: derechos a la red, sin tocar la caché.
    if (DOMINIOS_SIEMPRE_RED.some((dominio) => url.hostname.endsWith(dominio))) return;
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(request).then((cacheada) => {
                const enRed = fetch(request)
                    .then((respuesta) => {
                        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
                            // La respuesta sólo se puede leer una vez: unas copias van a la caché y
                            // a la comparación, y el original al navegador. Los clones se sacan aquí,
                            // antes de que nadie lo lea.
                            const paraGuardar = respuesta.clone();
                            const paraComparar = (request.mode === 'navigate' && cacheada) ? respuesta.clone() : null;
                            const guardado = cache.put(request, paraGuardar);

                            // Si la página que se acaba de servir de la caché ya no es la que hay en
                            // el servidor, hay que decirlo: la copia nueva queda guardada aquí mismo,
                            // pero el usuario está mirando la vieja. Esto cubre además el caso de
                            // publicar un cambio sin subir la versión de CACHE_NAME, donde el service
                            // worker no se reinstala y nadie se enteraría.
                            //
                            // El aviso espera a que la copia nueva esté guardada de verdad. Avisando
                            // antes, la app se recargaba tan rápido que la caché todavía tenía la
                            // vieja: volvía a servirla y el usuario seguía sin ver el cambio.
                            if (paraComparar) {
                                event.waitUntil(
                                    Promise.all([guardado, cacheada.clone().text(), paraComparar.text()])
                                        .then(([, vieja, nueva]) => {
                                            if (vieja !== nueva) return avisarDeVersionNueva();
                                        })
                                        .catch(() => {})
                                );
                            }
                        }
                        return respuesta;
                    })
                    .catch(() => {
                        // Sin red. Si había copia guardada ya se entregó; si no, se propaga el
                        // fallo y se resuelve más abajo.
                        return null;
                    });

                // Con copia guardada se contesta al instante y la red se queda actualizando sola.
                if (cacheada) {
                    event.waitUntil(enRed);
                    // Se entrega una copia: el original se queda aquí para poder compararlo con lo
                    // que traiga la red. Un cuerpo sólo se puede leer una vez.
                    return cacheada.clone();
                }

                // Sin copia (primera visita a esa dirección) toca esperar a la red. Si tampoco hay
                // red y es una navegación, se enseña la pantalla de acceso, que decide a dónde ir
                // según haya sesión o no; así la app nunca acaba en el error del navegador.
                return enRed.then((respuesta) => {
                    if (respuesta) return respuesta;
                    if (request.mode === 'navigate') return cache.match('./index.html');
                    return Response.error();
                });
            });
        })
    );
});
