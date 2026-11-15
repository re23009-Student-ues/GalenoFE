# Paso 7: validaciones transaccionales de atención

Se implementó el paso 7 autorizado para las escrituras que utiliza atención:
valor de ejecución, indicaciones de orden, contenido/interpretación del resultado
y creación de resultados. Se conservan el login amañado, sesión, pasos 1–6 y
cambios anteriores. No se avanzó al paso 8, ni se hicieron migraciones,
instalaciones, commits o despliegues en el servidor habitual. No se accedió a datos reales.

## Contrato de edición

Las tres rutas de escritura usadas por el frontend son:

```text
PUT consulta_procedimiento_paso/{UUID}/atencion
PUT orden_examen/{UUID}/atencion
PUT examen_resultado/{UUID}/atencion
```

Aceptan exclusivamente un objeto JSON con este formato:

```json
{
  "contexto": "UUID de persona_rol del empleado",
  "consulta": "UUID de consulta",
  "cambios": { "valor": "Nuevo texto" },
  "originales": { "valor": "Texto observado originalmente" }
}
```

| Recurso | Campos permitidos en cambios/originales |
|---|---|
| Ejecución | `valor` |
| Orden | `indicaciones` |
| Resultado | `resultado`, `interpretacion` |

Cambios debe contener al menos un campo permitido, con valor string. Originales
debe contener exactamente las mismas claves, con string o null; null se conserva
sin convertirlo a cadena vacía. Se rechazan propiedades adicionales, relaciones,
fechas, estados, identificadores, listas y transiciones clínicas. JSON null,
arrays, escalares o mal formado devuelve 422. El parseo explícito evita depender
de los diferentes errores de conversión del proveedor REST.

Los PUT anteriores `recurso/{UUID}` de estos tres recursos devuelven **422** sin
hacer merge ni acceder al repositorio. La ruta nueva también protege ante mezcla
de versiones: un backend antiguo no reconoce `/atencion`, por lo que no puede
interpretar el contrato nuevo como una entidad vacía para merge.

La respuesta correcta es **200** con la entidad actualizada por el servidor.
Registro inexistente → 404; contrato/contexto inválido → 422; relación, estado,
permisos de contexto o valores originales incompatibles → 409. Fallos no previstos
de persistencia → 500. Las excepciones de negocio solicitan rollback del EJB.

## Validaciones y escritura bajo bloqueo

Los métodos `actualizarAtencion` de los tres servicios existentes utilizan
`ValidacionAtencion` dentro de su transacción CMT:

1. Obtienen la entidad por UUID, no desde el árbol JSON del cliente.
2. Bloquean/refrescan consulta, procedimiento registrado y ejecución; después orden
   y resultado cuando corresponda. Este orden es común a las operaciones validadas.
3. Leen el contexto persona_rol y sus relaciones persistidas, incluida persona.
   Comprueban clínica de la inscripción de la consulta y rol de la definición;
   excluyen contexto Paciente. La asignación del responsable no sustituye el rol
   de definición ni se exige que el empleado esté asignado como responsable.
4. Comprueban que ejecución, definición y procedimiento corresponden realmente;
   las relaciones ausentes o desaparecidas se rechazan, sin fabricar entidades.
5. Rechazan procedimiento registrado con fechaFin y estados no editables. Se
   permiten PENDIENTE, EN_PROCESO, COMPLETADO y FINALIZADO. Los completados siguen
   editables para corregir contenido, conservando su estado y sin reabrirlos.
6. Validan el grafo del procedimiento: sin referencias externas/nulas, duplicados,
   ciclos ni ejecuciones duplicadas/ajenas. Un paso no completado exige sus
   predecesores persistidos en COMPLETADO, como el frontend anterior; FINALIZADO
   en un predecesor no se interpreta silenciosamente como COMPLETADO.
7. Comparan todos los campos afectados antes de modificar ninguno. Cada valor
   actual debe coincidir con el original o con el nuevo valor solicitado. El
   segundo caso permite reintentar un PUT cuya respuesta se perdió.
8. Actualizan solo los escalares permitidos de la entidad administrada y hacen
   flush. No hacen merge ni reemplazan relaciones, listas, adjuntos, fechas o estados.

Las lecturas de definiciones y ejecuciones reutilizan `AbstractService.findByAtributo`
y su orden estable, acotadas al procedimiento de trabajo y sin truncar el grafo.
Las secuencias reutilizan `ProcedimientoPasoSecuencia.findByStepIds` con origen
**o** destino. No se añaden NamedQueries duplicadas ni se pagina un fetch join.

La comparación y la escritura forman una operación por registro. Dos editores
con el mismo original y nuevos valores distintos para un campo producen un 200
y un 409; modificaciones concurrentes de campos distintos se conservan. Un
conflicto de cualquiera de dos campos no aplica parcialmente el otro.

## Creación de resultados y compatibilidad del paso 6

El frontend usa ahora:

```text
POST examen_resultado/atencion
X-Contexto-Persona-Rol: UUID
X-Consulta: UUID
Idempotency-Key: UUID del envío
```

El POST raíz `examen_resultado` se conserva para consumidores anteriores, pero
también exige el contexto/consulta y aplica la misma validación. El cuerpo
conserva los campos del paso 6 y una referencia de orden que contiene únicamente
su UUID. Campos adicionales o un árbol anidado de orden se rechazan. UUID/fecha
de resultado enviados en el cuerpo siguen sin decidir identidad o fecha de alta.

Ambas rutas delegan al servicio existente, que valida el contexto/relaciones del
paso y la orden antes de la comprobación e inserción del paso 6. Se mantienen:

