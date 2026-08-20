const CACHE_NAME = 'gastos-app-v2';

// Archivos estáticos principales que queremos guardar en el dispositivo
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './dashboard.html',
    './manifest.json',
    './icono-192.png',
    './icono-512.png'
];

// 1. Fase de Instalación: Guardamos los archivos estáticos en caché
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caché abierta');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// 2. Fase de Activación: Limpiamos cachés de versiones anteriores si actualizas la app
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Borrando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fase de Peticiones (Fetch): Estrategia "Network First"
self.addEventListener('fetch', (event) => {
    const requestUrl = event.request.url;

    // IGNORAR peticiones a Supabase y otras APIs externas.
    // Estas SIEMPRE deben requerir internet.
    if (
        requestUrl.includes('supabase.co') ||
        requestUrl.includes('alphavantage.co') ||
        requestUrl.includes('open.er-api.com')
    ) {
        return; // Permite que la petición fluya normalmente por la red
    }

    // Para los demás archivos (HTML, CSS, imágenes), intentamos ir a la red primero
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si hay red, clonamos la respuesta y la actualizamos en la caché
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red (modo offline), servimos lo que tengamos en caché
                return caches.match(event.request);
            })
    );
});
