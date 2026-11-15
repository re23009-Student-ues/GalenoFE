# Atención mediante pasos reales: análisis de integración

## Código existente al iniciar esta tarea

- Dashboard: `resumen_controller.js` monta `galeno-agenda`, que navega a
  `/atencion/{idConsulta}`. El router ya entrega consulta y contexto laboral.
- Atención: `atencion_controller.js` monta siete apartados fijos. Conserva
  encabezado de paciente, selección por rol, valores y resultados, pero todavía
  no representa cada ejecución médica como un paso del Wizard.
- `atencion_service.js`: pagina y cruza asignaciones, definiciones, ejecuciones,
  secuencias, configuraciones de examen, órdenes y resultados. Comprueba rol y
  clínica al guardar campos. La transición a EN_PROCESO actual se valida en el
  cliente antes de un PUT genérico; no equivale a una operación transaccional de
  negocio implementada por el backend.
- Componentes disponibles: Wizard, TextArea, Checkbox, Toast, Modal y ConfirmDialog.
  Checkbox debe importarse desde `form/checkbox/index.js`; ya no es necesario
  fabricar inputs de selección por separado.
- Wizard actualmente marca completado al validar navegación hacia adelante.
  Para atención, su progreso debe reflejar los estados persistidos del REST,
  incluso al revisar pasos ya atendidos. No debe confundirse visitar con completar.

## Modelo y REST existentes

Recursos revisados en `GalenoSV/boundary/rest` y entidades de `GalenoSV/entity`:

| Recurso | Información disponible |
| --- | --- |
| `consulta` | Paciente, fechas, referencia y observaciones |
| `consulta_procedimiento` | Asignación del procedimiento, fechas y observaciones |
| `consulta_procedimiento_paso` | Ejecución real, definición, responsable, estado, fechas y valor |
| `procedimiento_paso/procedimiento/{id}` | Definiciones de pasos y roles |
| `procedimiento_paso_secuencia` | Origen y destino de dependencias |
| `procedimiento_paso_examen` | Configuración activa de examen permitido por definición de paso |
| `orden_examen` | Ejecución del paso, indicaciones y fecha; falta examen solicitado |
| `examen_resultado` | Orden, resultado, interpretación y referencia `rutaAtestado` |

Los recursos de ejecución y procedimiento publican CRUD genérico. Sus servicios
Java heredan `AbstractService`; no se encontró una operación REST de completar
paso o finalizar procedimiento que valide el flujo en una transacción.

## Cambios necesarios para órdenes identificables

Una selección corresponde a una configuración `ProcedimientoPasoExamen` y a una
ejecución `ConsultaProcedimientoPaso`. La orden necesita ambas referencias.
Una orden por examen permite conservar resultados e indicaciones individuales.

Migración propuesta, **no ejecutada**:

```sql
ALTER TABLE orden_examen
    ADD COLUMN id_procedimiento_paso_examen UUID;

ALTER TABLE orden_examen
    ADD CONSTRAINT fk_orden_examen_configuracion
    FOREIGN KEY (id_procedimiento_paso_examen)
    REFERENCES procedimiento_paso_examen (id_procedimiento_paso_examen)
    ON DELETE RESTRICT;
```

Mantener NULL para órdenes históricas que no se puedan asociar con certeza;
exigir la referencia en nuevas órdenes. El servicio debe validar que configuración
y examen estén activos y que la definición de la configuración coincida con la
definición de la ejecución. Las configuraciones usadas se desactivan, no se borran.
No atribuir órdenes antiguas a un examen por coincidencias de texto o por ser el
único examen disponible. No eliminar órdenes o resultados al desmarcar un Checkbox.

Para evitar duplicados en reintentos se necesita una operación idempotente de
guardar órdenes, identificando la orden existente o una clave de solicitud;
la política de solicitudes repetidas del mismo examen debe acordarse antes de
agregar una restricción UNIQUE que pueda impedir repeticiones clínicas legítimas.

## Decisiones confirmadas con el usuario

1. Solo frontend. Bloquear transiciones sin soporte REST; no modificar Java ni SQL.
2. Permitir elección explícita entre sucesores habilitados cuando existan ramas.
3. Atención no vacía obligatoria para completar. Exámenes opcionales.

La finalización debe afectar solo a la asignación seleccionada y ser validada en
el servidor. No usar `consulta.fechaFin` para finalizar un único procedimiento.
Un PUT genérico de toda la entidad tampoco sustituye una operación de negocio:
las entidades contienen colecciones con cascadas y eliminación de huérfanos;
se deben actualizar campos de entidades administradas sin reemplazar colecciones.

## Archivos de la implementación

- `atencion_controller.js`: encabezado permanente, selector, detalles generales,
  observaciones en lectura y confirmación para abandonar borradores.
- `atencion_flujo.js`: adaptador del Wizard existente con ejecuciones reales,
  TextArea/Checkbox por ejecución, borradores independientes y Toast.
- `atencion_service.js`: cargar/ordenar el flujo, guardar sin perder valores,
  validar identidad de órdenes y adaptar únicamente operaciones reales del REST.
- `consultas.css`: disposición de secciones y controles del paso médico.
- Wizard: callback opcional `isStepComplete(id)` para reflejar progreso externo;
  su comportamiento por defecto se conserva.
- Pruebas Mocha/Chai/Sinon: orden, navegación, borradores, opcionalidad de exámenes,
  guardado fallido, reintentos, confirmación y ausencia de cierre de otros procedimientos.

La subida/descarga de archivos tampoco está implementada en los recursos revisados;
`rutaAtestado` es una referencia persistida, no un endpoint de archivos.

## Soporte de servidor pendiente

El guardado de observaciones de consulta está bloqueado también en el servicio
frontend. `ConsultaResource` entrega la entidad recibida a `merge`; la colección
`consultaProcedimientoList` está oculta con `JsonbTransient` y usa cascadas y
`orphanRemoval`. El PUT genérico puede borrar los procedimientos y sus pasos.
Se requiere actualizar solo `observaciones` sobre la consulta administrada sin
sustituir colecciones. No reenviar un grafo reconstruido desde el navegador.

Se pueden ampliar los recursos existentes en lugar de duplicar CRUD. Para admitir
transiciones se necesita actualizar entidades administradas en una transacción:
comprobar empleado/rol/clínica, estado actual, predecesores, atención no vacía y
exámenes permitidos; guardar las operaciones relacionadas y devolver sus estados
persistidos y sucesores habilitados. Finalizar debe comprobar la asignación elegida
y actualizar únicamente ese procedimiento. No se agrega una llamada cliente a una
ruta inexistente ni se simula un cierre con `consulta.fechaFin`.

## Verificación de esta entrega

- Atención dinámica: 52 pruebas en Brave de escritorio y 52 en móvil de 360 × 640.
- Regresión de Wizard y su opción de progreso externo: 52 casos.
- Agenda: 27; personal: 14; Checkbox: 14; router: 20; service worker: suite aprobada.
- Mocha/Chai/Sinon locales, REST simulado; ninguna escritura clínica real ni migración.
