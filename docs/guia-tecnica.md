# Guía técnica de GalenoFE

Basada en router, main, sesión, login, service worker y componentes actuales de `src`.

## 1. Estructura

| Carpeta / archivo | Responsabilidad |
|---|---|
| `src/index.html`, `src/js/main.js` | `<galeno-app>`, carga de estilos/registro PWA; arranque y coordinación de sesión, contexto y router. |
| `src/js/router.js` | Rutas por hash y protección por sesión. |
| `src/js/boundary/` | Shell (`galeno_app.js`, `galeno_outlet.js`, `menu_lateral.js`, `topbar.js`), login y utilidades. |
| `src/js/boundary/vistas/` | Controladores de dashboard y consultas, conservados con su comportamiento actual. |
| `src/js/boundary/componentes/` | Tarjetas, instalador, calendario, gráficas y tabla reutilizables. |
| `src/js/control/`, `src/js/entity/` | Servicios REST y lógica; entidades y respuestas/errores. |
| `src/Recursos/estilos/`, `imagenes/` | CSS propio e imágenes, respectivamente, dentro de `Recursos`. |
| `test/js/`, `test/` | Pruebas y dependencias locales de pruebas; páginas HTML y prueba del service worker. |
| `docs/` | Documentación técnica. |

## 2. Rutas y pantallas

Navegación: `#/ruta`, `navegarA(ruta)` y `hashchange`. Hash vacío: sin sesión → `/citas`; con sesión → `/dashboard`. Rutas eliminadas, desconocidas o mal codificadas → `/dashboard` con sesión o `/citas` sin sesión, sin solicitar login. Las rutas protegidas existentes sin sesión sí redirigen a `/login` y conservan la pendiente.

| Ruta | Acceso | `tag` actual |
|---|---|---|
| `/login` | Pública | Sin tag en el router; callback pide a `galeno-app` montar `galeno-login`. |
| `/citas` | Pública | Sin tag: placeholder. |
| `/dashboard` | Protegida | `resumen-controller` |
| `/consulta/:idConsulta` | Protegida | `consulta-controller` |
| `/consultas` | Protegida | `consulta-controller` |

No existe portal ni mapa de rutas del paciente. El menú lateral del personal contiene solo **Inicio** (`/dashboard`) y **Agenda Médica** (`/consultas`). HU2 mantiene la exclusión de Paciente en autenticación y restauración.

Agregar ruta: añadir `{ publica, titulo, tag }` al mapa en `router.js`. Reemplazar placeholder: asignar `tag` e importar su módulo registrado. Sin tag: «Esta pantalla está en construcción.», salvo `/login`. Enlaces: `data-route` en `menu_lateral.js`, dentro de `<galeno-menu>`. El router monta las vistas en `<galeno-outlet>`; no reemplazar este elemento al cambiar de modo.

Antes de conectar, el router asigna **propiedades JavaScript**: `usuario` (persona_rol del contexto), `parametros` (parámetros decodificados, como `{ idConsulta: '42' }`). `/consulta/:idConsulta` reutiliza el controlador de consultas; no implementa un detalle específico.

## 3. Sesión del empleado y navegación protegida

Login carga tipos activos e indicaciones → `autenticarEmpleado` valida formato, busca documento y roles excluyendo Paciente → guarda persona y emite `galeno-login-exitoso` con `detail: { persona, personaRoles }` → main establece el primer rol como contexto y `usuario`. La selección de clínica/rol de HU3 aún no existe; podrá usar `establecerContexto`.

Ruta protegida sin sesión → guarda `pendiente` en memoria → `/login` → callback `alRequerirLogin` sin duplicarse en la redirección → ingreso → `tomarPendiente('/dashboard')`. Consumirla o llamar a `detener()` la borra.

Recarga: `obtenerSesion()` → `rolesDePersona(idPersona)` → excluir Paciente → buscar id de `obtenerContexto()`. Los GET REST pasan por el service worker: red primero (timeout 3 s) y respaldo `galeno-api-v1` si falla la conexión. Sin respuesta guardada o con contexto inexistente, limpia sesión y abre login. Sin sesión siguen accesibles las rutas públicas. Cerrar sesión elimina persona/contexto y la caché API, y vuelve a `/citas` en modo público.

