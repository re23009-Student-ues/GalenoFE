# Paso 4: filtros por conjuntos para relaciones

Se implementó el paso 4 autorizado en GalenoSV y GalenoFE. Se conservan el login
amañado por tipo/número de documento, sessionStorage, paginación anterior y cambios
previos. El paso 5 no se implementó. No se modificaron datos existentes, aplicaron
migraciones, instalaron dependencias, hicieron commits ni desplegó el servidor habitual.

## Contrato REST

Se amplían los GET existentes, relativos a `/GalenoSV-1.0-SNAPSHOT/resources/v1/`:

| Recurso | Parámetro CSV | Relación filtrada |
|---|---|---|
| `consulta_procedimiento` | `consultas` | Consulta del procedimiento registrado. |
| `consulta_procedimiento_paso` | `consultas` | Consulta del procedimiento de la ejecución. |
| `procedimiento_paso` | `procedimientos` | Procedimiento de la definición. |
| `procedimiento_paso_examen` | `pasos`, opcional `activo` | Paso de la configuración; activo=true/false exactos. |
| `procedimiento_paso_secuencia` | `pasos` | Origen **o** destino de la secuencia. |
| `orden_examen` | `consultas` | Consulta de la ejecución relacionada. |
| `examen_resultado` | `ordenes` | Orden del resultado. |

Ejemplo: `consulta_procedimiento?consultas=<UUID>,<UUID>&first=0&max=50`.
Se admiten hasta **50 entradas UUID canónicas por petición**, sin espacios.
Duplicados válidos se normalizan; el límite se aplica antes de deduplicar.
UUID inválidos, entradas vacías dentro de un CSV y conjuntos mayores devuelven 422.
El parámetro explícitamente vacío (`consultas=` / `pasos=` / etc.) devuelve `[]`
y total cero, sin consultar la tabla. Ausencia del parámetro conserva el listado
global. En configuraciones, `activo` requiere `pasos`; sin activo se incluyen
valores true, false y null, y con false se excluyen null.

Todas las variantes conservan arrays JSON, `first>=0`, `1<=max<=50`, orden por UUID
y `Total-registros` del mismo conjunto filtrado, también en páginas vacías.
Errores de persistencia producen 500. No se añaden controles de autenticación.

## Implementación

Backend: los siete recursos y servicios de la tabla incorporan los filtros,
conservando `findRange(first,max)` y los métodos Java/JSF previos. `FiltroConjunto`
centraliza el parseo REST. Los helpers de `AbstractService` reutilizan la resolución
de atributos y el orden por identificador de Criteria para lista y COUNT con IN.
Las rutas de atributos se fijan en cada servicio, no se reciben del cliente.
No se pagina ningún fetch join de colecciones.

Secuencias reutiliza `ProcedimientoPasoSecuencia.findByStepIds`, añadiendo orden
estable y una NamedQuery de conteo equivalente. Conserva origen IN ids **OR** destino
IN ids, incluidos extremos nulos y enlaces que entran desde otra definición.
No se inventó ninguna relación de OrdenExamen al examen ni a la configuración.

Frontend: `agenda_service.js` añade `listarPorConjunto` y helpers por relación.
Deduplica UUID, divide conjuntos mayores en bloques de 50, completa las páginas de
cada bloque y deduplica secuencias compartidas entre bloques. Vacío no hace fetch.
Rechaza relaciones ajenas, identificadores ausentes, páginas repetidas/incompletas,
totales ausentes/cambiantes/inválidos y errores HTTP, sin devolver resultados parciales.

- Citas pide procedimientos de las consultas del paciente.
- Agenda pide procedimientos/ejecuciones de sus consultas, luego definiciones por
  procedimientos y secuencias por pasos. Mantiene definiciones del rol sin ejecución
  con `registros: []`.
- Atención pide procedimientos y órdenes de su consulta; después definiciones,
  configuraciones activas, secuencias y resultados de esas órdenes.
- `ConsultaProcedimientoPasoService.listarParaConsultas` usa la misma lectura
  filtrada, preservando el contrato de tarjetas y comprobación de estados.
- Las lecturas de resultados previas/posteriores al POST también usan su orden.
  Se conserva el comportamiento actual del POST y su recuperación por contenido;
  Location y concurrencia siguen pendientes para el paso 6.

No se modificaron DOM, estilos, Wizard, Checkbox, login, sesión ni política/versiones
del worker. Los tres módulos frontend modificados ya figuran en ARCHIVOS;
no hay archivos nuevos de producción frontend.

## Validación

- **233/233 pruebas unitarias backend**, Maven `-o test`, copia temporal y Mockito.
  Nuevas suites: `RelacionesConjuntoResourceTest`, `RelacionesConjuntoServiceTest`.
- **189/189 pruebas frontend en Chromium**, REST simulado: relaciones (13), paso 3
  (10), agenda (27), personal (14), paso 2 (9), atención (63), login (18), ingreso
  simulado (16), logout (7), shell (12).
- **3/3 Mocha de versión del worker** y **11/11 del worker en Node**.
- **142/142 comprobaciones REST/JPA reales**, Open Liberty y PostgreSQL desechables.
- Sintaxis ECMAScript y `git diff --check` de ambos proyectos aprobados.

La integración crea más de 100 registros relacionados para cada recurso (123;
126 secuencias coincidentes), propietarios ajenos, configuraciones true/false/null,
relaciones sin ejecución y secuencias con extremos nulos o externos. Verifica
páginas 0/50/100/150, totales, orden, no duplicación/omisión, unión de dos propietarios,
50 UUID, rechazo de 51, duplicados, vacíos, UUID inválidos y contrato sin filtros.
Los hashes y conteos de las **20 tablas sintéticas** coinciden antes y después.
El contenedor tmpfs se elimina y Liberty temporal se detiene al terminar.

Pruebas nuevas FE: `test/relaciones_conjuntos_test.html` y
`test/js/control/relaciones_conjuntos_test.js`. Se adaptaron únicamente los
simuladores de agenda/atención/paso 3 al contrato filtrado, con helper de pruebas
`test/js/control/relaciones_fixture.js`. Las pruebas de navegador bloquearon REST
real; las de navegador y REST son independientes, no una integración completa
navegador–backend.

Evidencia: [paso4-relaciones-conjuntos.json](../test/evidence/paso4-relaciones-conjuntos.json).

Reproducción desde GalenoSV:

```sh
bash test/integration/relaciones-step4/run.sh
```

El arnés adapta una copia temporal del arnés de paginación; usa `--pull=never`,
Maven sin conexión, PostgreSQL tmpfs y puertos loopback aleatorios. No conecta a
db17 ni a datos reales. Las semillas solo se ejecutan en su contenedor recién creado.

## Límites y publicación futura

Se debe publicar primero backend y después frontend cuando se autorice desplegar.
Un backend anterior puede ignorar filtros; la comprobación de pertenencia del
frontend puede rechazar sus respuestas, sin recurrir al listado global.

Dashboard y estados siguen calculándose localmente. La elegibilidad de un UUID por
rol aún recorre el listado filtrado de consultas. No hay nuevos contratos de
escritura, transacciones ni control de concurrencia. La autorización backend y la
caché REST conservan sus limitaciones aceptadas. Índices, planes y versiones
desplegadas siguen sin verificar.
