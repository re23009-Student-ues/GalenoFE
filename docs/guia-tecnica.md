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
| `/citas` | Pública | `galeno-citas`: validación de documento y búsqueda; fechas opcionales en los resultados. |
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
para `usuario.idRol.idRol`. Consulta `GET consulta?clinica=…&rol=…`; el backend
usa EXISTS sobre procedimientos y definiciones de pasos, sin exigir ejecución ni
responsable asignado. También se comprueba la participación por rol al acceder a
`/consulta/:idConsulta`. Las páginas deben completarse antes de mostrar resultados;
un fallo no se presenta como lista parcial.

Las tarjetas de Agenda Médica reciben `TarjetaConsulta.resumenEstado` desde
`GET consulta/estados?consultas=…`: DTO con total de ejecuciones, finalizadas,
estado e instante del servidor. No descargan ejecuciones solo para decidir el
estado, ni convierten los conteos en pasos ficticios. El cliente divide conjuntos
en bloques de 50, completa sus páginas y rechaza resúmenes ausentes o ajenos.

Finalizada exige ejecuciones no vacías, todas COMPLETADO/FINALIZADO, sin distinguir
mayúsculas y espacios exteriores. FechaFin no determina finalización. Si no se
cumple: Programada con inicio futuro y En curso en otro caso, incluido inicio nulo.
El resumen considera todos los procedimientos y roles de la consulta.

Atención conserva `listarParaConsultas` y `estadoConsulta(consulta, ahora, pasos)`
porque necesita ejecuciones reales para formularios y responsables; mientras
carga muestra «Verificando pasos…» y ante fallo «No se pudo verificar», con reintento.
El detalle de agenda por rol conserva sus registros para mostrar antecedentes.
Los DTO agregados nunca se usan como ejecuciones editables del Wizard.

La atención usa el Wizard existente con un paso por ejecución real de
`consulta_procedimiento_paso`. `atencion_controller.js` coordina carga y encabezado;
`atencion_flujo.js` conserva los formularios y borradores por UUID de ejecución,
selección de procedimiento y navegación según `procedimiento_paso_secuencia`.
No hay pasos médicos fijos ni ejecuciones fabricadas. Un único procedimiento del
rol activo se abre automáticamente; varios usan selector. Los procedimientos de
otros roles no se ofrecen para atender. Un grafo cíclico, duplicado o incompleto
no se convierte en una cadena arbitraria. Los pasos sin ejecución se avisan y no
se inventan registros.

El encabezado permanece fuera del Wizard: paciente, iniciales, edad, documento,
fecha, responsable, procedimiento y estado. Atención obtiene su consulta mediante
`GET consulta/{id}`, sin descargar el listado global. Documento se busca con
`GET documento?persona={idPersona}&first=…&max=50`, con carga y reintento independientes.
El filtro pagina solo documentos de esa persona y conserva Total-registros filtrado.
Si hay varios, se muestra el de menor UUID con valor no vacío, como en el recorrido
global anterior; un error de carga no se presenta como ausencia de documento. Observaciones de consulta
(lectura) y de procedimiento (lectura) están fuera de
los pasos y no se duplican. El PUT genérico de consulta está bloqueado: su merge
puede eliminar procedimientos y pasos omitidos en el JSON por orphanRemoval.
El PUT genérico de procedimiento tampoco se usa para editar
observaciones: contiene colecciones con cascadas/orphanRemoval; requiere un DTO o
una operación que actualice campos de la entidad administrada sin sustituirlas.

Cada paso contiene TextArea de atención y, si existen configuraciones activas,
Checkbox propios del paso. Ningún examen se selecciona automáticamente. Indicaciones
por selección y registros existentes se conservan en borrador al navegar; los
resultados se leen/editan con el permiso por rol que ya usaba la pantalla. Solo
se registra un resultado para una orden existente cuando el empleado escribe
contenido explícitamente; no se crean resultados vacíos. Los enlaces de adjuntos
solo admiten http/https; otras rutas se muestran como referencias, sin inventar
un endpoint de descarga o subida.

Guardar envía cambios escalares y originales a los PUT `/{id}/atencion` de
consulta_procedimiento_paso, orden_examen y examen_resultado. El backend verifica
contexto, relaciones persistidas, rol, estado y grafo bajo bloqueo; compara antes
de escribir y actualiza solo campos permitidos de la entidad administrada, sin
merge del árbol. Los PUT genéricos de esos tres recursos se rechazan. Los POST de
resultados usan `/examen_resultado/atencion`, con contexto/consulta y clave UUID
estable; recuperan el UUID desde Location canónico, sin búsqueda por contenido.

Un fallo parcial conserva lo pendiente y lo ya confirmado. Un conflicto 409 no
hace avanzar ni sobrescribe datos; pide recargar. No hay transacción que abarque
todos los CRUD del Wizard. Navegar nunca completa pasos; los estados cancelados
o desconocidos muestran contenido en solo lectura. Siguiente conserva guardado
antes de navegar; Anterior conserva nodos y borradores.

