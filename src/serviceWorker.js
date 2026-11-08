const CACHE = 'galenosv-v3';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.json',
  'Recursos/estilos/calendar.css',
  'Recursos/estilos/charts.css',
  'Recursos/estilos/consultas.css',
  'Recursos/estilos/dataTable.css',
  'Recursos/estilos/login.css',
  'Recursos/estilos/notificacion.css',
  'Recursos/estilos/paciente.css',
  'Recursos/estilos/principal.css',
  'Recursos/estilos/resumen.css',
  'Recursos/estilos/tarjeta.css',
  'Recursos/imagenes/logo-menu-marino.png',
  'Recursos/imagenes/logo.png',
  'Recursos/imagenes/fondo-login.svg',
  'Recursos/imagenes/fondo-login-vertical.svg',
  'Recursos/imagenes/galeno_logo_192x192_20261103.png',
  'Recursos/imagenes/galeno_logo_512x512_20261105.png',
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
  'js/boundary/componentes/instalador_app.js',
  'js/boundary/componentes/notificacion_emergente.js',
  'js/boundary/componentes/tarjeta_consulta.js',
  'js/boundary/componentes/tarjeta_simple.js',
  'js/boundary/login.js',
  'js/boundary/menu_lateral.js',
  'js/boundary/topbar.js',
  'js/boundary/util_html.js',
  'js/boundary/vistas/consulta_controller.js',
  'js/boundary/vistas/paciente_controller.js',
  'js/boundary/vistas/resumen_controller.js',
  'js/control/consultaProcedimientoPaso_service.js',
  'js/control/consulta_service.js',
  'js/control/default_service.js',
  'js/control/fechas.js',
  'js/control/generador_mensajes.js',
  'js/control/paciente_agenda.js',
  'js/control/personaRol_service.js',
  'js/control/resumen_service.js',
  'js/control/roles.js',
  'js/control/sesion_service.js',
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
    await Promise.all(nombres.filter(nombre => nombre.startsWith('galenosv-') && nombre !== CACHE).map(nombre => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Solo recursos estáticos propios. Las respuestas REST nunca se guardan aquí.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !RUTAS_ESTATICAS.has(url.pathname)) return;
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
