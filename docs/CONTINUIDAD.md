# RESUMEN OPERATIVO DE CONTINUIDAD

## 1. Objetivo y alcance vigente

Implementar la atención de consultas médicas mediante el **Wizard existente**, donde cada paso represente una ejecución real de `consulta_procedimiento_paso`, relacionada con su definición en `procedimiento_paso`.

La pantalla debe permitir seleccionar procedimientos, registrar atención, preparar exámenes, gestionar indicaciones y resultados disponibles y navegar conservando los datos.

**Decisiones explícitas del usuario que gobiernan la implementación actual:**

1. **Solo modificar frontend. Bloquear las transiciones que no tengan soporte adecuado en el backend.**
2. Si existen varios sucesores habilitados, el empleado debe **elegir explícitamente**.
3. La atención brindada debe contener texto para completar un paso.
4. Los exámenes son opcionales.
5. No modificar Java ni aplicar SQL.
6. No finalizar toda la consulta cuando solo se está atendiendo un procedimiento.

La entrega frontend acordada está implementada y probada. La finalización clínica completa continúa dependiendo del backend.

## 2. Proyecto y arquitectura

**Frontend:**
`/home/oswalv/WebstormProjects/GalenoFE`

**Backend inspeccionado, sin modificar:**
`/home/oswalv/IdeaProjects/GalenoSV`

Paquete Java:

```text
src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/
```

Tecnologías:

- Frontend ECMAScript puro, ES Modules y Web Components propios.
- CSS propio; sin frameworks, CDN ni dependencias externas de producción.
- Backend Jakarta EE 11, Open Liberty y PostgreSQL, según información del usuario.
- Versiones concretas de JDK, Liberty y PostgreSQL: **NO VERIFICADO**.
- Mocha, Chai y Sinon locales para pruebas.

Organización relevante:

```text
src/js/boundary/vistas/              Controladores de pantalla
src/js/boundary/componentes/        Componentes reutilizables
src/js/control/                     Servicios REST y composición
src/Recursos/estilos/                CSS
src/js/router.js                    Navegación por hash
src/serviceWorker.js                Caché y lista ARCHIVOS
test/js/                            Pruebas
docs/                               Documentación
```

REST configurado por `src/js/control/default_service.js`:

```text
http://${location.hostname}:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/
```

El usuario proporcionó expresamente `http://localhost:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/documento`.

### Reglas obligatorias de `AGENTS.md`

- Leer `docs/guia-tecnica.md` antes de trabajar.
- Solo ECMAScript y componentes propios.
- Estilos en `src/Recursos/estilos`.
- Cada comportamiento nuevo requiere pruebas Mocha/Chai/Sinon.
- Registrar cada archivo nuevo de `src` en `ARCHIVOS` del service worker.
- Cambios enfocados; evitar reescrituras innecesarias.
- No delegar a subagentes salvo autorización explícita.

## 3. Estado funcional actual

### Entrada a atención

- Dashboard monta `galeno-agenda`.
- La agenda navega a `#/atencion/{idConsulta}`.
- `router.js` asigna `usuario` e `idConsulta` a `<atencion-controller>`.
- Se mantienen los filtros de clínica y el contexto laboral activo.

### Pantalla implementada

- Encabezado fuera del Wizard: paciente, iniciales, edad, documento, fechas, responsable, procedimiento y estado.
- Nombre, edad y documento aparecen en líneas separadas.
- Selector de procedimientos donde participa el rol activo.
- Si solo hay un procedimiento visible para el rol, se abre automáticamente.
- **Ya no se utiliza el Wizard de siete apartados fijos.**
- Cada paso del Wizard corresponde a una ejecución real.
- Orden topológico basado en `procedimiento_paso_secuencia`.
- Se rechazan ciclos, referencias inválidas y ejecuciones duplicadas.
- Se avisan definiciones sin ejecución, sin fabricar registros.
- Navegación con elección de sucesor y retroceso por predecesores configurados.
- Borradores independientes por ejecución y procedimiento, conservando nodos y componentes.
- Progreso derivado de estados persistidos, sin completar pasos por visitarlos.

### Guardados permitidos

Usan los CRUD REST existentes:

- `consulta_procedimiento_paso.valor`.
- `orden_examen.indicaciones` de órdenes existentes.
- Resultado e interpretación de resultados existentes.
- Registro explícito de resultados para órdenes existentes cuando tienen contenido.
- Observaciones generales de consulta: guardado bloqueado tras reportarse pérdida
  de pasos por PUT genérico; ahora son de solo lectura. Se requiere una operación
  backend que actualice el campo sobre la entidad administrada sin sustituir
  colecciones (JsonbTransient + cascadas/orphanRemoval). No se modificó Java/SQL.

