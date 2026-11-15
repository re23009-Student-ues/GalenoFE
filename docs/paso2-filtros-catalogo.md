# Paso 2: filtros de consultas y catálogo activo

Se implementa únicamente el paso 2 aprobado. Se mantienen el login amañado por
documento, sessionStorage, contexto y comprobaciones visuales existentes. No se
implementan los siguientes pasos de la auditoría ni se restaura la autenticación
de la fase 2 que se revirtió anteriormente.

## Contrato REST

Rutas relativas a `/GalenoSV-1.0-SNAPSHOT/resources/v1/`:

| Petición | Resultado |
|---|---|
| `GET consulta?clinica=<UUID>` | Consultas de inscripciones de esa clínica. |
| `GET consulta?inscripcion=<UUID>` | Consultas de esa inscripción persona_rol. |
| Ambos filtros | Intersección; si la inscripción corresponde a otra clínica, array vacío y total cero. |
| `GET tipo_documento?activo=true` | Solo tipos con activo=true; orden por nombre y UUID. |
| `GET tipo_documento?activo=false` | Solo activo=false; no incluye activo=null. |
| GET sin filtros | Conserva listado global, incluidos tipos con activo=null. |

Todas las variantes conservan array JSON y cabecera `Total-registros`, calculada
con los mismos filtros que la lista, también en última página y páginas vacías.
Se mantienen first>=0 y max entre 1 y 50. Los filtros de UUID deben usar formato
canónico, sin espacios; el parámetro activo acepta exactamente true/false en
minúsculas. Valores inválidos devuelven 422 sin recurrir al listado global.
Errores del servicio devuelven 500, sin aparentar cero coincidencias.

Los filtros restringen búsquedas; no constituyen autorización. Se conserva el
acceso simulado acordado. No se modificaron GET por UUID ni el filtro de documentos
por persona del paso 1.

## Backend

En el paquete `sv.edu.ues.occ.ingenieria.ppi115_2026.salud.galenosv`:

- `boundary/rest/ConsultaResource.java`: filtros opcionales y selección de lista y
  conteo. Conserva la variante Java findRange(first,max) para consumidores existentes.
- `control/ConsultaService.java`: reutiliza findByIdClinica/countByIdClinica y
  findByIdPersonaRol/countByIdPersonaRol. La combinación usa los helpers Criteria
  findByAtributos/countByAtributos ya existentes con ambos predicados.
- `entity/TipoDocumento.java`: añade la NamedQuery TipoDocumento.findActivos,
  necesaria para el findActivos heredado. Consulta completa:

```jpql
SELECT t
FROM TipoDocumento t
WHERE t.activo = true
ORDER BY t.nombre, t.idTipoDocumento
```

- `control/TipoDocumentoService.java`: el catálogo activo utiliza findActivos
  heredado; inactivos y conteos reutilizan Criteria existente.
- `boundary/rest/TipoDocumentoResource.java`: filtro opcional y total coherente.
- Nuevas pruebas JUnit: FiltrosConsultaCatalogoResourceTest y
  FiltrosConsultaCatalogoServiceTest.

No se duplicaron endpoints ni consultas de clínica/inscripción. No se cambió el
comportamiento de métodos que ya utiliza JSF.

## Frontend

- `ConsultaService` acepta `{ clinica, inscripcion }`; sin opciones conserva su URL.
- `TipoDocumentoService` acepta `{ activo }`; sin opciones conserva su URL.
- `DefaultService.findRange` añade first/max con el separador correcto cuando la
  URL ya contiene filtros. findAll conserva esos filtros en todas las páginas.
- `resumen_service.js` solicita la clínica activa y, para contexto paciente, su
  inscripción. Se mantienen comprobaciones locales defensivas y estadísticas actuales.
- `cargarAgenda` pide consultas de su clínica. Las fechas y el cruce por rol siguen
  como estaban; su traslado al backend corresponde a los siguientes pasos.
- Login y citas solicitan tipos activos. El formulario, la búsqueda de documento,
  la exclusión de paciente al ingresar y el almacenamiento de sesión no cambian.
- `test/js/control/filtros_consulta_catalogo_test.js` y su página HTML verifican
  URLs, consumidores, paginación y propagación de errores.
- La prueba antigua de cierre en login_test ahora confirma el ConfirmDialog que
  la aplicación ya requería. Solo se corrigió esa expectativa del test; no se
  cambió el comportamiento del cierre.

No se modificaron componentes, estilos, Wizard, Checkbox ni versiones/política
del service worker. No hay archivos nuevos de producción que añadir a ARCHIVOS.

## Pruebas

- **210/210 unitarias del backend**, Maven sin conexión en copia temporal.
- **166/166 frontend en Chromium**, Mocha/Chai/Sinon con REST simulado y bloqueo
  de llamadas al backend habitual: filtros (9), atención/paso 1 (63), agenda (27),
  personal (14), autenticación simulada (16), shell (12), logout (7) y login (18).
- **11/11 del service worker**, incluida integridad de dependencias de precarga.
- **76/76 de integración REST real**, con Open Liberty y PostgreSQL desechables.

La integración siembra 252 consultas: 245 de clínica A, 7 de clínica B y 123 de
una inscripción de A. Incluye intersección válida, intersección imposible, filtros
sin coincidencias, páginas sucesivas y vacías, orden estable, totales constantes y
rechazo de parámetros inválidos. El catálogo tiene 131 tipos: 123 activos, 5
inactivos y 3 con activo nulo, con nombres repetidos e inserción física invertida.
También se prueban los contratos del paso 1 y los recursos usados por el login
amañado.

Los conteos y hashes de las 20 tablas temporales coinciden antes y después de las
lecturas. No se usaron datos existentes. El contenedor PostgreSQL tmpfs y Liberty
temporal se eliminan/detienen al terminar. No se instaló ninguna dependencia ni
se desplegó el backend habitual.

Evidencia: [paso2-filtros-catalogo.json](../test/evidence/paso2-filtros-catalogo.json).

Reproducción desde GalenoSV:

```sh
bash test/integration/filtros-step2/run.sh
```

El arnés reutiliza el de paginación mediante una copia temporal, sin modificarlo,
con semilla propia y puertos loopback aleatorios. Usa dependencias Maven e imagen
Docker ya locales. Los logs y resultados se conservan en el directorio temporal
impreso. Las pruebas del navegador y las pruebas REST son independientes; no se
presentan como una prueba completa navegador–backend.

## Publicación

Actualizar primero el backend y después el frontend. Un backend anterior puede
ignorar estos parámetros y seguir transfiriendo colecciones globales. Los filtros
locales defensivos siguen presentes, pero no reemplazan la nueva consulta del
servidor. No se cambiaron los contratos de escritura ni la política de sesión.
