# Fechas de Mis citas en el backend

`GET consulta?persona=<UUID>` admite `desde=YYYY-MM-DD` y/o
`hasta=YYYY-MM-DD`. Los días se interpretan en `America/El_Salvador`:
Desde incluye el inicio del día y Hasta usa como límite exclusivo el inicio
del día siguiente. El filtro se aplica antes de paginar y comparte predicado
con `Total-registros`. Se conserva el orden por fecha ascendente y UUID.

Sin fechas se conservan todas las citas del paciente, incluidas las de fecha
nula y las de varias clínicas. Con algún límite se excluyen fechas nulas.
Persona sigue sin combinarse con clínica, inscripción o rol. Fechas vacías,
imposibles, de año cero, de formato incorrecto o rangos invertidos devuelven 422.
Los errores del servicio no se presentan como cero resultados.

El formulario conserva Filtrar y Mostrar todas. Filtrar solicita persona y los
límites presentes; Mostrar todas solicita nuevamente sin fechas. La primera
búsqueda conserva la validación por documento y no duplica la petición de citas.
El frontend valida el rango, completa todas sus páginas y comprueba inscripción
y clínica; ya no recorta las fechas en memoria. Solo carga procedimientos para
las consultas recibidas. Cambiar documento, editar fechas, iniciar otro filtro
o desmontar invalida respuestas pendientes. Un error limpia tarjetas anteriores,
muestra el fallo y permite reintentar.

No se modifica el login simulado, la sesión ni los permisos. Nombre en agenda,
selectores y agrupaciones visuales conservan su comportamiento. No hay migración.
La caché estática pasa a `galenosv-v35` para cargar los módulos actualizados.

## Pruebas

- Backend: `CitasAgendaResourceTest` y `CitasAgendaServiceTest`; conversión de días,
  límites opcionales, rango inválido, conteo filtrado y errores.
- Integración: `bash test/integration/citas-agenda-step3/run.sh` desde GalenoSV.
  Usa PostgreSQL y Liberty desechables; comprueba páginas completas y vacías,
  varias clínicas, medianoche, último microsegundo, fechas nulas, cambio de año,
  día bisiesto y rechazo de parámetros. Compara todas las tablas antes y después.
- Frontend: `test/agenda_test.html` y `test/citas_agenda_por_rol_test.html`, con
  Mocha/Chai/Sinon y REST simulado; cubren peticiones, paginación, formulario,
  errores, reintentos e invalidación de respuestas pendientes.
- Caché: `node test/serviceWorker_test.mjs` y
  `test/service_worker_version_test.html`.

Validación realizada: 308 pruebas unitarias backend, 128 comprobaciones REST,
104 pruebas Mocha (incluidas las regresiones de login y autenticación simulada)
y 13 pruebas Node del worker, todas aprobadas. Las 20 tablas sintéticas quedaron
intactas; el servidor y el contenedor temporales se eliminaron al terminar.
Evidencia: [mis-citas-fechas.json](../test/evidence/mis-citas-fechas.json).

Publicar primero el backend y después el frontend. El backend anterior rechaza
persona con fechas. No se despliega el servidor habitual como parte del cambio.