Iniciar/completar pasos y finalizar procedimientos permanecen bloqueados: los
contratos de escritura de atención actualizan contenido, sin definir esas
transiciones clínicas. Las funciones antiguas de iniciar/cerrar mediante PUT
genérico no permiten esa transición. No se cierra toda la consulta al
revisar o terminar un procedimiento. La atención es obligatoria para solicitar
completar; los exámenes permanecen opcionales.

Se necesita una relación persistida de orden a `procedimiento_paso_examen` para
crear órdenes identificables e idempotentes. No se asocian órdenes históricas por
nombre, por posición ni por ser la única opción. No se eliminan órdenes/resultados
al desmarcar. La migración SQL y los endpoints necesarios están documentados, no
aplicados, en `docs/atencion-dinamica.md`.

Salir con borradores solicita ConfirmDialog; se protegen también los eventos de
navegación del menú y el cierre/recarga del navegador. Cambiar de procedimiento
conserva sus propios borradores. Desconectar destruye Wizard, TextAreas, Checkbox,
confirmaciones y listeners; las respuestas tardías no montan otra pantalla.
Pruebas con REST simulado: `test/atencion_test.html` y
`test/js/control/atencion_procedimientos_test.js`; regresiones del componente en
`test/wizard_test.html`.

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

## 7. Búsqueda pública simplificada

El inicio de HU1 contiene tipo y número de documento y un único botón Buscar citas, que valida el documento y consulta sus citas. La validación de formato se comparte entre la entrada y validarPaciente mediante validarFormatoDocumento, usando la expresión regular del tipo; los errores aparecen junto al campo antes de consultar REST.

buscarCitas(contextos) trae las consultas de todas las inscripciones válidas del paciente, conserva el cruce por UUID y no recibe clínica ni fechas. La clínica se muestra como información dentro de galeno-tarjeta-cita, que reutiliza tarjeta-simple. Las citas sin fecha también pueden verse en el listado general.

Después de buscar se muestra un filtro con Desde y Hasta opcionales, inicialmente vacíos. filtrarCitas trabaja en memoria, con días inclusivos en America/El_Salvador; no modifica validarRango ni la agenda laboral. Mostrar todas limpia el filtro. Cambiar tipo o documento elimina la validación, los resultados y los filtros e invalida cargas previas.

La cuadrícula pública muestra hasta cuatro tarjetas por fila, tres o dos en anchos intermedios y una en móvil. Los estilos se limitan a galeno-citas. La caché estática pasa a galenosv-v12 e incluye documento_formato.js. Cobertura actualizada en test/js/agenda_test.js; se conserva la indicación previa de no ejecutar pruebas por ahora.

### Resultados y ejemplos de documento

Las tarjetas se montan en una cuadrícula propia, hermana del panel de acciones, debajo de Buscar mis citas y Mis citas. El panel mantiene únicamente formulario, filtros y mensajes; no contiene las tarjetas.

Buscar valida formato, consulta el documento y sus inscripciones y obtiene las citas en una sola acción. Las respuestas previas se descartan al cambiar el documento o salir. Los mensajes indican si se encontraron citas asociadas al documento y distinguen los errores del servidor.

El helper propio `ejemploDocumento` en `control/documento_formato.js` se comparte entre HU1 y login. Sugiere un placeholder como `Ej.: 00000000-0` a partir de formatos habituales y solo lo muestra si satisface la expresión regular. Para expresiones no reconocidas sin ejemplo compatible se conservan las indicaciones del catálogo. No modifica lo escrito ni cambia la autenticación.

Login agrega Volver a mis citas, disponible incluso durante la carga del catálogo o un ingreso pendiente. Emite `galeno-login-cancelado`, cancela sus listeners y descarta respuestas pendientes. Main cierra el overlay mediante `app.ocultarLogin()`, consume la ruta protegida pendiente y navega a `/citas` sin guardar sesión. El cierre exitoso de login reutiliza ocultarLogin. No se ejecutaron pruebas durante este ajuste.

## Actualización de caché después del rollback

La versión estática es `galenosv-v15`, con `main.js?v=10` tanto en index como
en ARCHIVOS. Instalar precarga desde red con `cache: reload`; activar elimina
las cachés estáticas anteriores (incluidas v13/v14) y todas las `galeno-api-*`
para descartar respuestas anteriores al rollback. La política REST original
vuelve a guardar respuestas nuevas en `galeno-api-v1`. Se conservan sesión
simulada, recursos de Wizard/Checkbox/atención y cachés de otras aplicaciones.
`skipWaiting`, `clients.claim` y la recarga existente en `controllerchange`
aplican la actualización a las pestañas controladas. Requiere servir los archivos
actualizados y abrir o recargar la aplicación con conexión.

Pruebas: `node test/serviceWorker_test.mjs` y
`test/service_worker_version_test.html` (Mocha/Chai/Sinon).

