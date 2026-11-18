# Exámenes activos en el backend

Atención solicita
`GET procedimiento_paso_examen?pasos=<UUIDs>&activo=true&examenActivo=true`.
`activo` filtra el estado de la configuración; `examenActivo` filtra el estado
del examen asociado. Son criterios independientes y se aplican antes de paginar,
con el mismo predicado para las filas y `Total-registros`.

`examenActivo` es opcional y acepta exactamente `true` o `false`. Requiere el
parámetro `pasos`, que conserva conjuntos de hasta 50 UUID, deduplicación y
conjunto vacío con respuesta vacía. Un booleano inválido, ausencia de pasos o
paginación inválida devuelve 422. Los errores de persistencia devuelven 500.
El orden estable continúa siendo por UUID de configuración.

Con `examenActivo=true` solo se incluyen exámenes cuyo `activo` sea true;
se excluyen false, null y relaciones sin examen. Con false se incluyen únicamente
exámenes explícitamente inactivos. Al omitirlo se conserva el contrato anterior,
incluidos exámenes nulos o inactivos, y los consumidores Java existentes.

El frontend envía ambos criterios en todas las páginas y conserva la comprobación
`configuraciones.filter(c => c.idExamen?.activo === true)`. También conserva
la validación de configuración activa y pertenencia al conjunto de pasos.
Órdenes y resultados históricos continúan cargándose por sus propias relaciones;
el nuevo filtro solo afecta a las configuraciones ofrecidas para seleccionar.

No se modifica el login simulado, sesión, escrituras ni esquema de datos.
La caché estática pasa a `galenosv-v36`. Publicar primero el backend y después
el frontend; no se desplegó el servidor habitual durante la implementación.

## Validación

- 314 pruebas unitarias backend, incluidas combinaciones de ambos filtros,
  compatibilidad, conjuntos vacíos, validaciones y errores de conteo.
- 182 comprobaciones REST en PostgreSQL y Liberty desechables. Incluyen tres
  páginas de resultados y página vacía con totales filtrados, valores true/false/null,
  relación sin examen, varios pasos, UUID duplicados y parámetros inválidos.
  Las 20 tablas sintéticas quedaron intactas.
- 191 pruebas Mocha/Chai/Sinon: relaciones por conjuntos (16), Atención (137),
  login (18), autenticación simulada (16) y actualización del worker (4).
  Se comprueban ambos parámetros en cada página, la defensa local frente a
  respuestas con exámenes inactivos, conservación de históricos y fallos parciales.
- 13 pruebas Node del service worker.

Todas aprobadas. Evidencia: [examenes-activos.json](../test/evidence/examenes-activos.json).

Para repetir: `mvn -o test` y
`bash test/integration/relaciones-step4/run.sh` desde GalenoSV; en frontend abrir
`test/relaciones_conjuntos_test.html`, `test/atencion_test.html`,
`test/login_test.html`, `test/sesion_autenticar_test.html` y
`test/service_worker_version_test.html`, y ejecutar `node test/serviceWorker_test.mjs`.
