# Paso 1: consulta individual y documentos por persona

Se implementó únicamente el paso 1 aprobado. Se conserva el login simulado y no
se implementaron nuevos filtros de agenda, agregados, autenticación, autorización
ni los demás pasos de la auditoría. No se modificaron datos existentes ni se
desplegó el backend habitual.

## Comportamiento

- Atención usa `GET consulta/{id}` en vez de descargar todas las consultas para
  buscar el UUID. Conserva la comprobación visual de clínica y, si se usa un
  contexto paciente, su inscripción. Un 404 muestra que la consulta no está
  disponible; los demás errores conservan la opción de reintentar.
- `GET documento?persona=<UUID>&first=0&max=50` devuelve un array y
  `Total-registros` del conjunto de documentos de esa persona. Sin `persona`, el
  GET conserva su listado y conteo globales. Se mantiene el límite REST de 50.
- UUID de persona inválido devuelve 422, sin ejecutar una búsqueda global. Una
  persona sin documentos devuelve `[]` y total cero. Los errores de persistencia
  de esta variante se propagan como 500.
- El frontend pagina únicamente documentos de la persona y conserva la selección
  anterior: menor UUID con valor no vacío. Se revisan todas sus páginas porque la
  consulta JPA ordena por tipo; no se cambia silenciosamente qué documento se
  muestra. Una página faltante, repetida o ajena produce error, sin mostrar un
  resultado parcial ni volver a descargar la tabla completa.

## Reutilización y archivos

En GalenoSV se reutilizan `Documento.findByIdPersona` y
`Documento.countByPersona`: no se crean NamedQueries ni endpoints nuevos.
La primera consulta añade el UUID como desempate y un LEFT JOIN al tipo para
incluir documentos sin tipo y mantener coherencia con el conteo. El método
original sin paginación, usado por JSF, conserva su firma y tratamiento de errores.

Cambios backend, bajo el paquete `sv.edu.ues.occ.ingenieria.ppi115_2026.salud.galenosv`:

- `boundary/rest/DocumentoResource.java`: filtro opcional, validación y conteo.
- `control/DocumentoService.java`: sobrecarga paginada y conteo por persona.
- `entity/Documento.java`: ajuste de la NamedQuery existente.
- Pruebas nuevas: `DocumentoPersonaTest` y `DocumentoPersonaResourceTest`.
- Integración reproducible: `test/integration/atencion-step1/`.

Cambios frontend:

- `src/js/boundary/vistas/atencion_controller.js`: lectura individual y manejo de 404.
- `src/js/control/atencion_service.js`: solicitudes de documentos filtradas y
  selección estable cuando hay varios.
- `src/js/control/agenda_service.js`: conserva el código HTTP en el Error para
  distinguir 404 sin analizar el texto del mensaje.
- `test/js/boundary/atencion_test.js`: verifica GET individual, ausencia del listado
  global, consulta inexistente y compatibilidad con el flujo actual.
- `test/js/control/atencion_consulta_documento_test.js`: casos de documentos y
  paginación; se ejecuta desde la página existente `test/atencion_test.html`.

No se modificaron sesión, formulario de login, rutas, estilos, Wizard, Checkbox ni
la configuración/versiones del service worker. Los módulos de producción
modificados ya estaban incluidos en ARCHIVOS.

## Validación

- **198/198 pruebas unitarias del backend** con Maven sin conexión, en una copia
  temporal de los fuentes.
- **113/113 pruebas frontend en Chromium:** 63 de atención/documentos, 27 de
  agenda, 16 de autenticación simulada y 7 de cierre de sesión. Mocha/Chai/Sinon,
  REST simulado y solicitudes al backend habitual bloqueadas.
- **11/11 pruebas del service worker**, incluida la integridad de las dependencias
  de los módulos precargados.
- **17/17 pruebas reales de REST/JPA en Open Liberty y PostgreSQL desechables**:
  123 documentos del paciente y 2 ajenos; tipos con nombres iguales, inserción
  física invertida y un documento sin tipo. Se comprueban páginas 0/50/100/150,
  total filtrado, orden, ausencia de duplicados/omisiones, parámetros inválidos,
  listado sin filtro, GET de consulta y búsqueda de documento del login.
- Comparación de conteo y hash del contenido de las **20 tablas** temporales:
  sin cambios después de las lecturas. Contenedor eliminado y Liberty temporal
  detenido al terminar.

Evidencia: [paso1-consulta-documento.json](../test/evidence/paso1-consulta-documento.json).

Para repetir la integración, desde GalenoSV:

```sh
bash test/integration/atencion-step1/run.sh
```

El arnés reutiliza el de paginación mediante una copia temporal, sin modificarlo.
Usa la imagen PostgreSQL local, almacenamiento tmpfs y puertos loopback aleatorios;
compila el backend en otro directorio. No conecta a db17 ni a una base existente.
Las respuestas y logs de cada ejecución se guardan en el directorio temporal que
imprime el script. Las pruebas REST son independientes de las pruebas del navegador;
no se presenta esta validación como una prueba completa navegador–backend.

## Compatibilidad y límites

El frontend requiere publicar el backend con el nuevo filtro antes de usar esta
versión. Un backend antiguo que ignore `persona` puede producir un error de
documentos ajenos; no hay fallback a la descarga global.

El GET por UUID y el filtro por persona conservan el acceso simulado actual:
la comprobación del navegador no se presenta como autorización backend. La carga
de pasos, procedimientos, órdenes y resultados sigue como estaba y pertenece a
los pasos posteriores, todavía no implementados.