Características:

- Relectura antes del PUT y comparación de campos editados para detectar cambios previos de otra sesión.
- Espera confirmación antes de avanzar.
- Toast de éxito/error.
- Un fallo conserva los cambios pendientes.
- Si hubo guardado parcial, los campos ya confirmados actualizan su referencia inicial; el reintento no repite esas escrituras.
- No se crean resultados vacíos.
- No se sobrescribe la atención de un paso completado con contenido vacío.
- Observaciones del procedimiento disponibles en lectura fuera del Wizard.

**No hay transacción cliente que agrupe varios CRUD.**

### Operaciones intencionalmente bloqueadas

- Iniciar/completar pasos clínicos mediante lógica exclusivamente cliente.
- Finalizar procedimientos sin operación de negocio validada por el servidor.
- Cerrar toda la consulta desde este flujo.
- Crear órdenes de nuevos exámenes sin una relación persistida que identifique el examen.
- Subir adjuntos sin endpoint de archivos.

Los botones muestran las limitaciones. Siguiente permite revisar sucesores habilitados de pasos ya completados; no completa un pendiente para habilitarlos.

## 4. Archivos y clases principales

Todas las rutas siguientes son relativas al frontend indicado anteriormente.

| Archivo | Responsabilidad |
|---|---|
| `src/js/boundary/vistas/atencion_controller.js` | Carga, encabezado, documentos, selector, observaciones generales y confirmación de salida |
| `src/js/boundary/vistas/atencion_flujo.js` **nuevo** | Adaptador del Wizard para ejecuciones médicas; no es otro Wizard |
| `src/js/control/atencion_service.js` | Lectura, composición, grafo, permisos de campos y guardados REST |
| `src/js/boundary/componentes/navigation/wizard/Wizard.js` | Extensión opcional de progreso externo |
| `src/js/boundary/componentes/navigation/wizard/README.md` | API y comportamiento documentados |
| `src/Recursos/estilos/consultas.css` | Presentación de la atención |
| `src/serviceWorker.js` | Incluye `atencion_flujo.js` en `ARCHIVOS` |
| `docs/guia-tecnica.md` | Descripción vigente |
| `docs/atencion-dinamica.md` **nuevo** | Análisis, decisiones, SQL propuesto, límites y verificación |
| `test/atencion_test.html` | Suite de atención con estilos de los componentes reutilizados |
| `test/js/boundary/atencion_test.js` | Pruebas del flujo dinámico |
| `test/js/control/atencion_procedimientos_test.js` | Pruebas puras de grafo y restricciones |
| `test/js/navigation/wizard_test.js` | Regresión y progreso externo |

Métodos importantes:

**`AtencionController`:**

```text
cargar()
mostrar()
mostrarDetalle()
seleccionarProcedimiento(id)
actualizarCabeceraProcedimiento()
cargarDocumentoPaciente()
guardar()
hayCambios()
confirmarDescarte()
salir()
limpiar()
```

**`AtencionFlujo`:**

```text
abrir(procedimiento)
modelo(paso)
actualizarControles()
guardarActual(exigirAtencion = false)
ir(id, guardar = true)
siguiente()
anterior()
hayCambios()
destroy()
```

**Servicios:**

```text
documentoDelPaciente()
cargarDetalleAtencion()
flujoDelProcedimiento()
guardarCamposAtencion()
registrarResultadoAtencion()
```

**Advertencia importante:** `iniciarPasoProcedimiento()` y `finalizarAtencion()` ahora rechazan expresamente la operación. Esto es intencional y sustituye la implementación anterior que modificaba estados mediante PUT genérico. **No restaurarla sin nueva autorización.**

## 5. Componentes y comportamientos que deben conservarse

Se reutilizan:

- Wizard.
- TextArea.
- Checkbox.
- Toast.
- Modal/ConfirmDialog.

Importaciones:

```text
boundary/componentes/navigation/wizard/index.js
boundary/componentes/form/textarea/index.js
boundary/componentes/form/checkbox/index.js
boundary/componentes/feedback/index.js
boundary/componentes/overlays/index.js
```

### Wizard

Se agregó una única opción genérica:

```javascript
isStepComplete: id => /* boolean derivado de datos persistidos */
```

- Se evalúa en `update()`.
- Solo `true` marca completado.
- Sin callback, conserva su comportamiento anterior.
- Permite reflejar estados persistidos aunque se edite o navegue.

El adaptador de atención intercepta localmente los controles del Wizard para gestionar navegación y guardado. No reemplaza el componente ni sobrescribe sus métodos públicos.

### Trabajo anterior que debe conservarse

