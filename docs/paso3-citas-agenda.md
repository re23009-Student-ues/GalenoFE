# Paso 3: citas de paciente y agenda por rol

Se implementó únicamente el paso 3 aprobado de la auditoría. Se conserva el login
amañado por documento, sessionStorage y contexto existentes. No se cambian
escrituras clínicas, transiciones de estado, concurrencia ni autorización.

## Contrato REST

Se amplía el GET existente de consulta, relativo a
`/GalenoSV-1.0-SNAPSHOT/resources/v1/`:

| Petición | Comportamiento |
|---|---|
| `GET consulta?persona=<UUID>` | Citas de las inscripciones de paciente de esa persona con clínica; incluye varias clínicas y consultas sin fecha. Orden ascendente de fecha, nulas al final, desempate por UUID. |
| `GET consulta?clinica=<UUID>&rol=<UUID>` | Consultas con algún procedimiento cuya definición tenga un paso del rol. No exige ejecución, responsable ni estado pendiente. Excluye fechas nulas; orden descendente de fecha y desempate por UUID. |
| Agenda con `desde=YYYY-MM-DD` y/o `hasta=YYYY-MM-DD` | Filtra por días de America/El_Salvador. Desde inclusivo y límite superior exclusivo al inicio del día siguiente a Hasta. |
| Sin nuevos filtros | Conserva los modos global, clínica, inscripción y combinación del paso 2, con su orden por UUID. |

Se conservan array JSON, first>=0, max entre 1 y 50 y Total-registros del mismo
predicado, incluso en páginas vacías. Persona no se combina con otros filtros;
rol requiere clínica y no se combina con inscripción. Fechas requieren el modo
agenda por rol. Las combinaciones incompatibles, UUID inválidos, fechas vacías,
imposibles o rangos invertidos devuelven 422 sin ejecutar un listado global.
Un UUID válido sin coincidencias devuelve array vacío y total cero.

El intervalo de fechas es semiabierto, sin restar un milisegundo al día siguiente:
también conserva registros del último microsegundo del día en PostgreSQL. La
conversión se hace en backend y no depende de la zona del navegador. La consulta
de fechas utilizada por JSF anteriormente permanece sin modificaciones.

Estos parámetros filtran lecturas, no autentican al solicitante. Se mantiene la
limitación del ingreso simulado acordado.

## Backend

En el paquete `sv.edu.ues.occ.ingenieria.ppi115_2026.salud.galenosv`:

- `entity/Consulta.java`: nuevas NamedQueries Consulta.findCitasPorPersona,
  Consulta.countCitasPorPersona, Consulta.findAgendaPorRol y Consulta.countAgendaPorRol.
- `control/ConsultaService.java`: ejecución tipada, paginación, validación de
  argumentos y enlace común de contexto/fechas para listado y conteo de agenda.
- `boundary/rest/ConsultaResource.java`: nuevos filtros y conversión de días;
  conserva sobrecargas Java anteriores y GET por UUID.
- Nuevas pruebas: CitasAgendaResourceTest y CitasAgendaServiceTest.

La condición de citas utiliza la persona relacionada y el rol de paciente,
normalizado con LOWER/TRIM. No incluye las consultas de una inscripción laboral
de la misma persona ni inscripciones de paciente sin clínica.

La condición de agenda utiliza:

```jpql
EXISTS (
    SELECT cp.idConsultaProcedimiento
    FROM ConsultaProcedimiento cp, ProcedimientoPaso pp
    WHERE cp.idConsulta = c
      AND pp.idProcedimiento = cp.idProcedimiento
      AND pp.idRol.idRol = :rol
)
```

No navega por ejecuciones ni por responsables. Varios procedimientos o muchos
pasos coincidentes no multiplican la consulta raíz ni su conteo. Las consultas
de listado y COUNT comparten los mismos filtros; no se pagina un fetch join de
colecciones.

## Frontend

