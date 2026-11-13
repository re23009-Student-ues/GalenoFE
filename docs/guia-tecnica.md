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
| `/citas` | Pública | `galeno-citas`: búsqueda por documento, clínica y fechas. |
| `/dashboard` | Protegida | `resumen-controller` |
| `/consulta/:idConsulta` | Protegida | `consulta-controller` |
| `/consultas` | Protegida | `consulta-controller` |
| `/atencion` | Protegida | `atencion-controller`, solicita seleccionar una consulta. |
| `/atencion/:idConsulta` | Protegida | `atencion-controller`, detalle de la consulta seleccionada. |

No existe portal ni mapa de rutas del paciente. El menú lateral del personal contiene solo **Inicio** (`/dashboard`) y **Agenda Médica** (`/consultas`). HU2 mantiene la exclusión de Paciente en autenticación y restauración.

Agregar ruta: añadir `{ publica, titulo, tag }` al mapa en `router.js`. Reemplazar placeholder: asignar `tag` e importar su módulo registrado. Sin tag: «Esta pantalla está en construcción.», salvo `/login`. Enlaces: `data-route` en `menu_lateral.js`, dentro de `<galeno-menu>`. El router monta las vistas en `<galeno-outlet>`; no reemplazar este elemento al cambiar de modo.

Antes de conectar, el router asigna **propiedades JavaScript**: `usuario` (persona_rol del contexto), `parametros` (parámetros decodificados, como `{ idConsulta: '42' }`). `/consulta/:idConsulta` conserva el controlador de consultas, obtiene por GET la consulta indicada y verifica su clínica; mantiene tarjetas con pasos reales y el evento `abrir-atencion`. El detalle está en `/atencion/:idConsulta`.

Seleccionar una tarjeta emite `abrir-atencion` con `detail: { idConsulta }`. El
router abre `#/atencion/:idConsulta`, asigna `idConsulta` al detalle y escucha
`volver-consultas` para regresar a `#/consultas`. Conserva protección por sesión
y ruta pendiente al iniciar sesión.

### Estado de la consulta en agenda y atención

Agenda Médica conserva solo consultas de la clínica activa con algún paso definido
para `usuario.idRol.idRol`. Cruza `consulta_procedimiento` con
`procedimiento_paso/procedimiento/{id}`, paginando completamente y consultando cada
procedimiento distinto una vez por carga. Incluye pasos sin ejecución y no exige
asignación a la persona de la sesión. También aplica al acceso por `/consulta/:idConsulta`.
Si falla el cruce, muestra el error sin presentar una lista parcial.

La agenda carga los pasos con `ConsultaProcedimientoPasoService.listarParaConsultas`
desde el recurso existente `consulta_procedimiento_paso` y los agrupa por
`idConsultaProcedimiento.idConsulta.idConsulta`, incluyendo todos los procedimientos
de cada consulta. La paginación debe terminar correctamente antes de mostrar las
tarjetas. No se hace una petición por tarjeta.

`estadoConsulta(consulta, ahora, pasos)` muestra **Finalizada** solo si hay al menos
un paso y todos tienen `estado` `COMPLETADO` o `FINALIZADO` (sin distinguir mayúsculas
y espacios exteriores). `fechaFin` nunca determina la finalización. Sin pasos o
con alguno pendiente, en curso, cancelado, desconocido o sin estado, permanece
Programada si `fechaInicio` es futura y En curso en otro caso.

`tarjeta-consulta.pasos` recibe los pasos reales antes de conectar el componente.
El detalle de atención aplica la misma función después de cargar sus pasos;
mientras tanto muestra «Verificando pasos…». Si falla esa carga muestra «No se
pudo verificar» y permite reintentar. La agenda muestra error de carga antes de
emitir conclusiones con datos incompletos. No se crean endpoints, pasos ni estados
persistidos en el navegador para resolver esta regla.

El detalle de atención organiza siete apartados con el Wizard existente: información
general, procedimientos, pasos de atención, exámenes disponibles, órdenes, resultados
y observaciones/cierre. Los formularios mantienen sus nodos al navegar. Carga los
recursos paginados mediante `atencion_service.js` y cruza los UUID por consulta;
los procedimientos se muestran aunque todavía no tengan ejecuciones.
Encima del Wizard permanece un encabezado con avatar circular (iniciales del
primer nombre y primer apellido del paciente), y tres líneas: nombre completo,
edad y documento, sin numeración. Un GET
paginado de `documento` busca el primer documento con valor de esa persona y
muestra tipo y número debajo; se detiene al encontrar uno, sin cargar el resto.
Sin documento muestra «Sin documentos registrados»; ante errores ofrece reintentar
solo esa búsqueda, conservando Wizard y borradores;
sin idPersona no se consulta el recurso. Esta carga es independiente de los pasos
y descarta respuestas de cargas anteriores o de una vista desconectada.