| Función exportada de `sesion_service.js` | Retorno / efecto |
|---|---|
| `buscarDocumento(idTipoDocumento, valor)` | `Promise<Documento\|null>`; 404 → null. |
| `rolesDePersona(idPersona)` | `Promise<Array<persona_rol>>`. |
| `autenticarEmpleado(tipoDocumento, valor)` | `Promise<{ persona, personaRoles }>`; no persiste sesión. |
| `guardarSesion(persona)` | `undefined`; guarda identidad y borra contexto previo. |
| `obtenerSesion()` | `{ idPersona, nombres, apellidos }` o null si falta o falla el parseo. |
| `establecerContexto(personaRol)` | `undefined`; guarda su `idPersonaRol`. |
| `obtenerContexto()` | `string\|null`. |
| `cerrarSesion()` | `Promise<void>`; elimina ambas claves y `galeno-api-v1`. |

Errores REST: `DefaultError` (`mensaje`, `error`), salvo 404 de documento. `sessionStorage`: `sesionPersona` (JSON: **solo** `idPersona`, `nombres`, `apellidos`) y `sesionPersonaRol` (id del contexto, texto). No persiste clínica/rol completos ni pendiente.

El paciente no inicia sesión; HU1 es pública y de solo lectura. `/citas` todavía es un placeholder, sin búsqueda implementada.

## 4. Convenciones de componentes

El shell usa DOM ligero y CSS propio en `src/Recursos/estilos/principal.css` y `shell.css`, conservando las vistas. `<galeno-app>` recibe `.usuario` (persona_rol o null) y refleja `modo="personal|publico"`. Público: encabezado con logo y enlace `#/login`, sin menú ni cierre. Personal: `<galeno-menu>` y `<galeno-topbar>` con usuario/cierre. `galeno-estado-conexion` consulta `navigator.onLine` al conectarse y ante eventos online/offline; muestra el aviso de datos guardados sin red. Sin respuesta guardada, los servicios informan «Sin conexión y sin datos guardados para esta pantalla». El outlet y el instalador persisten; main coordina sin construir layout. Con sesión guardada, `restaurando` oculta el layout hasta resolver el contexto; main lo desactiva tras asignar `usuario`, incluso si falla.

`instalador-app` vive en `galeno-topbar`, tanto público como personal; el pie no tiene botón. Solo ofrece «Instalar» (con aria-label) tras `beforeinstallprompt`, que pospone con `preventDefault`, fuera de standalone y sin `appinstalled`. Al pulsar espera `prompt()` y `userChoice`, consume el evento y se oculta; `appinstalled` también lo oculta. Conserva la oferta al cambiar de modo; sus estilos de Shadow DOM están en `instalador.css`.

`galeno-menu` recibe el atributo `ruta`; `galeno-topbar`, `.usuario` y atributo `titulo`. Salidas `CustomEvent` con propagación: `galeno-navegar` (`detail: { ruta }`), `galeno-cerrar-sesion`, `galeno-alternar-menu`. App monta `galeno-login` en `#pantalla-login` con `mostrarLogin()` y lo retira al recibir `galeno-login-exitoso` (`bubbles`, `composed`). El formulario gestiona catálogo/reintento, errores con `aria-live` y foco inicial; al desconectarse limpia listeners e ignora éxitos tardíos. App procesa alternar menú; main recibe el éxito para establecer contexto y consumir la ruta pendiente, y procesa navegación/cierre y escucha `hashchange` para marcar la ruta. Desconectar app emite `galeno-desconectar` para limpiar la coordinación; menú limpia sus listeners en `disconnectedCallback()`.

Para nuevos componentes: prefijo `galeno-`, atributos simples, propiedades para objetos y `CustomEvent` de salida. Los anteriores conservan nombres y contratos: `.consulta` en `tarjeta-consulta`; slots `titulo`, `contenido`, `pie` en `tarjeta-simple`. Calendar, DataTable y gráficas son clases auxiliares con callbacks; controladores liberan recursos con `destroy()`. Solo ECMAScript, sin frameworks, librerías ni CSS externos; Mocha/Chai/Sinon solo en pruebas. La cobertura del personal migrada del portal está en `test/js/boundary/personal_test.js` y `test/personal_test.html`; los componentes reutilizables conservan sus suites.

## 5. Checklist por archivo nuevo

- Archivo nuevo en `src`: añadir su ruta relativa a `ARCHIVOS` de `src/serviceWorker.js` (estáticos). El worker intercepta GET a `/resources/v1/` en cualquier origen; guarda solo 200 `cors`/`basic` con headers, nunca opacas ni escrituras. `activate` elimina versiones anteriores de sus cachés.
- Comportamiento nuevo: pruebas Mocha/Chai/Sinon en `test/js/`, página HTML en `test/` y ejecución en navegador; simular `fetch` cuando corresponda.
- Registrar/importar componentes, documentar entradas/salidas y verificar limpieza. Cambios pequeños y enfocados.