- `buscarCitas` solicita `consulta?persona=…` en todas las páginas. Verifica que
  las inscripciones correspondan a una misma persona y conserva la comprobación
  defensiva de inscripción/clínica. Ya no ordena las citas en JavaScript.
- `listarConsultasDelRol` solicita clínica/rol y, para el rango de agenda, días
  desde/hasta. Completa las páginas y conserva el orden del servidor.
- El listado de Agenda Médica usa esa consulta del servidor. La comprobación de
  participación del acceso `/consulta/:id` reutiliza el listado filtrado por rol,
  sin descargar procedimientos y definiciones solo para decidir esa participación.
- `cargarAgenda` obtiene las consultas raíz filtradas por rol/fechas; conserva su
  enriquecimiento actual de procedimientos, definiciones, dependencias y registros.
  Una definición del rol sin ejecución se presenta con registros vacíos.
- Los filtros visuales de fechas de citas permanecen locales sobre la lista
  completa del paciente. Resumen y estadísticas conservan su comportamiento.

Archivos de producción modificados: `src/js/control/agenda_service.js` y
`src/js/boundary/vistas/consulta_controller.js`. No se añadieron archivos de
producción; ya están en ARCHIVOS. No se modificaron estilos, componentes, login,
sesión, almacenamiento ni versión/política del worker.

## Pruebas

- **222/222 unitarias backend**, Maven sin conexión en copia temporal.
- **176/176 frontend en Chromium**, Mocha/Chai/Sinon con REST simulado: 10 nuevas
  pruebas de citas/agenda, y regresiones de agenda, personal, paso 2, atención,
  login, autenticación simulada, cierre y shell. Las llamadas al backend habitual
  permanecieron bloqueadas durante las pruebas del navegador.
- **11/11 del service worker**, incluida precarga de dependencias.
- **91/91 de integración REST real** en Open Liberty y PostgreSQL desechables.

La integración prueba 124 citas de una persona en dos clínicas, incluida una sin
fecha; excluye otra inscripción laboral de esa persona y una inscripción sin
clínica. La agenda Doctor de clínica A contiene 122 consultas, y 120 en el día
local elegido. Solo existe una ejecución en los fixtures: los demás pasos aún no
tienen ejecución. Hay 123 definiciones Doctor para un procedimiento y una consulta
con dos procedimientos coincidentes, para detectar duplicación por joins.

Se verifican páginas 0/50/100/150, última página, página vacía, conteos estables,
orden, ausencia de duplicados y omisiones, roles y clínicas diferentes, ausencia
de coincidencias y rechazo de parámetros. Los límites incluyen medianoche local,
el último microsegundo del día y la exclusión del comienzo del día siguiente.
También se comprueban los contratos de los pasos 1/2 y la búsqueda por documento
del login simulado.

Los conteos y hashes de las 20 tablas temporales coinciden antes y después de las
lecturas. No se accede a db17 ni a datos existentes. PostgreSQL se crea en tmpfs,
con nombre único y puertos loopback aleatorios; Liberty y el WAR usan directorios
temporales. Al terminar se elimina el contenedor y se detienen los servidores.

Evidencia: [paso3-citas-agenda.json](../test/evidence/paso3-citas-agenda.json).

Para repetir desde GalenoSV:

```sh
bash test/integration/citas-agenda-step3/run.sh
```

El arnés adapta una copia temporal del de paginación y usa dependencias e imagen
Docker ya locales. No modifica los arneses de pasos anteriores. Los resultados
se conservan en la ruta temporal impresa. Las pruebas del navegador y REST son
independientes; no se presentan como una prueba completa navegador–backend.

## Límites y publicación

Publicar primero el backend y después el frontend. Un backend anterior puede
ignorar los nuevos parámetros. No se desplegó el servidor habitual ni se hicieron
commits o migraciones.

**El paso 4 no se implementó.** La lectura de procedimientos para enriquecer citas
y de relaciones para agenda/atención sigue utilizando los recursos actuales.
Tampoco se implementaron resúmenes de estados, agregados del dashboard ni cambios
transaccionales de guardado. El login amañado se conserva.
