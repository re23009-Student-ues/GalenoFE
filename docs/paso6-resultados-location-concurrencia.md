# Paso 6: recuperación por Location y concurrencia al crear resultados

Se implementó el paso 6 autorizado en GalenoSV y GalenoFE. Se conservan el login
amañado, sessionStorage y los cambios previos. No se implementó el paso 7, ni se
hicieron migraciones, instalaciones, commits, cambios en datos existentes o
publicaciones en el servidor habitual.

## Regla de creación y contrato REST

El frontend ya impedía crear un resultado nuevo si la orden tenía resultados.
El POST de `examen_resultado` aplica ahora esa misma regla dentro de una transacción:

1. Valida orden y contenido explícito (no vacío, incluidos espacios Unicode).
2. Obtiene la orden persistida con `PESSIMISTIC_WRITE`.
3. Comprueba identidad de reintento y existencia de resultados.
4. Persiste una entidad nueva con la orden administrada y fecha del servidor;
   hace flush antes de devolverla. No hace merge del árbol recibido.

| Caso | Respuesta |
|---|---|
| Primera creación | **201**, sin cuerpo, `Location` del UUID persistido. |
| Reintento con la misma clave, orden y contenido | **200**, sin cuerpo, mismo `Location`; no inserta ni modifica. |
| Orden que ya tiene resultados, con otra clave o sin clave | **409**, sin modificar registros previos. |
| Clave usada para otra orden o contenido | **409**. |
| Orden inexistente | **404**. |
| Orden/contenido ausente, contenido vacío o clave inválida | **422**. |
| Fallo de persistencia ajeno a estos conflictos | **500**, rollback. |

La cabecera opcional `Idempotency-Key` es un UUID canónico, sin espacios. Cuando
se proporciona, ese UUID identifica el resultado nuevo. El POST sin cabecera
conserva UUID aleatorio del servidor, 201 y Location; también aplica la regla de
orden. El `idExamenResultado` y la fecha enviados en el cuerpo no sustituyen las
identidades/fecha decididas por este contrato. Los campos de resultado,
interpretación y referencia de adjunto se conservan exactamente para comparar un
reintento. La comparación no usa fechas ni búsquedas aproximadas por contenido.

La validación y el bloqueo se ejecutan en `ExamenResultadoService.registrar` con
la transacción CMT del EJB. `ExamenResultado.countByOrden` es una nueva NamedQuery
escalar para la comprobación bajo bloqueo. `ResultadoRegistroException` comunica
los estados de negocio con rollback. Una colisión simultánea de clave entre
órdenes distintas también se traduce en 409, sin sobrescribir resultados.

Los resultados históricos múltiples se conservan: no se borran, combinan ni
migran. Una orden con resultados históricos no admite otro POST nuevo. Un replay
idéntico puede devolver la identidad ya existente sin modificarla.

CORS sigue exponiendo `Location`, como antes, y permite `Idempotency-Key` en el
preflight. No se añade sesión backend, contraseña, cookie, CSRF ni HTTPS obligatorio.

## Recuperación y reintentos frontend

`registrarResultadoAtencion` conserva la lectura individual de la orden y sus
comprobaciones visuales de clínica/rol/consulta. Sustituye las lecturas de listas
de resultados previas/posteriores al POST por el contrato transaccional y el GET
del UUID indicado por `Location`.

- Genera una clave UUID por envío del borrador de la orden, con Web Crypto.
  También funciona en HTTP cuando `crypto.randomUUID` no está disponible mediante
  `getRandomValues` y UUID v4 propio, sin dependencias.
- Una WeakMap conserva clave, cuerpo y confirmación mientras vive ese objeto de
  orden/borrador. Una respuesta POST perdida permite reintentar con la misma clave
  y el mismo cuerpo; el servidor devuelve 200 si ya estaba persistido.
- Si se cambia el contenido con un envío pendiente, pide recuperar el contenido
  original o recargar antes de editarlo. No reutiliza una clave para otra solicitud.
- Tras 201/200 sigue únicamente un Location del mismo servidor REST, del recurso
  `examen_resultado` y del UUID de la clave. Rechaza credenciales, otro origen,
  otro recurso/UUID, query o fragmento. No descarga tablas ni adivina asociaciones.