Los TextArea de valor, indicaciones de órdenes existentes, resultado/interpretación
y observaciones tienen guardado explícito por registro. Solo son editables para
el rol participante del paso (o del catálogo para observaciones), manteniendo la
clínica activa. Los otros roles se muestran en lectura. Antes de PUT se relee el
registro, se verifica clínica/rol y se comparan los campos editados para detectar
cambios previos de otra sesión; se conservan los demás valores. Esta comparación
no sustituye control de concurrencia atómico del backend. También permite POST
de resultados para órdenes existentes sin resultados. Tras un 201 sin UUID, intenta
recuperarlo del listado; si falla, informa que fue registrado y evita repetir POST.
Fechas, responsables y estados de pasos son información registrada, sin transiciones
automáticas. La consulta no tiene responsable empleado directo: se muestran los
responsables de sus pasos.

Finalizar consulta exige carga completa y ausencia de ediciones o selecciones sin
guardar. Relee todos los pasos, exige al menos uno y todos COMPLETADO/FINALIZADO,
y guarda `consulta.fechaFin` por PUT, conservando la regla visual de estado basada
en pasos. No completa pasos pendientes ni crea órdenes implícitas.

`OrdenExamen` no relaciona un examen: los Checkbox generan borradores de indicaciones
que se conservan al navegar, pero no se envían ni se atribuyen a órdenes existentes.
El backend debe agregar `idProcedimientoPasoExamen` (o una relación explícita al
examen) a la orden y validar su correspondencia con el paso para habilitar su creación.
`ExamenResultado.rutaAtestado` se muestra como referencia; la entrada de archivo
permanece deshabilitada hasta disponer de subida/descarga de adjuntos. No se envían
archivos ni se inventan rutas REST. Para un responsable único de consulta se necesita
una relación de empleado independiente del paciente `idPersonaRol`.

Si falla la carga de pasos se informa estado no verificable. Si fallan complementos,
se conservan los datos ya verificados y no se permite finalizar. Reintentar y salir
destruyen Wizard, TextAreas y sus observadores; las respuestas tardías no modifican
otra vista. Las observaciones nulas o ausentes se muestran vacías. Pruebas con REST
simulado en `test/atencion_test.html`.
Validación de esta integración: 39 pruebas de atención en escritorio y 39 en móvil
emulado de 360 × 640 con movimiento reducido, 14 de personal, 22 de agenda y la
suite del service worker, sin fallos. Los guardados se verificaron con REST simulado;
no se realizaron escrituras sobre datos reales del backend.

## 3. Sesión del empleado y navegación protegida

Login carga tipos activos e indicaciones → `autenticarEmpleado` valida formato, busca documento y roles excluyendo Paciente → guarda persona y emite `galeno-login-exitoso` con `detail: { persona, personaRoles }` → main establece el primer rol como contexto y `usuario`. HU3 agrega `galeno-selector-contexto`. Main revalida la pertenencia y actualiza usuario en memoria, app y `establecerContexto`; conserva ConfirmDialog para cerrar sesión.

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

El paciente no inicia sesión; HU1 es pública y de solo lectura. `/citas` ofrece búsqueda pública con invalidación de filtros y respuestas tardías. El ticket PDF permanece deshabilitado porque no existe el endpoint backend. Ver `docs/hu1-hu3.md`.

`galeno-cerrar-sesion` solicita confirmación con ConfirmDialog. Permanecer, Escape,
X u overlay conservan la sesión. Confirmar ejecuta `cerrarSesion()` y regresa a
`#/citas`; durante el procesamiento se bloquean cierres y clics duplicados. Al
desconectar la aplicación se destruye su confirmación pendiente sin cerrar sesión.

## 4. Convenciones de componentes

El shell usa DOM ligero y CSS propio en `src/Recursos/estilos/principal.css` y `shell.css`, conservando las vistas. `<galeno-app>` recibe `.usuario` (persona_rol o null) y refleja `modo="personal|publico"`. Público: encabezado con logo y enlace `#/login`, sin menú ni cierre. Personal: `<galeno-menu>` y `<galeno-topbar>` con usuario/cierre. `galeno-estado-conexion` consulta `navigator.onLine` al conectarse y ante eventos online/offline; muestra el aviso de datos guardados sin red. Sin respuesta guardada, los servicios informan «Sin conexión y sin datos guardados para esta pantalla». El outlet y el instalador persisten; main coordina sin construir layout. Con sesión guardada, `restaurando` oculta el layout hasta resolver el contexto; main lo desactiva tras asignar `usuario`, incluso si falla.

`instalador-app` vive en `galeno-topbar`, tanto público como personal; el pie no tiene botón. Solo ofrece «Instalar» (con aria-label) tras `beforeinstallprompt`, que pospone con `preventDefault`, fuera de standalone y sin `appinstalled`. Al pulsar espera `prompt()` y `userChoice`, consume el evento y se oculta; `appinstalled` también lo oculta. Conserva la oferta al cambiar de modo; sus estilos de Shadow DOM están en `instalador.css`.

