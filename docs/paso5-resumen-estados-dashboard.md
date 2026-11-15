# Paso 5: resumen de estados y dashboard agregado

Se implementó únicamente el paso 5 autorizado en GalenoSV y GalenoFE. Se conserva
el login amañado por documento, la sesión y los cambios anteriores. No se avanza
al paso 6, ni se modifican escrituras, datos existentes, migraciones o despliegues.

## Resumen de estados

`GET consulta/estados?consultas=<UUID>,<UUID>&first=0&max=50` devuelve un array de
DTO con `idConsulta`, `totalPasos`, `pasosFinalizados`, `estado` y `evaluadoEn`.
No incluye entidades de ejecución, valores clínicos ni responsables.

- Conjunto obligatorio, hasta 50 entradas UUID canónicas; duplicados se normalizan.
- `consultas=` devuelve array vacío y total cero; ausente/incorrecto/excesivo → 422.
- Consultas inexistentes no generan resúmenes ficticios.
- Paginación conserva first>=0, max 1–50 y `Total-registros` del conjunto existente,
  también en páginas vacías. Un fallo de persistencia devuelve 500.
- **Finalizada** exige al menos una ejecución y que todas estén en COMPLETADO o
  FINALIZADO. Se cuentan todos los procedimientos y roles, no solo el rol activo.
- Mayúsculas/minúsculas y espacios exteriores, incluidos tabuladores y espacios
  Unicode, conservan la normalización ECMAScript anterior. Nulos, estados nuevos,
  cancelados y pendientes cuentan como no finalizados.
- Sin finalización: Programada si inicio > instante del servidor; En curso en otro
  caso, incluido inicio nulo. `fechaFin` no decide el estado.

`Consulta.resumenEstados` es una nueva NamedQuery de proyección agrupada por
consulta/fecha/estado. Sus LEFT JOIN incluyen consultas sin procedimientos o sin
ejecuciones. La base cuenta registros por estado; `ConsultaProcedimientoPasoService`
normaliza los estados proyectados y devuelve un `ResumenEstadoConsulta` por UUID.
No se leen las entidades de ejecución ni se pagina un fetch join de colecciones.

`ConsultaController` solicita estos DTO mediante
`ConsultaProcedimientoPasoService.resumirParaConsultas`: divide conjuntos mayores,
omite vacíos y rechaza resúmenes ausentes, ajenos o incoherentes antes de montar
las tarjetas. `TarjetaConsulta.resumenEstado` recibe el DTO separado de `.pasos`;
no se fabrican ejecuciones para representar conteos.

Atención sigue leyendo ejecuciones reales porque las necesita para formularios,
responsables, estados editables y Wizard. Reutiliza su regla de estado anterior;
no hace una petición de resumen adicional. El detalle de agenda por rol también
conserva los registros necesarios para mostrar los pasos y sus antecedentes.

## Dashboard

`GET consulta/resumen` devuelve un DTO `ResumenDashboard`, sin el listado global
de consultas. Admite `clinica=<UUID>` e `inscripcion=<UUID>` opcionales, juntos con
intersección; conserva el alcance previo del dashboard, sin añadir filtro de rol.
UUID inválidos o vacíos → 422; fallo de persistencia → 500. Un conjunto sin
coincidencias devuelve contadores cero, doce meses con cero y listas vacías.

El DTO contiene `anio`, `evaluadoEn`, `zona`, `consultasAnio`, `consultasMes`,
`consultasHoy`, `pacientesAtendidos`, `porMes` (12 valores), `porHorario`
(manana/tarde/noche), `proximas` y `recientes`. Estas dos listas contienen como
máximo cinco filas cada una con UUID, paciente, inicio ISO UTC y observaciones.
No contienen colecciones de relaciones ni ejecuciones.

Se conservan las definiciones del dashboard:

- Consultas sin fecha no participan en los agregados ni en las dos listas.
- Año, mes, día y horario usan explícitamente **America/El_Salvador** en servidor.
  Se elimina la dependencia de la zona del navegador/JVM/sesión SQL. Los rótulos
  del dashboard usan ese mismo instante/zona, incluidas las fechas de sus filas.
