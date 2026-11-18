# Responsable asignado en las escrituras de Atención

La validación común `ValidacionAtencion.validarPaso` compara el UUID de contexto
recibido con `consulta_procedimiento_paso.idPersonaRol`, después de refrescar y
bloquear la ejecución. Si no hay responsable o no coincide, devuelve 403 antes
de modificar datos. Compartir clínica y rol no sustituye la asignación.

Se aplica a guardar atención mediante `/{id}/atencion`, guardar indicaciones y
resultados relacionados, crear resultados por `/examen_resultado/atencion`,
completar un paso y completar eligiendo un camino. Se conservan las validaciones
de clínica, rol, relaciones, estado, grafo y originales. Completar ya no sustituye
el responsable por la entidad del contexto enviado: conserva la asignación persistida.

Un reintento de completado confirmado por el mismo responsable y con el mismo
contenido conserva las fechas bajo las condiciones existentes del flujo. Otro
contexto recibe 403, incluso si envía idéntico contenido. La comprobación de
responsable también se mantiene en el replay idempotente de creación de resultados.

Anterior reutiliza la misma comparación sobre el paso de origen, después de
bloquearlo. No exige al actor ser responsable del destino que reabre: este puede
pertenecer a otra persona o rol. Conserva sus validaciones y reasignación actuales.

Las comprobaciones del frontend permanecen sin cambios. Las pruebas agregadas
verifican que impidan enviar al detectar un responsable distinto o ausente y que,
ante un 403 del servidor posterior a la lectura, conserven los originales y no
repitan automáticamente la escritura.

## Alcance

Se conserva el login simulado y el contexto suministrado por el cliente; comparar
ese UUID con la asignación persistida no autentica a quien envía la petición.
No se modifica la autorización de GET ni el POST genérico de órdenes. No hay
migraciones, cambios de contrato de petición ni cambios en los módulos del
frontend. La caché estática permanece en `galenosv-v36`.

## Pruebas y publicación

- 319 pruebas unitarias backend: rechazo de responsable distinto, ausente o
  reasignado al refrescar bajo bloqueo; 403 en recursos REST; conservación de
  asignación y fechas; órdenes/resultados y retroceso a un destino ajeno.
- 55 comprobaciones REST con PostgreSQL y Liberty desechables: guardado y
  completado propios, 403 para otro empleado del mismo rol/clínica y para pasos
  sin responsable, replay propio sin nuevas fechas, replay ajeno rechazado y
  regresiones de concurrencia y creación de resultados. Los rechazos no cambian
  ninguna tabla; la comparación final de las 20 tablas solo permite los cambios
  escalares previstos y los UUID de resultados creados confirmados.
- 192 pruebas Mocha/Chai/Sinon: contrato transaccional (21), Atención (137),
  login (18) y autenticación simulada (16).

Todas aprobadas. Evidencia: [responsable-asignado.json](../test/evidence/responsable-asignado.json).
Repetir desde GalenoSV con `mvn -o test` y
`bash test/integration/validaciones-step7/run.sh`; en frontend abrir
`test/validaciones_transaccionales_test.html`, `test/atencion_test.html`,
`test/login_test.html` y `test/sesion_autenticar_test.html`.

Recompilar y publicar el backend para aplicar la restricción. No se desplegó el
servidor habitual ni se modificaron datos existentes durante la validación.
