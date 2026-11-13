# GalenoFE: implementación HU1 y HU3

12 de noviembre de 2026

Cambios aplicados en el repositorio GalenoFE indicado por el usuario. Se conservan ECMAScript, Web Components, capas boundary/control/entity y CSS propios.

## HU1: búsqueda pública de citas

- La ruta `#/citas` monta `galeno-citas` y carga los tipos activos de documento.
- Valida el formato antes de pedir datos. Reutiliza `buscarDocumento` y `rolesDePersona` sin iniciar sesión; solo admite inscripciones de la persona encontrada cuyo rol es Paciente.
- Habilita progresivamente documento, clínicas inscritas y fechas. Cambiar documento elimina clínicas y resultados; cambiar filtros invalida los resultados anteriores.
- Composición por UUID entre consulta y consulta_procedimiento, con rango de días inclusivo y paginación completa.
- Distingue documento inexistente, ausencia de inscripción, cero citas y fallo REST. Ignora respuestas tardías tras cambios o desmontaje.
- La comparación con ConsultaResource confirma que no existe `GET consulta/{id}/ticket`. El botón PDF queda deshabilitado con un mensaje de disponibilidad. Se conserva el adaptador Blob para integración posterior, con `TICKET_PDF_DISPONIBLE=false`.

## HU3: dashboard y contexto laboral

- Conserva tarjetas estadísticas y gráficas. Agrega selección de clínica y rol desde las inscripciones laborales del empleado.
- Main revalida la pertenencia del contexto y actualiza sessionStorage, usuario en memoria, shell y router. Descarta cambios tardíos si el empleado cierra sesión, cambia de contexto o navega a otra ruta.
- Agenda inicial de hoy con rangos pasados y futuros. Cruza clínica, procedimientos y definiciones de pasos por UUID de rol.
- Reconstruye antecesores por las relaciones de secuencia, incluyendo ramas; presenta responsables, fechas, estado y valor como texto seguro. Los pasos del propio rol también muestran sus registros de ejecución; los literales PENDIENTE, EN_PROCESO y COMPLETADO se presentan con etiquetas legibles.
- `Abrir consulta` emite `galeno-navegar` con `/atencion/{id}` para usar el nuevo detalle. Se conservan su recuperación de datos, verificación mediante el listado visible y estado calculado con pasos reales. `/consulta/{id}` conserva compatibilidad por identificador sin eliminar el evento abrir-atencion.
- No determina que un paso esté listo para atender ni modifica estados: faltan los acuerdos de elegibilidad y selección múltiple de HU4. La agenda muestra consultas con pasos asociados al rol, incluidas las que pueden tener pasos ya realizados.

## Servicios y PWA

Se agrega agenda_service para composición de lecturas, fechas de negocio y ticket. Se elimina el corte silencioso de 1000 registros de findAll, que afectaba las estadísticas. Se detectan páginas repetidas y resultados incompletos.

Los seis archivos nuevos de src están incluidos en ARCHIVOS. Se incrementa la caché estática a galenosv-v10. Se mantiene el mecanismo existente de respaldo de GET REST sin conexión; solo estarán disponibles las respuestas previamente guardadas. La política específica de caché para datos públicos y PDF sigue requiriendo coordinación con integrante 1.

## Verificación histórica, anterior al traslado de versión

Los resultados siguientes corresponden a la implementación anterior. No demuestran el funcionamiento de esta versión. Por indicación del usuario no se ejecutaron pruebas en la comparación del backend ni en el traslado a e806073. La cobertura fue trasladada y adaptada sin ejecutarla.

- 22 pruebas nuevas Mocha/Chai/Sinon: formato sin petición, documento ausente, inscripciones, más de 1000 registros, páginas repetidas/incompletas, identidad y clínica, límites de día, fechas inválidas, PDF, descarga y revocación, cambios de filtro durante carga, desmontaje, ramas y texto seguro, selector, contexto y ruta directa de consulta.
- 69 pruebas existentes de router, shell, personal, login y autenticación.
- 11 pruebas del service worker con Node.
- Revisión visual en Chromium a 390 px y escritorio, con respuestas simuladas y sin desbordamiento horizontal en móvil.
- Entrada de la suite nueva: `test/agenda_test.html`. Las suites de regresión siguen en sus páginas HTML existentes; service worker: `node test/serviceWorker_test.mjs`.

## Pendientes de integración

1. No había servidor REST escuchando en localhost:9080. Las pruebas usan respuestas simuladas; no certifican integración real ni CORS.
2. Implementar/confirmar el endpoint PDF y su control de acceso en backend. El frontend mantiene la descarga deshabilitada mientras ese recurso no exista.
3. Los estados PENDIENTE, EN_PROCESO y COMPLETADO y el tipo DEPENDIENTE están observados en las vistas/controladores JSF. Falta acordar la regla de paso atendible con integrante 3. El trabajo clínico de HU4 permanece fuera de este cambio.
4. Se usa America/El_Salvador, coincidente con las vistas JSF del backend, para los días de la búsqueda y agenda, centralizado en ZONA_AGENDA. Confirmar el JSON real de fechas y su offset con backend. Las estadísticas existentes conservan su cálculo de fechas.
5. Confirmar que una cita de HU1 corresponde a Consulta y revisar la política de caché con el equipo.

No se creó commit ni se publicaron cambios.

## Comparación estática del backend

Ver `docs/comparacion-backend-hu1-hu3.md`. Los registros sin fechaInicio se excluyen del rango porque el modelo backend permite null. No se ejecutaron pruebas ni peticiones HTTP en esta revisión.

## Traslado de versión

Cambios adaptados a `e806073` sin reemplazar el detalle de atención, las reglas de finalización por pasos, ConfirmDialog ni Wizard/TextArea/Toast/Modal. Ver `docs/integracion-nueva-version.md`.