- El GET individual usa `cache: no-store` y verifica UUID, orden, contenido y las
  comprobaciones visuales existentes antes de ofrecer un resultado editable.
- Si ya llegó confirmación pero falta Location o falla su recuperación, conserva
  `_registrado: true`: el flujo existente deja los campos de ese resultado en
  solo lectura e indica reabrir atención. No repite un POST confirmado ni inventa
  un UUID editable. Un reintento del servicio puede volver al mismo Location.
- Un 409 conserva el borrador e indica recargar para revisar el resultado; no
  recorre listas para buscar coincidencias de contenido.

Se mantienen DOM, navegación, Wizard, Checkbox, borradores y manejo de éxito
parcial. No se completan pasos ni procedimientos. El simulador de atención se
adaptó a devolver la clave/Location; las pruebas confirman el segundo guardado
sin duplicación.

## Validación

- **251/251 unitarias backend**: Maven offline en copia temporal. Nuevas suites:
  `RegistroResultadoServiceTest` y `RegistroResultadoResourceTest`.
- **214/214 frontend en Chromium**, Mocha/Chai/Sinon, REST real bloqueado. Doce
  casos nuevos en `test/js/control/resultados_location_test.js`, ejecutados por
  `test/resultados_location_test.html`, más todas las regresiones de pasos 1–5,
  atención, login, ingreso simulado, cierre y shell.
- **11/11 del worker en Node** y **3/3 de versión del worker en navegador**.
- **25/25 escenarios REST/JPA reales** con Open Liberty/PostgreSQL desechables.
- Sintaxis ECMAScript y `git diff --check` de ambos repositorios aprobados.

Las pruebas REST comprueban 201/Location/GET exacto, replay 200, contenido/orden
incompatibles, entradas inválidas, ausencia de orden, preflight CORS, POST sin
clave, lecturas previas y preservación de resultados históricos. Las carreras
reales lanzan solicitudes coordinadas por barrera:

- Doce claves distintas para una orden: exactamente un 201 y once 409.
- Doce solicitudes con la misma clave: exactamente un 201 y once 200, mismo UUID.
- Misma clave en dos órdenes simultáneas: un 201 y un 409.

Solo se insertan **cinco resultados sintéticos**, cuyos UUID coinciden exactamente
con los POST 201. Los hashes de las otras **19 tablas** y de todos los resultados
sintéticos anteriores coinciden antes y después; ningún registro previo se edita
ni elimina. La base completa es tmpfs y se elimina al terminar; Liberty temporal
se detiene. No se usa db17, documentos reales ni el servidor habitual.

Evidencia: [paso6-resultados-location-concurrencia.json](../test/evidence/paso6-resultados-location-concurrencia.json).

Desde GalenoSV:

```sh
bash test/integration/resultados-step6/run.sh
```

El arnés adapta una copia temporal del de paginación, con semilla propia, imagen
local `--pull=never`, Maven `-o` y puertos loopback aleatorios. No instala dependencias.
Las pruebas del navegador con REST simulado y las pruebas REST son independientes;
no se presentan como una integración completa navegador–backend.

## Alcance y límites

La regla concurrente se aplica a los POST que pasan por `registrar` del recurso
REST. No se añade una restricción SQL ni se cambian PUT/DELETE, cascadas, JSF u
otros escritores. Los PUT de edición conservan el GET–PUT anterior: este paso no
resuelve su ventana de concurrencia ni sustituye las validaciones generales del
paso 7. Tampoco se añade relación de orden a examen/configuración ni se crean órdenes.

La identidad del reintento se apoya en el resultado persistido, sin una tabla de
historial de claves. Tras eliminación por otro escritor no existe un registro
separado de esa clave. La WeakMap tampoco es almacenamiento durable tras recarga;
al reabrir se cargan los resultados persistidos y la regla del servidor impide un
nuevo POST sobre una orden con resultados.

El ingreso simulado no equivale a autorización backend. La política del worker
permanece igual: `cache: no-store` en esta lectura no constituye el rediseño de
caché del paso 8. No hay archivos nuevos de producción frontend; los módulos
modificados ya figuran en ARCHIVOS. Cuando se autorice publicar, debe actualizarse
primero backend y después frontend. No se desplegó ninguna de estas versiones.