- 201 con Location al crear; 200 con el mismo Location en replay idéntico.
- 409 ante otra clave para una orden con resultados o reutilización incompatible.
- Preservación de todos los resultados históricos múltiples.
- Confirmación de replay idéntico después de cerrar el procedimiento: valida
  contexto/relaciones y confirma identidad, sin intentar una nueva escritura.

Location siempre apunta a `examen_resultado/{UUID}`, incluso si se creó desde
`/atencion`. CORS permite las dos cabeceras de contexto y sigue exponiendo Location.
No se introduce contraseña, sesión backend, cookies, CSRF o HTTPS obligatorio.

## Frontend

`guardarCamposAtencion` mantiene la lectura individual y comprobación visual,
pero envía únicamente cambios/originales e identificadores a `/atencion`. La
comprobación del navegador es preliminar: el servidor vuelve a validar y comparar
bajo bloqueo. Devuelve al flujo la entidad recibida del backend. Un 409 conserva
el borrador e indica recargar; no sobrescribe el original del cliente ni recurre
al PUT genérico.

`registrarResultadoAtencion` conserva claves estables, recuperación por Location
y tratamiento de respuesta perdida, añadiendo las cabeceras del contexto. Los
estados cancelados o desconocidos se muestran en solo lectura en el Wizard.
La presentación, selección, DOM, navegación, Checkbox y borradores se conservan;
no se completan pasos ni se cierran procedimientos.

No hay archivos nuevos de producción frontend, por lo que ARCHIVOS sigue completo.
No se modificaron versiones ni políticas de caché del worker.

## Pruebas y evidencia

- **264/264 unitarias backend**, Maven offline en copia temporal. Nuevas suites:
  `ValidacionAtencionTest` y `AtencionTransaccionalResourceTest`; se adapta la
  prueba de recurso del paso 6 al contexto y Location canónico.
- **224/224 frontend en Chromium** con Mocha/Chai/Sinon y REST real bloqueado:
  nueve pruebas de contrato transaccional y una nueva regresión de estados de solo
  lectura, más las suites de pasos 1–6, atención, login, logout y shell.
- **11/11 del worker en Node** y **3/3 de versión del worker en navegador**.
- **46/46 escenarios REST del paso 7**, más **25/25 de regresión de resultados**,
  en dos entornos Open Liberty/PostgreSQL desechables independientes.
- Sintaxis ECMAScript y `git diff --check` de ambos repositorios aprobados.

Se prueban campos permitidos, relaciones persistidas, contexto inventado o ajeno,
cierre, estados desconocidos/cancelados/nulos, definiciones de otro procedimiento,
grafos inválidos, predecesores, edición de completados y conservación de adjuntos.
Las carreras reales comprueban mismo campo → 200/409, campos distintos → ambos
200 conservando ambos valores, replay de PUT y POST, claves idénticas/distintas,
y colisión de clave entre consultas distintas. Se prueban también JSON null,
arrays, escalares, cuerpo extra y rechazo de PUT de entidad completa.

Las pruebas de escritura operan únicamente sobre registros sintéticos creados
para los arneses. El paso 7 verifica hashes de las 20 tablas conservando todos los
campos y relaciones salvo los escalares seleccionados expresamente por las pruebas
y los UUID de resultados confirmados por POST 201. La regresión del paso 6 verifica
las otras 19 tablas y todos sus resultados sintéticos originales sin cambios.
No se usaron datos existentes reales. PostgreSQL tmpfs se elimina y Liberty
se detiene al terminar; no se conecta a db17 ni al servidor habitual.

Evidencia: [paso7-validaciones-transaccionales.json](../test/evidence/paso7-validaciones-transaccionales.json).

Desde GalenoSV:

```sh
bash test/integration/validaciones-step7/run.sh
bash test/integration/resultados-step6/run.sh
```

El segundo arnés se adaptó con contexto persistido y una cadena sintética válida
para conservar sus 25 escenarios bajo las validaciones actuales. Ambos reutilizan
una copia temporal del arnés de paginación, Maven `-o`, imagen local `--pull=never`
y puertos loopback aleatorios. No instalan dependencias. Navegador simulado y REST
real son pruebas independientes; no una integración completa navegador–backend.

## Alcance y límites

Son garantías de las operaciones de atención descritas. No convierten los demás
CRUD ni JSF en operaciones con este protocolo, ni garantizan exclusión entre
escritores que no lo utilicen. Otros POST/DELETE, PUT de consulta/procedimiento y
transiciones siguen fuera de estos contratos; los PUT de consulta/procedimiento
continúan bloqueados en el frontend. No se modificaron datos para reparar grafos
incoherentes: se rechaza su edición.

El contexto declarado se contrasta con relaciones persistidas, pero sigue siendo
un identificador enviado por el cliente: no demuestra identidad ni constituye
la autenticación backend que el usuario rechazó. Se conserva esa limitación.

La atomicidad es por registro/creación, no por todos los guardados del Wizard;
se mantiene el manejo de éxito parcial y borradores. La concurrencia compara
valores de campos, sin columna @Version ni historial nuevo. La idempotencia del
paso 6 sigue apoyándose en el UUID persistido, sin historial tras eliminación.

Se requiere backend actualizado antes de frontend cuando se autorice publicar.
Las rutas nuevas fallan sin escribir sobre un backend anterior. Caché sensible,
timeouts y respuestas antiguas del worker corresponden al paso 8, **no implementado**.
Índices, planes y versiones desplegadas siguen sin verificar.