- Intervalos civiles semiabiertos: inicio inclusivo y día/mes/año siguiente
  exclusivo; se conserva el último microsegundo de PostgreSQL.
- Mañana: antes de 12:00; tarde: 12:00–17:59; noche: desde 18:00, dentro del año.
- Pacientes atendidos conserva su definición previa: personas distintas con
  consultas de inicio <= ahora, de cualquier año. No se redefine según finalización.
- Próximas: inicio > ahora, ascendente. Recientes: inicio <= ahora, descendente.
  UUID desempata en ambas listas, seleccionadas con límite cinco en backend.

`ConsultaService` ejecuta cuatro consultas escalares PostgreSQL parametrizadas:
contadores, agrupación mensual (hasta 12 filas) y ambas listas limitadas. No había
consultas agregadas existentes para estos cálculos. El SQL nativo permite expresar
la zona civil explícita; usa parámetros posicionales compatibles con EclipseLink,
sin concatenar valores recibidos del cliente. `FilaResumenConsulta` y
`ResumenDashboard` son DTO de lectura separados de las entidades JPA.

`cargarResumen` hace una petición agregada y adapta únicamente las fechas de las
filas a Date. Valida formato/conteos; no filtra, ordena ni agrega la tabla de
consultas, ni conserva la antigua propiedad interna `consultas` sin consumidores
productivos. La UI, gráficas, navegación y selector se conservan. El export antiguo
`listarConsultas` permanece por compatibilidad, sin consumidores productivos.

## Validación

Resultados finales y evidencia se registran en
[paso5-resumen-estados-dashboard.json](../test/evidence/paso5-resumen-estados-dashboard.json).

- 242 pruebas unitarias backend con Maven offline en copia temporal; nuevas suites
  `ResumenAgregadoServiceTest` y `ResumenAgregadoResourceTest`.
- 202 pruebas frontend, más 3 de versión del worker, con Mocha/Chai/Sinon en Chromium.
  Nuevas: `test/resumen_agregado_test.html`, `test/js/control/resumen_agregado_test.js`.
- 11 pruebas del worker en Node.
- 40 escenarios de integración REST/JPA real en Liberty/PostgreSQL desechables.
- Sintaxis ECMAScript y `git diff --check` de ambos proyectos.

Se comprueban 123 consultas, 124 ejecuciones finalizadas de varios procedimientos
en una consulta, cero pasos, estados desconocidos/nulos/cancelados, espacios,
fechas nulas y futuras, múltiples clínicas, inscripción, intersecciones vacías,
pacientes duplicados, falta de relaciones, orden/desempate y límites civiles de
año/horarios/microsegundos. La JVM de la integración usa **Asia/Tokyo** para verificar
que los cálculos siguen correspondiendo a El Salvador. Las pruebas unitarias
incluyen el instante exacto y el cambio de año local.

Los hashes y conteos de las 20 tablas sintéticas coinciden antes y después de las
lecturas. El arnés elimina PostgreSQL tmpfs y detiene Liberty temporal; no conecta
a db17 ni al servidor habitual. El navegador bloquea REST real, incluidos los
simuladores del login/cierre; sus pruebas y las REST son independientes, no una
prueba completa navegador–backend.

Desde GalenoSV:

```sh
bash test/integration/resumen-step5/run.sh
```

Reutiliza una copia temporal del arnés de paginación, Maven `-o`, imagen local con
`--pull=never` y puertos loopback aleatorios. Solo cambia la zona horaria de su
árbol de procesos desechable. No instala dependencias ni cambia otros arneses.

## Compatibilidad y límites

No hay archivos nuevos de producción frontend: todos los módulos modificados ya
están en ARCHIVOS. La política y versiones del worker se conservan; la caché REST
mantiene sus limitaciones conocidas. Cuando se autorice publicar, deberá salir
primero backend y después frontend; no hay fallback a descargar tablas completas
si los endpoints de resumen no están disponibles.

Las comprobaciones visuales no sustituyen autorización backend. Los resúmenes
son lecturas, no transiciones clínicas ni operaciones de concurrencia. La atención
mantiene escrituras y recuperación de resultados actuales; Location/reintentos y
concurrencia del paso 6 no se implementaron. Índices, planes y versión desplegada
siguen sin verificar.