- Agenda filtrada por clínica y participación del rol en definiciones de pasos.
- Carrusel automático por desbordamiento real.
- Centrado del activo cuando caben al menos dos pasos completos.
- Espacio lateral para centrar también primero y último.
- Flechas que solo desplazan; teclado, movimiento reducido y limpieza de observadores.
- Variables CSS `--wizard-step-space-start/end` declaradas para evitar errores del IDE.
- Encabezado del paciente con iniciales y documento por `idPersona`.

El problema anterior de documentos se resolvió: se estaba comparando una consulta con el documento de otra persona. **No vincular documentos por nombre o apellido.**

## 6. Backend y SQL pendientes

### Hechos confirmados en el código inspeccionado

- Los recursos de pasos y procedimientos exponen CRUD genérico.
- Sus servicios heredan `AbstractService`.
- No se encontró una operación REST transaccional de completar paso o finalizar procedimiento.
- `OrdenExamen` tiene ejecución, indicaciones y fecha, pero **no identifica el examen solicitado**.
- `ExamenResultado` apunta a la orden y dispone de `resultado`, `interpretacion`, `rutaAtestado`.
- Las entidades contienen colecciones con cascadas y `orphanRemoval`; no reemplazarlas indiscriminadamente al implementar operaciones futuras.

### SQL propuesto, no aplicado

```sql
ALTER TABLE orden_examen
ADD COLUMN id_procedimiento_paso_examen UUID;

ALTER TABLE orden_examen
ADD CONSTRAINT fk_orden_examen_configuracion
FOREIGN KEY (id_procedimiento_paso_examen)
REFERENCES procedimiento_paso_examen (id_procedimiento_paso_examen)
ON DELETE RESTRICT;
```

Condiciones futuras:

- Mantener NULL en órdenes históricas que no puedan asociarse con certeza.
- Exigir la relación en nuevas órdenes.
- Validar configuración y examen activos y correspondencia con la definición de la ejecución.
- Desactivar configuraciones usadas, no eliminarlas.
- Definir idempotencia y política de repeticiones antes de imponer restricciones UNIQUE.
- No atribuir órdenes antiguas por texto, posición o por existir un único examen.
- No eliminar órdenes/resultados al desmarcar una casilla.

**Ningún cambio Java, SQL ni migración fue realizado.**

## 7. Pruebas y limitaciones verificadas

Última entrega comprobada en **Brave**:

| Suite | Resultado |
|---|---:|
| Atención dinámica, escritorio | 52/52 |
| Atención dinámica, móvil 360 × 640 | 52/52 |
| Wizard, escritorio | 52/52 |
| Wizard, móvil con movimiento reducido | 52/52 |
| Agenda | 27/27 |
| Personal | 14/14 |
| Checkbox | 14/14 |
| Router | 20/20 |
| Service worker | Aprobada |

También:

- `git diff --check`: sin errores.
- Inspecciones del IDE de los módulos principales, pruebas y CSS revisados: sin errores.
- REST simulado en las pruebas.
- **Escrituras clínicas reales: NO VERIFICADO. No se ejecutaron para probar esta entrega.**
- Atomicidad y concurrencia entre clientes: requieren soporte del servidor.
- Adjuntos absolutos http/https se presentan como enlaces seguros; otras rutas, como referencias.
- Borradores solo en memoria mientras permanece la vista.
- Salida explícita y navegación mediante `galeno-navegar` usan ConfirmDialog; cierre/recarga usa `beforeunload`.
- Protección de navegación directa por hash o botones Atrás/Adelante del navegador: **NO VERIFICADO**; no afirmar cobertura general sin revisarlo.
- Disponibilidad actual del REST: **NO VERIFICADO en esta solicitud**. Respondió en comprobaciones anteriores.

## 8. Estado actual y próximos pasos

**No quedó una funcionalidad frontend autorizada a medio implementar.** La última tarea terminó dentro del alcance confirmado. No hay fallos conocidos en las pruebas ejecutadas.

Última modificación realizada antes de esta solicitud: actualización de documentación del Wizard para reflejar las 52 pruebas de regresión. El servidor local de pruebas fue detenido.

Orden recomendado para continuar:

1. **Revisar el diff y probar la pantalla con el usuario.**  
   Reutilizar la implementación actual; reproducir cualquier incidencia antes de modificarla.

2. **Auditar la navegación directa por hash/Atrás/Adelante si se solicita protección completa de borradores.**  
   Revisar `router.js` y los guardias de `AtencionController`, preservando los contratos del router y sus pruebas.

3. **Verificar guardados contra un backend de pruebas solo con autorización y datos adecuados.**  
   Las pruebas actuales validan contratos simulados, no transacciones reales.

4. **Cuando el usuario autorice backend:** implementar validación transaccional de inicio, completado y cierre de procedimiento, usando entidades administradas y sin cerrar otros procedimientos.