`galeno-menu` recibe el atributo `ruta`; `galeno-topbar`, `.usuario` y atributo `titulo`. Salidas `CustomEvent` con propagación: `galeno-navegar` (`detail: { ruta }`), `galeno-cerrar-sesion`, `galeno-alternar-menu`. App monta `galeno-login` en `#pantalla-login` con `mostrarLogin()` y lo retira al recibir `galeno-login-exitoso` (`bubbles`, `composed`). El formulario gestiona catálogo/reintento, errores con `aria-live` y foco inicial; al desconectarse limpia listeners e ignora éxitos tardíos. App procesa alternar menú; main recibe el éxito para establecer contexto y consumir la ruta pendiente, y procesa navegación/cierre y escucha `hashchange` para marcar la ruta. Desconectar app emite `galeno-desconectar` para limpiar la coordinación; menú limpia sus listeners en `disconnectedCallback()`.

Para nuevos componentes: prefijo `galeno-`, atributos simples, propiedades para objetos y `CustomEvent` de salida. Los anteriores conservan nombres y contratos: `.consulta` en `tarjeta-consulta`; slots `titulo`, `contenido`, `pie` en `tarjeta-simple`. Calendar, DataTable y gráficas son clases auxiliares con callbacks; controladores liberan recursos con `destroy()`. Solo ECMAScript, sin frameworks, librerías ni CSS externos; Mocha/Chai/Sinon solo en pruebas. La cobertura del personal migrada del portal está en `test/js/boundary/personal_test.js` y `test/personal_test.html`; los componentes reutilizables conservan sus suites.

## 5. Checklist por archivo nuevo

Wizard se importa desde `boundary/componentes/navigation/wizard/index.js` con
`new Wizard(container, options).render()`. Su vista es `<galeno-wizard>` y los
estilos están en `Recursos/estilos/wizard.css`. Mantiene paneles DOM estables,
valida callbacks síncronos/asíncronos y vuelve a revisar los pasos obligatorios
antes de finalizar. No serializa formularios, persiste datos ni conoce REST. La
página sincroniza sus controles con `setData()` y destruye la instancia al salir;
destruir restaura los nodos originales e ignora resultados tardíos. Documentación
del contrato en `componentes/navigation/wizard/README.md`, ejemplo local en
`ejemplos/wizard.html` y pruebas en `test/wizard_test.html`.
El indicador usa carrusel por desbordamiento real y ResizeObserver, con opciones
`stepCarousel: { enabled, autoScroll, showArrows, smoothScroll }` (todas `true`
por defecto). Las flechas desplazan sin navegar pasos; los métodos existentes
mantienen visible el activo. `enabled: false` conserva el indicador original.
Los formularios no se reconstruyen; destroy limpia observador, frame y listeners.

TextArea se importa desde `boundary/componentes/form/textarea/index.js` con
`new TextArea(target, options).render()`. La vista `<galeno-textarea>` conserva un
textarea nativo en DOM ligero, por lo que name, FormData y validación HTML5 siguen
funcionando. Puede envolver un textarea existente sin reemplazarlo o crear uno en
un contenedor. El ajuste automático usa ResizeObserver y requestAnimationFrame y
se reactiva al mostrar pasos ocultos de Wizard o abrir Modal. Los validadores son
síncronos y setValue no emite eventos artificiales. Estilos en
`Recursos/estilos/textarea.css`, ejemplo en `ejemplos/textarea.html`, contrato en
`componentes/form/textarea/README.md` y pruebas en `test/textarea_test.html`.

- Archivo nuevo en `src`: añadir su ruta relativa a `ARCHIVOS` de `src/serviceWorker.js` (estáticos). El worker intercepta GET a `/resources/v1/` en cualquier origen; guarda solo 200 `cors`/`basic` con headers, nunca opacas ni escrituras. `activate` elimina versiones anteriores de sus cachés.
- Comportamiento nuevo: pruebas Mocha/Chai/Sinon en `test/js/`, página HTML en `test/` y ejecución en navegador; simular `fetch` cuando corresponda.
- Registrar/importar componentes, documentar entradas/salidas y verificar limpieza. Cambios pequeños y enfocados.

## 6. Integración HU1/HU3 sobre e806073

El dashboard conserva sus estadísticas y gráficas y agrega contexto laboral y agenda por rol. `galeno-agenda` emite `galeno-navegar` hacia `/atencion/{idConsulta}` para usar el detalle nuevo; no reemplaza su regla de finalización ni sus controles. La selección de contexto se invalida al navegar, iniciar/cerrar sesión o desconectar la app. Durante ConfirmDialog no se aceptan cambios de contexto.

Los seis archivos nuevos de src están incluidos en ARCHIVOS; caché estática `galenosv-v10`. Solo ECMAScript, componentes y CSS propios. La cobertura de HU1/HU3 se encuentra en `test/agenda_test.html`; no se ejecutaron pruebas durante este traslado. Ver `docs/integracion-nueva-version.md`.