Validación de esta actualización: 11 pruebas del worker y 3 Mocha aprobadas.
Instalación real verificada en Chromium aislado por loopback: v15 activada,
main?v=10 restaurado precargado, v13/v14 y caché API anterior eliminadas;
caché ajena conservada. No se consultó el backend.

## Paso 1 de la auditoría: consulta individual y documentos por persona

Implementación y pruebas en [paso1-consulta-documento.md](paso1-consulta-documento.md).
El login simulado y los demás pasos del plan permanecen sin cambios.

## Paso 2 de la auditoría: filtros y catálogo activo

`GET consulta` admite `clinica` e `inscripcion` (UUID); juntos aplican intersección.
`GET tipo_documento` admite `activo=true` o `activo=false`. Sin filtros conservan
los listados globales. Cada variante devuelve array, paginación y Total-registros
del mismo filtro. El frontend usa clínica en resumen/agenda y solicita catálogo
activo en login/citas. El ingreso por documento y la sesión simulada se conservan.
No se añaden filtros por rol o fechas, agregados ni cambios transaccionales.
Detalle y pruebas: [paso2-filtros-catalogo.md](paso2-filtros-catalogo.md).

## Paso 3 de la auditoría: citas y agenda por rol

`GET consulta?persona=<UUID>` obtiene citas de las inscripciones de paciente en
sus clínicas; no se combina con otros filtros. `GET consulta?clinica=<UUID>&rol=<UUID>`
consulta participación por definiciones, incluidas las que no tienen ejecución;
admite desde/hasta opcionales como días YYYY-MM-DD en America/El_Salvador.
Mantiene arrays, paginación y totales filtrados. El paso 4 de relaciones aún no se
implementa. Detalle: [paso3-citas-agenda.md](paso3-citas-agenda.md).

## Paso 4 de la auditoría: relaciones por conjuntos

Citas, agenda, atención y `listarParaConsultas` solicitan relaciones mediante
conjuntos de UUID: consultas para procedimientos/ejecuciones/órdenes,
procedimientos para definiciones, pasos para configuraciones/secuencias y órdenes
para resultados. Cada petición admite hasta 50 UUID y pagina con total filtrado;
el cliente divide conjuntos mayores, omite vacíos y rechaza datos ajenos o páginas
incompletas. Las secuencias incluyen origen **o** destino; las definiciones sin
ejecución se conservan. El ingreso simulado se conserva; el paso 5 se documenta a continuación.
Contrato, pruebas y límites: [paso4-relaciones-conjuntos.md](paso4-relaciones-conjuntos.md).

## Paso 5 de la auditoría: estados y dashboard agregado

`GET consulta/estados?consultas=…` resume los estados por conjuntos de hasta 50 UUID.
`GET consulta/resumen?clinica=…&inscripcion=…` devuelve contadores, doce meses,
horarios y cinco próximas/cinco recientes, calculados por el backend en
America/El_Salvador. El dashboard valida el DTO y adapta las fechas de sus filas;
ya no descarga consultas para agregarlas. Conserva su alcance por clínica y,
para paciente, inscripción; no añade filtro de rol a los agregados.

El login amañado y los contratos de escritura se conservan. No se implementó el
paso 6. Contrato y evidencia: [paso5-resumen-estados-dashboard.md](paso5-resumen-estados-dashboard.md).

## Paso 6 de la auditoría: resultados, Location y reintentos

`POST examen_resultado` comprueba y crea bajo bloqueo de la orden; si ya tiene
resultados, rechaza una creación nueva con 409 y conserva los registros históricos.
Devuelve 201 con Location. `Idempotency-Key` UUID permite reintentar el mismo envío
sin duplicar: replay idéntico → 200 con el mismo Location; contenido/orden distinto
→ 409. No se aplican migraciones ni se alteran PUT/DELETE u otros escritores.

Atención conserva la clave por borrador, recupera únicamente el UUID de Location
y elimina la búsqueda posterior por contenido. Una confirmación sin recuperación
segura mantiene el resultado en solo lectura, sin repetir el POST confirmado.
Login amañado, permisos visuales, Wizard y borradores se conservan. La concurrencia
de creación no sustituye las validaciones generales del paso 7, aún no implementado.
Contrato, límites y evidencia: [paso6-resultados-location-concurrencia.md](paso6-resultados-location-concurrencia.md).

## Paso 7 de la auditoría: escrituras de atención validadas

Los PUT específicos `/recurso/{id}/atencion` aceptan únicamente contexto, consulta,
cambios y originales para valor, indicaciones, resultado e interpretación. Validan
relaciones persistidas y reglas del flujo en la transacción del servicio; no usan
merge ni reemplazan colecciones. Los POST de resultados exigen contexto persistido,
conservando Location e idempotencia. La identidad sigue simulada, sin autenticación
backend nueva. Contrato, límites y evidencia en
[paso7-validaciones-transaccionales.md](paso7-validaciones-transaccionales.md).
El paso 8 de caché no se implementó.