5. **Cuando sea posible migrar el esquema:** relacionar orden y examen, adaptar el REST e implementar creación idempotente de órdenes.

6. **Adjuntos:** definir subida/descarga y permisos antes de habilitar controles de archivos.

No hay preguntas de negocio pendientes sobre las tres decisiones ya confirmadas. Las repeticiones legítimas de exámenes y la idempotencia deberán aclararse al abordar esa persistencia futura.

## 9. Estado de Git verificado

Rama actual:

```text
integrante-3
```

Últimos commits:

```text
e04277e Merge branch 'integrante-3' into integrante-2
7606341 refactorizacion en la busqueda y acceso del personal
cfcafdf feat: amplía la atención médica con formularios y guardado por rol
2f6a300 implementacion de busquedas de citas
e806073 feat: agrega componentes reutilizables y detalle de atención
cd0f337 Merge pull request #4 from re23009-Student-ues/Integrante-1
```

**Sin cambios staged.** Todo lo siguiente está sin confirmar.

Modificados:

```text
docs/guia-tecnica.md
src/Recursos/estilos/consultas.css
src/ejemplos/index.html
src/index.html
src/js/boundary/componentes/navigation/wizard/README.md
src/js/boundary/componentes/navigation/wizard/Wizard.js
src/js/boundary/vistas/atencion_controller.js
src/js/control/atencion_service.js
src/serviceWorker.js
test/atencion_test.html
test/js/boundary/atencion_test.js
test/js/navigation/wizard_test.js
```

Sin seguimiento:

```text
docs/atencion-dinamica.md
src/Recursos/estilos/checkbox.css
src/ejemplos/checkbox.html
src/ejemplos/checkbox.js
src/js/boundary/componentes/form/checkbox/
src/js/boundary/vistas/atencion_flujo.js
test/checkbox_test.html
test/js/control/atencion_procedimientos_test.js
test/js/form/checkbox_test.js
```

El diff de archivos rastreados muestra 12 archivos, 612 inserciones y 707 eliminaciones; **no incluye el contenido de archivos nuevos sin seguimiento**.

El trabajo de Checkbox y sus integraciones ya estaba presente al comenzar la última implementación y se reutilizó. No atribuir todos los cambios del árbol exclusivamente al flujo dinámico ni descartar archivos desconocidos.

No se hicieron commits, merges, resets ni descartes durante esta solicitud.

## 10. Ejecución de pruebas y herramientas

Leer la habilidad `chrome-devtools-cli` antes de automatizar el navegador. Obtener el CLI mediante la herramienta del IDE:

```text
get_chrome_connect_cli
```

CLI utilizado:

```text
/home/oswalv/Aplicaciones/WebStorm-262.10968.77/plugins/chromeConnect/bin/chrome-devtools
```

Brave confirmado:

```text
/usr/bin/brave-browser
```

Si hace falta configurar un navegador de pruebas, usar perfil temporal aislado:

```bash
"<CLI>" start --executablePath /usr/bin/brave-browser --isolated true --headless true
```

Servidor local, desde el frontend:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Páginas relevantes:

```text
http://127.0.0.1:8765/test/atencion_test.html
http://127.0.0.1:8765/test/wizard_test.html
http://127.0.0.1:8765/test/agenda_test.html
http://127.0.0.1:8765/test/personal_test.html
http://127.0.0.1:8765/test/checkbox_test.html
http://127.0.0.1:8765/test/router_test.html
```

Leer `document.body.dataset.testFailures` y `#mocha-stats`. Mantener activa la pestaña en pruebas con `requestAnimationFrame`, para evitar timeouts por suspensión de pestañas.

```bash
node --test test/serviceWorker_test.mjs
git diff --check
```

El aislamiento puede impedir conexiones locales aunque el REST esté funcionando. No diagnosticar caída del backend únicamente por un `curl` fallido dentro del sandbox.

## INSTRUCCIÓN INMEDIATA PARA LA NUEVA SESIÓN

> Trabaja en `/home/oswalv/WebstormProjects/GalenoFE`. Lee `AGENTS.md`, `docs/guia-tecnica.md` y `docs/atencion-dinamica.md`; revisa Git y preserva todo el trabajo sin confirmar. La atención ya usa un Wizard dinámico mediante `atencion_controller.js`, `atencion_flujo.js` y `atencion_service.js`. El alcance confirmado es solo frontend: no modificar Java/SQL ni restaurar transiciones clínicas por PUT genérico. Primero revisa el diff y reproduce en Brave cualquier incidencia que reporte el usuario. Conserva borradores, progreso persistido, elección de sucesores y restricciones de órdenes. Si no hay una incidencia nueva, solicita la siguiente prioridad antes de ampliar el alcance.
