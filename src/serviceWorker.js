const CACHE = 'galenosv-v9';
const CACHE_API = 'galeno-api-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.json',
  'ejemplos/index.html',
  'ejemplos/ejemplos.css',
  'ejemplos/bar-chart.html',
  'ejemplos/bar-chart.js',
  'ejemplos/pie-chart.html',
  'ejemplos/pie-chart.js',
  'ejemplos/data-table.html',
  'ejemplos/data-table.js',
  'ejemplos/calendar.html',
  'ejemplos/calendar.js',
  'ejemplos/wizard.html',
  'ejemplos/wizard.js',
  'ejemplos/textarea.html',
  'ejemplos/textarea.js',
  'ejemplos/toast.html',
  'ejemplos/toast.js',
  'ejemplos/modal.html',
  'ejemplos/modal.js',
  'ejemplos/confirm-dialog.html',
  'ejemplos/confirm-dialog.js',
  'ejemplos/tarjeta-simple.html',
  'ejemplos/tarjeta-simple.js',
  'ejemplos/tarjeta-consulta.html',
  'ejemplos/tarjeta-consulta.js',
  'ejemplos/instalador-app.html',
  'ejemplos/instalador-app.js',
  'Recursos/estilos/calendar.css',
  'Recursos/estilos/calendar-ejemplo.css',
  'Recursos/estilos/charts.css',
  'Recursos/estilos/consultas.css',
  'Recursos/estilos/dataTable.css',
  'Recursos/estilos/toast.css',
  'Recursos/estilos/modal.css',
  'Recursos/estilos/wizard.css',
  'Recursos/estilos/textarea.css',
  'Recursos/estilos/textarea-ejemplo.css',
  'Recursos/estilos/wizard-ejemplo.css',
  'Recursos/estilos/login.css',
  'Recursos/estilos/notificacion.css',
  'Recursos/estilos/principal.css',
  'Recursos/estilos/shell.css',
  'Recursos/estilos/instalador.css',
  'Recursos/estilos/resumen.css',
  'Recursos/estilos/tarjeta.css',
  'Recursos/imagenes/logo-menu-marino.png',
  'Recursos/imagenes/logo.png',
  'Recursos/imagenes/fondo-login.svg',
  'Recursos/imagenes/fondo-login-vertical.svg',
  'Recursos/imagenes/galeno_logo_192x192_20261103.png',
  'Recursos/imagenes/galeno_logo_512x512_20261105.png',
  'Recursos/imagenes/galeno_app_01.png',
  'Recursos/imagenes/galeno_app_02.png',
  'js/boundary/componentes/calendar/calendar.js',
  'js/boundary/componentes/calendar/calendar_dates.js',
  'js/boundary/componentes/calendar/index.js',
  'js/boundary/componentes/charts/barCharts.js',
  'js/boundary/componentes/charts/index.js',
  'js/boundary/componentes/charts/pieCharts.js',
  'js/boundary/componentes/charts/pie_geometry.js',
  'js/boundary/componentes/data-display/dataTable.js',
  'js/boundary/componentes/data-display/data_table_model.js',
  'js/boundary/componentes/data-display/index.js',
  'js/boundary/componentes/feedback/Toast.js',
  'js/boundary/componentes/feedback/index.js',
  'js/boundary/componentes/overlays/Modal.js',
  'js/boundary/componentes/overlays/ConfirmDialog.js',
  'js/boundary/componentes/overlays/index.js',
  'js/boundary/componentes/navigation/wizard/Wizard.js',
  'js/boundary/componentes/navigation/wizard/index.js',
  'js/boundary/componentes/form/textarea/TextArea.js',
  'js/boundary/componentes/form/textarea/index.js',
  'js/boundary/componentes/form/textarea/README.md',
  'js/boundary/componentes/navigation/wizard/README.md',
  'js/boundary/componentes/instalador_app.js',
  'js/boundary/componentes/tarjeta_consulta.js',
  'js/boundary/componentes/tarjeta_simple.js',
  'js/boundary/login.js', // Registra <galeno-login>, montado por galeno-app.
  'js/boundary/galeno_app.js',
  'js/boundary/galeno_outlet.js',
  'js/boundary/galeno_estado_conexion.js',
  'js/boundary/menu_lateral.js',
  'js/boundary/topbar.js',
  'js/boundary/util_html.js',
  'js/boundary/vistas/consulta_controller.js',
  'js/boundary/vistas/atencion_controller.js',
  'js/boundary/vistas/resumen_controller.js',
  'js/control/consultaProcedimientoPaso_service.js',
  'js/control/consulta_service.js',
  'js/control/default_service.js',
  'js/control/fechas.js',
  'js/control/personaRol_service.js',
  'js/control/resumen_service.js',
  'js/control/roles.js',
  'js/control/sesion_service.js',
  'js/control/tipoDocumento_service.js',
  'js/control/tipoExamen_service.js',
  'js/entity/consulta.js',
  'js/entity/default_error.js',
  'js/entity/default_response.js',
  'js/entity/persona_rol.js',
  'js/main.js?v=8',
  'js/router.js'
];
const RUTAS_ESTATICAS = new Set(ARCHIVOS.map(archivo => new URL(archivo, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // No reutilizar respuestas HTTP anteriores al merge al instalar la nueva versión.
    await cache.addAll(ARCHIVOS.map(archivo => new Request(new URL(archivo, self.registration.scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(nombre =>
      (nombre.startsWith('galenosv-') && nombre !== CACHE) ||
      (nombre.startsWith('galeno-api-') && nombre !== CACHE_API)
    ).map(nombre => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Incluye el origen REST del puerto 9080 y el prefijo de despliegue, si existe.
  if (url.pathname.includes('/resources/v1/')) {
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(CACHE_API); } catch (error) { console.warn('Caché API no disponible:', error); }
      const controller = new AbortController();
      let temporizador;
      try {
        const timeout = new Promise((resolve, reject) => {
          temporizador = setTimeout(() => {
            controller.abort();
            reject(new Error('Tiempo de espera de API agotado'));
          }, 3000);
        });
        const response = await Promise.race([
          fetch(event.request, { cache: 'no-cache', signal: controller.signal }), timeout
        ]);
        if (response.status === 200 && ['cors', 'basic'].includes(response.type)) {
          try { await cache?.put(event.request, response.clone()); } catch (error) { console.warn('No se pudo guardar la respuesta API:', error); }
        }
        return response;
      } catch (error) {
        const cached = await cache?.match(event.request);
        if (cached) return cached;
        throw error;
      } finally {
        clearTimeout(temporizador);
      }
    })());
    return;
  }
  if (url.origin !== self.location.origin || !RUTAS_ESTATICAS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // En línea siempre se comprueba la versión del servidor; la caché es respaldo offline.
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Recurso no disponible: ${response.status}`);
      try {
        await cache.put(event.request, response.clone());
      } catch (error) {
        console.warn('No se pudo actualizar la caché estática:', error);
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
