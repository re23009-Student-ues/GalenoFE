const CACHE = 'galenosv-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.json',
  'Recursos/estilos/principal.css',
  'Recursos/estilos/login.css',
  'Recursos/estilos/resumen.css',
  'Recursos/estilos/consultas.css',
  'Recursos/estilos/tarjeta.css',
  'Recursos/estilos/notificacion.css',
  'Recursos/imagenes/logo-menu-marino.png',
  'Recursos/imagenes/logo.png',
  'Recursos/imagenes/fondo-login.svg',
  'Recursos/imagenes/fondo-login-vertical.svg',
  'Recursos/imagenes/galeno_logo_192x192_20261103.png',
  'Recursos/imagenes/galeno_logo_512x512_20261105.png',
  'js/main.js?v=8',
  'js/router.js',
  'js/boundary/login.js',
  'js/boundary/menu_lateral.js',
  'js/boundary/topbar.js',
  'js/boundary/util_html.js',
  'js/boundary/vistas/consulta_controller.js',
  'js/boundary/vistas/resumen_controller.js',
  'js/boundary/componentes/tarjeta_simple.js',
  'js/boundary/componentes/tarjeta_consulta.js',
  'js/boundary/componentes/instalador_app.js',
  'js/boundary/componentes/notificacion_emergente.js',
  'js/control/consulta_service.js',
  'js/control/default_service.js',
  'js/control/fechas.js',
  'js/control/generador_mensajes.js',
  'js/control/personaRol_service.js',
  'js/control/resumen_service.js',
  'js/control/sesion_service.js',
  'js/control/tipoExamen_service.js',
  'js/entity/consulta.js',
  'js/entity/default_error.js',
  'js/entity/default_response.js',
  'js/entity/persona_rol.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(nombres =>
      Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n)))
    )
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});