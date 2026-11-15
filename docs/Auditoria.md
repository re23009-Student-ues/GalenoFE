El CLI de Chrome falló con EROFS al acceder a /run/user/1000/chrome-devtools-mcp/daemon.pid. La habilidad chrome-devtools-cli exige detener los intentos de navegador ante errores no documentados. ¿Quieres proporcionar un comando o ruta de navegador autorizado para continuar las pruebas visuales? Seguiré mientras tanto con la auditoría estática y las pruebas disponibles.

**GalenoSV tiene una base funcional comprobable, pero todavía no cumple íntegramente el parcial.** Los bloqueos principales son la selección de clínica en HU1, el PDF del backend, el registro de nuevos exámenes y la finalización de pasos en HU4. Además, varios componentes visuales propios todavía son clases DOM ordinarias, sin registro como Web Components.

No modifiqué archivos de los repositorios ni datos clínicos. Las pruebas del backend se ejecutaron sobre una copia temporal; Brave utilizó perfiles temporales.

**Fuentes y alcance**

Contrasté el [documento de auditoría](</home/oswalv/Documents/SegundoPPI /Requerimientos_Auditoria_GalenoSV_PPI115.docx>) con la [definición oficial del parcial](</home/oswalv/Documents/SegundoPPI /definicionSegundoParcialPPI115_gt02_2026.pdf>). Ambos coinciden en historias, restricciones, ponderaciones y evaluación secuencial.

La auditoría corresponde al **estado actual del directorio**, que incluye modificaciones previas y archivos sin seguimiento, tanto en frontend como en backend. No equivale exclusivamente a estos commits:

| Repositorio | HEAD |
|---|---|
| Frontend | `e04277ebb03502a24f1b01d995c66c037c99424b` |
| Backend: `/home/oswalv/IdeaProjects/GalenoSV` | `b77dbfdcd6f02ab1a4fff47f16e0c660953089c3` |

En las tablas, **CUMPLE** significa comprobado dentro del alcance indicado; no implica que se hayan ejecutado escrituras clínicas reales.

**Matriz de historias de usuario**

Prioridades: **P0** bloquea una historia obligatoria; **P1** afecta permisos, arquitectura o estabilidad; **P2** requiere completar validación o presentación.

| ID | Estado | Evidencia | Prueba realizada | Problema / corrección propuesta | Prioridad |
|---|---|---|---|---|---|
| HU1-01 | CUMPLE | [router.js:8](/home/oswalv/WebstormProjects/GalenoFE/src/js/router.js:8) | Acceso real a `#/citas` sin sesión. | Pantalla pública disponible. | — |
| HU1-02 | CUMPLE | [citas_controller.js:109](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:109) | Catálogo REST real y suites de citas. | Permite seleccionar tipo activo. | — |
| HU1-03 | CUMPLE | [citas_controller.js:74](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:74) | Documento inválido marcó error y deshabilitó Buscar. | Habilita número después del tipo y valida formato. | — |
| HU1-04 | **NO CUMPLE** | [citas_controller.js:13](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:13), [agenda_service.js:138](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/agenda_service.js:138) | DOM real: no existe selector de clínica. | Consulta todas las inscripciones. Añadir selección entre clínicas del paciente y aplicarla a la búsqueda. | P0 |
| HU1-05 | CUMPLE | [citas_controller.js:30](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:30), [agenda_service.js:156](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/agenda_service.js:156) | Rango invertido rechazado; pruebas de límites y zona horaria. | Filtro funcional, aunque aparece después de buscar, no dentro del asistente completo descrito. | P2 |
| HU1-06 | CUMPLE | [citas_controller.js:142](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:142) | Búsqueda REST real mostró una card. | Renderiza `galeno-tarjeta-cita`. | — |
| HU1-07 | CUMPLE | [tarjeta_cita.js:9](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/tarjeta_cita.js:9) | Card real y revisión de plantilla. | Incluye fecha/hora, clínica y procedimientos. | — |
| HU1-08 | **NO CUMPLE** | [agenda_service.js:8](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/agenda_service.js:8), [tarjeta_cita.js:9](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/tarjeta_cita.js:9) | Botón deshabilitado; GET del ticket devolvió **404**. | Implementar generación PDF en backend y conectar descarga. | P0 |
| HU2-01 | CUMPLE | [login.js:36](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/login.js:36) | Login real y 18 pruebas de pantalla aprobadas. | Pantalla propia disponible. | — |
| HU2-02 | CUMPLE | [sesion_service.js:82](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/sesion_service.js:82) | Ingreso real por tipo/número; pruebas de formato y documento inexistente. | Sigue el mecanismo solicitado por el enunciado. | — |
| HU2-03 | PARCIAL | [main.js:43](/home/oswalv/WebstormProjects/GalenoFE/src/js/main.js:43), [atencion_controller.js:115](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/atencion_controller.js:115) | Contexto, filtros por rol/clínica y pruebas de rechazo. | Hay controles visuales; el detalle valida clínica antes de mostrar datos y filtra procedimientos después. Completar autorización uniforme por recurso y solicitante. | P1 |
| HU2-04 | PARCIAL | [sesion_service.js:98](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/sesion_service.js:98), [ValidacionAtencion.java:62](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/control/ValidacionAtencion.java:62) | Exclusión de Paciente probada; inspección backend. | Backend valida el contexto recibido, pero no encontré vínculo con identidad autenticada del solicitante. No se probaron escrituras anónimas. | P1 |
| HU3-01 | CUMPLE | [router.js:59](/home/oswalv/WebstormProjects/GalenoFE/src/js/router.js:59) | Suite del router: 20/20. | Dashboard protegido por sesión del frontend. | — |
| HU3-02 | CUMPLE | [selector_contexto.js:24](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/selector_contexto.js:24) | Selector real; pruebas de pertenencia y cambio de contexto. | Ofrece clínicas y roles laborales de la persona. | — |
| HU3-03 | CUMPLE | [agenda.js:6](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/agenda.js:6) | Agenda real inició con ambas fechas en `2026-11-15`. | Consulta por clínica, rol y día actual. | — |
| HU3-04 | CUMPLE | [agenda_service.js:173](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/agenda_service.js:173) | Ampliar rango al día anterior mostró la consulta existente. | Fechas pasadas/futuras y rango validado. | — |
| HU3-05 | PARCIAL | [agenda.js:37](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/agenda.js:37) | Agenda real e inspección de plantilla. | Muestra nombre/apellidos e inicio; otros generales están en atención. Completar ficha resumida. El enunciado no enumera campos concretos de “generales”. | P2 |
| HU3-06 | CUMPLE | [agenda.js:37](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/agenda.js:37), [agenda_service.js:212](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/agenda_service.js:212) | Procedimiento y antecedentes visibles; pruebas de ramas por secuencia. | Agrupa consulta → procedimiento → pasos/registros y muestra dependencias. | — |
| HU3-07 | CUMPLE | [agenda.js:24](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/agenda.js:24) | Plantilla y pruebas con registros simulados. | Muestra responsable, rol e instantes; informa si faltan datos. | — |
| HU3-08 | CUMPLE | [agenda.js:24](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/agenda.js:24) | Antecedentes desplegables y prueba de escape de contenido. | Permite leer `valor` registrado. | — |
| HU3-09 | CUMPLE | [agenda.js:13](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/agenda.js:13) | Botón real abrió atención de la consulta. | Navega conservando el identificador. | — |
| HU4-01 | CUMPLE | [router.js:91](/home/oswalv/WebstormProjects/GalenoFE/src/js/router.js:91) | Recorrido real dashboard → atención. | Carga consulta y Wizard correspondientes. | — |
| HU4-02 | PARCIAL | [atencion_flujo.js:231](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/atencion_flujo.js:231), [atencion_service.js:172](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/atencion_service.js:172) | Guardado probado con REST simulado y pruebas Java. | Existe PUT de atención; **persistencia desde UI contra datos reales NO VERIFICABLE**, porque no se ejecutaron escrituras clínicas. | P1 |
| HU4-03 | **NO CUMPLE** | [atencion_flujo.js:224](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/atencion_flujo.js:224), [OrdenExamen.java:47](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/entity/OrdenExamen.java:47) | UI real mostró dos opciones y el aviso de bloqueo. | Seleccionar un examen nuevo no crea su orden; falta relación persistida identificable y operación de creación. Editar órdenes existentes no satisface este requisito. | P0 |
| HU4-04 | PARCIAL | [atencion_flujo.js:275](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/atencion_flujo.js:275) | Pruebas del flujo y bloqueo visible real. | Avanza si el paso ya llega completado, pero la aplicación no permite completarlo. Implementar transición validada y habilitar sucesor. | P0 |
| HU4-05 | CUMPLE | [atencion_flujo.js:284](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/atencion_flujo.js:284) | Suite de atención y navegación del Wizard. | Retrocede según predecesor/historial, conservando borradores. Comprobado con datos simulados. | — |

**Los 14 observables y su puntuación**

La definición publica ponderaciones, pero **no una fórmula para otorgar fracciones**. Las estimaciones siguientes son orientativas; no representan una calificación del evaluador ni ignoran el corte secuencial.

| ID | Observable | Máximo oficial | Estado | Estimación | Justificación |
|---|---|---:|---|---:|---|
| SPA-01 | Navegación fluida y consistente | 0.5 | CUMPLE | 0.50 | Recorrido real y router 20/20; [router.js:79](/home/oswalv/WebstormProjects/GalenoFE/src/js/router.js:79). |
| PWA-01 | Instalación y su gestión | 0.5 | PARCIAL | 0.25 | Manifest válido, `beforeinstallprompt` real y instalador 9/9. Instalación/arranque desde el sistema **NO VERIFICABLE**; [instalador_app.js:55](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/instalador_app.js:55). |
| PWA-02 | Funcionalidad online/offline | 0.5 | PARCIAL | 0.25 | Shell y catálogo recargaron offline. Solo respalda GET previamente guardados; no conserva todas las operaciones de HU4 sin red; [serviceWorker.js:150](/home/oswalv/WebstormProjects/GalenoFE/src/serviceWorker.js:150). |
| WC-01 | Arquitectura totalmente Web Components | 1 | PARCIAL | 0.50 | Pantallas y varios controles sí lo son. Calendar, DataTable, gráficas y Modal siguen siendo clases DOM ordinarias; [calendar.js:23](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/calendar/calendar.js:23), [Modal.js:16](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/componentes/overlays/Modal.js:16). |
| WC-02 | Modularidad y organización | 0.5 | CUMPLE | 0.50 | Separación boundary/control/entity y módulos reutilizables; [atencion_flujo.js:1](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/atencion_flujo.js:1). |
| WC-03 | Componentes propios, sin dependencias externas | 1 | CUMPLE | 1.00 | No encontré imports, CSS o scripts de terceros en la aplicación. Mocha/Chai/Sinon están en pruebas; [index.html:8](/home/oswalv/WebstormProjects/GalenoFE/src/index.html:8). |
| WC-04 | Lógica reactiva y asíncrona | 0.5 | CUMPLE | 0.50 | Promesas, eventos, control de respuestas tardías y limpieza; [citas_controller.js:117](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:117). |
| TEST-01 | Cobertura integral | 0.5 | PARCIAL | 0.25 | Cobertura funcional amplia, sin medición integral frontend y con flujos obligatorios incompletos; [atencion_test.js:9](/home/oswalv/WebstormProjects/GalenoFE/test/js/boundary/atencion_test.js:9). |
| TEST-02 | Pruebas significativas | 0.5 | PARCIAL | 0.25 | Prueban conflictos, paginación, roles y fallos; queda un fallo reproducible; [validaciones_transaccionales_test.js:48](/home/oswalv/WebstormProjects/GalenoFE/test/js/control/validaciones_transaccionales_test.js:48). |
| UI-01 | Interfaz atractiva, coherente y orientada a UX | 0.5 | **NO VERIFICABLE** | NV | Se verificó estructura y comportamiento; no una inspección visual completa de todas las pantallas y estados. |
| UI-02 | Estilos propios y criterios visuales óptimos | 1 | PARCIAL | 0.75 | CSS local, paleta y tipografía coherentes en código; falta evaluación visual/contraste completa; [principal.css:5](/home/oswalv/WebstormProjects/GalenoFE/src/Recursos/estilos/principal.css:5). |
| UI-03 | Responsive y experiencia uniforme | 0.5 | PARCIAL | 0.25 | Citas y atención sin desbordamiento horizontal a 360 px; no se verificaron todas las combinaciones; [agenda.css:24](/home/oswalv/WebstormProjects/GalenoFE/src/Recursos/estilos/agenda.css:24). |
| UX-01 | Cumplimiento cabal de historias | 2 | PARCIAL | 0.75 | Faltan clínica, PDF, nuevas órdenes y completar pasos. Evidencias en la matriz. |
| UX-02 | Ergonomía y accesibilidad | 0.5 | PARCIAL | 0.25 | Labels, estados anunciados, foco y diálogos probados; no auditoría completa con lector de pantalla y contraste; [citas_controller.js:18](/home/oswalv/WebstormProjects/GalenoFE/src/js/boundary/vistas/citas_controller.js:18). |
| **TOTAL** | | **10** | **NO VERIFICABLE como nota final** | **—** | Falta evidencia y aplica evaluación secuencial. |

**Pruebas ejecutadas y límites**

| Ejecución | Resultado |
|---|---|
| `node test/serviceWorker_test.mjs` | **11/11 aprobadas**. |
| 27 páginas de pruebas en Brave aislado, motor Chromium 156 | **462 casos distintos: 461 aprobados y 1 fallo**, considerando las repeticiones con foco activo. |
| Suites principales | Agenda 27/27; atención 64/64; router 20/20; login 18/18; sesión 16/16; Wizard 52/52. |
| Servicios con Mocha/Chai/Sinon bajo Node | 65/65; son casos también incluidos en las páginas anteriores, **no se suman nuevamente**. |
| Helpers de fechas, tablas y geometría | 119 aserciones aprobadas; tampoco equivalen a cobertura porcentual. |
| `node --check` sobre código JS propio | 106 archivos sin errores de sintaxis. |
| Integración existente `tipoExamen_service_it.js`, ejecutada bajo Node con REST real | **2/2 aprobadas**, solo GET. |
| Backend, primera corrida con Java 25 | 264 casos: 257 errores de inicialización de Mockito; resultado de entorno, no evidencia de 257 defectos funcionales. |
| Backend con Java 21 y agente explícito de Mockito | **264/264 aprobadas**, 33 suites. |
| `git diff --check` | Sin errores de whitespace en los cambios existentes. |

Comando backend exitoso, sobre copia temporal:

```bash
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
mvn -o -B -q -Djacoco.skip=true \
-DargLine=-javaagent:/home/oswalv/.m2/repository/net/bytebuddy/byte-buddy-agent/1.14.12/byte-buddy-agent-1.14.12.jar \
test
```

El único fallo frontend reproducible es [ejemplos_test.js:26](/home/oswalv/WebstormProjects/GalenoFE/test/js/boundary/ejemplos_test.js:26): espera 12 enlaces, pero [el catálogo contiene 13](/home/oswalv/WebstormProjects/GalenoFE/src/ejemplos/index.html:18).

La primera corrida produjo además cuatro fallos dependientes del foco en gráficas, TextArea y Toast. **Los cuatro pasaron al repetir con la página enfocada**; no los clasifico como defectos confirmados.

Las pruebas que comprueban que iniciar/finalizar permanece bloqueado pueden pasar correctamente y, aun así, **HU4 seguir incompleta**. Tampoco las pruebas de PDF con un binario simulado demuestran generación real desde backend: [agenda_test.js:76](/home/oswalv/WebstormProjects/GalenoFE/test/js/agenda_test.js:76).

**Recorrido funcional comprobado**

| Flujo | Positivo | Negativo / límite | Alcance pendiente |
|---|---|---|---|
| HU1 | Documento real devolvió una card. | Formato inválido bloqueó Buscar; rango invertido mostró error. | No hay clínica seleccionable; PDF 404. |
| HU2 | Documento de una persona con rol laboral abrió dashboard. | Suites rechazan documento inexistente, formato inválido y persona solo paciente. | Autorización efectiva de escrituras ligada al solicitante. |
| HU3 | Contexto visible; agenda inició en hoy. Ampliar al día anterior mostró una consulta y permitió abrirla. | Suites cubren clínica ajena, contexto inválido, errores REST y páginas incompletas. | Amplitud de “generales” y validación completa de permisos. |
| HU4 | Atención real cargó Wizard, diez campos TextArea y dos opciones de examen. | Avisos reales bloquearon nuevas órdenes y completar el paso. | Guardado clínico real no ejecutado; ciclo completo no disponible. |
| Offline | Service worker v15 activo; pantalla pública y catálogo recargaron sin red. | La implementación requiere respuesta previamente almacenada para cada URL GET. | Flujos completos offline, escrituras y recuperación posterior. |

No observé desbordamiento horizontal en citas y atención a 360 px. Esto no demuestra que todas las pantallas, contenidos largos y estados sean uniformes en cualquier dispositivo.

**REST: contratos usados, verificados y faltantes**

Base utilizada: `http://127.0.0.1:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/`, definida en [default_service.js:6](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/default_service.js:6).

| Contrato | Resultado / alcance |
|---|---|
| GET `tipo_documento?activo=true&first&max` | **200**, dos tipos activos. |
| GET `documento/buscar?tipo&valor` | Usado exitosamente por búsqueda/login reales. |
| GET `documento?persona&first&max` | **200**, un documento en la muestra. |
| GET `persona_rol/persona/{persona}` | **200**, roles reales. |
| GET `consulta/{id}` | **200**. |
| GET `consulta?persona&first&max` | **200**, una cita. |
| GET `consulta?clinica&rol&desde&hasta&first&max` | **200**, una consulta en el rango ampliado. |
| GET `consulta/resumen?clinica` | **200**, DTO agregado. |
| GET `consulta/estados?consultas&first&max` | **200**, un resumen. |
| GET `consulta_procedimiento?consultas…` | **200**, un procedimiento. |
| GET `consulta_procedimiento_paso?consultas…` | **200**, tres ejecuciones. |
| GET `procedimiento_paso?procedimientos…` | **200**, tres definiciones. |
| GET `procedimiento_paso_secuencia?pasos…` | **200**, dos secuencias. |
| GET `procedimiento_paso_examen?pasos&activo=true…` | **200**, dos configuraciones. |
| GET `orden_examen?consultas…` | **200**, una orden. |
| GET `examen_resultado?ordenes…` | **200**, lista vacía válida. |
| GET `tipo_examen?first&max` | **200**, tres elementos. |
| PUT `{recurso}/{id}/atencion` | Implementado para pasos, órdenes y resultados; probado con mocks y suites Java. **No ejecutado sobre datos clínicos reales**. |
| POST `examen_resultado/atencion` | Implementado con contexto, idempotencia y `Location`; probado unitariamente, sin POST real. |
| GET `consulta/{id}/ticket` | **404 confirmado**. Es la ruta esperada por el cliente, no un nombre exigido por el parcial. |
| Crear orden vinculada al examen seleccionado | Operación integrada faltante para HU4. |
| Completar paso/habilitar sucesor | Operación validada integrada faltante. El enunciado no prescribe su URL. |

Las relaciones y paginación tienen implementación y pruebas sustanciales: [agenda_service.js:64](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/agenda_service.js:64). El backend admite filtros por persona, clínica, rol y fechas en [ConsultaResource.java:59](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/boundary/rest/ConsultaResource.java:59).

**Separación de problemas frontend/backend**

| Capa | Hallazgo | Consecuencia |
|---|---|---|
| Frontend | Falta selector de clínica en HU1. | Incumplimiento directo, aunque REST permita búsquedas filtradas. |
| Frontend | Nuevas selecciones de exámenes se conservan solo como borrador. | No se registra el examen administrado/seleccionado. |
| Frontend | Completar y finalizar están bloqueados. | No puede completarse el ciclo clínico desde la interfaz. |
| Frontend | Calendar, DataTable, BarChart, PieChart, Modal y Toast no tienen su propio registro como custom elements. | Arquitectura parcialmente basada en Web Components; que sean propios no subsana ese punto. |
| Backend | No hay ticket PDF disponible en la ruta consumida. | HU1-08 bloqueada. |
| Backend/modelo | `OrdenExamen` no identifica la configuración de examen seleccionada; véase [OrdenExamen.java:47](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/entity/OrdenExamen.java:47). | El frontend no puede asociar de forma fiable selección y orden persistida. |
| Backend | Valida el UUID de contexto recibido, sin vínculo encontrado con identidad autenticada del solicitante. | Validación de negocio presente; autorización del actor incompleta en el código inspeccionado. |
| Backend | Persisten operaciones genéricas como [PUT consulta:224](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/boundary/rest/ConsultaResource.java:224) y [DELETE orden:144](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/boundary/rest/OrdenExamenResource.java:144). | Revisar que no permitan eludir permisos y operaciones clínicas específicas. No se intentó explotarlas. |
| Configuración | API fijada a HTTP y puerto 9080. | Funciona localmente; despliegue HTTPS remoto y posible contenido mixto **no verificados**. |

Hay también una inconsistencia de estados: el flujo reconoce `FINALIZADO` como completo, pero exige exactamente `COMPLETADO` para habilitar predecesores. Ocurre en [atencion_service.js:96](/home/oswalv/WebstormProjects/GalenoFE/src/js/control/atencion_service.js:96) y [ValidacionAtencion.java:118](/home/oswalv/IdeaProjects/GalenoSV/src/main/java/sv/edu/ues/occ/ingenieria/ppi115_2026/salud/galenosv/control/ValidacionAtencion.java:118). Debe aclararse el contrato antes de implementar la transición.

**Bloqueos de la evaluación secuencial**

La regla oficial detiene la revisión al fallar o faltar un observable; no establece cómo tratar un resultado “PARCIAL”.

1. **SPA-01:** tiene evidencia favorable.
2. **PWA-01:** instalabilidad y oferta comprobadas; falta validar instalación y arranque desde el sistema.
3. **PWA-02:** primer bloqueo material si se exige conservar todas las funciones offline, porque el respaldo actual solo cubre lecturas guardadas.
4. **WC-01:** siguiente bloqueo claro: la arquitectura no está totalmente formada por Web Components.
5. **Pruebas:** persiste un fallo reproducible y no se demuestra cobertura integral.
6. **UX-01:** incumplimiento confirmado por clínica, PDF y operaciones pendientes de HU4.

Si el evaluador recorre primero las historias, **HU1-04 es el primer requisito individual ausente**, seguido por HU1-08. No corresponde asumir que se obtendrán puntos de observables posteriores a un corte.

**Plan de correcciones priorizado, sin implementación**

| Orden | Prioridad | Trabajo concreto | Criterio de aceptación |
|---:|---|---|---|
| 1 | P0 | Completar asistente HU1 con clínica y rango. | Solo ofrece clínicas del paciente y devuelve sus citas del contexto elegido. |
| 2 | P0 | Generar ticket PDF desde backend y habilitar descarga. | PDF real, no vacío, con resumen de la cita correcta; errores probados. |
| 3 | P0 | Definir relación examen–orden y crear órdenes seleccionadas. | Selección persiste y se reconstruye al recargar sin asociaciones heurísticas. |
| 4 | P0 | Implementar completar paso y avance validado. | Atención guardada, transición persistida y sucesor habilitado; primer/último paso correctamente limitados. |
| 5 | P1 | Vincular actor autenticado y contexto permitido; revisar CRUD alternativos. | Un solicitante ajeno no puede escribir indicando el UUID de otro empleado. No exige incorporar contraseñas si no forman parte del contrato acordado. |
| 6 | P1 | Convertir los componentes visuales pendientes en Web Components propios. | Cada componente reutilizable registra su elemento y conserva pruebas/ciclo de vida. |
| 7 | P1 | Completar comportamiento offline y probar recuperación. | Casos definidos para datos no guardados y operaciones sin conexión, sin presentar guardados inexistentes. |
| 8 | P1 | Corregir prueba del catálogo y añadir pruebas de las funciones completadas. | Suites verdes que comprueben los requisitos, además de los bloqueos defensivos. |
| 9 | P2 | Completar generales del paciente y validar instalación, contraste, teclado y lector de pantalla. | Evidencia reproducible de escritorio/móvil y accesibilidad. |
| 10 | P1, entrega | Preparar el commit entregable. | Un clon limpio del SHA entregado contiene todos los archivos necesarios y reproduce las pruebas. |

**Requisitos oficiales frente a recomendaciones**

Son oficiales: las cuatro historias, SPA/PWA, funcionamiento online/offline, ECMAScript sin terceros, Web Components exclusivos, pruebas por comportamiento, UI/UX y entrega por commit.

Son comprobaciones o recomendaciones adicionales: cobertura porcentual, estrategia concreta de caché, nombres de endpoints, uso de idempotencia, forma exacta del grafo y herramientas de accesibilidad. No los traté como frases literales del parcial. Tampoco exigí campos separados de diagnóstico/tratamiento: la imagen es referencial.

Como observaciones de reglas locales, [ejemplos.css](/home/oswalv/WebstormProjects/GalenoFE/src/ejemplos/ejemplos.css) está fuera de `src/Recursos/estilos`, y tres README de `src` no aparecen en `ARCHIVOS`. No detecté recursos ejecutables faltantes en la precarga comprobada. Estas observaciones locales no reciben una penalización oficial automática.

**La funcionalidad restante no es una cuestión meramente visual: HU1 y HU4 necesitan cambios coordinados de frontend y backend antes de presentar el flujo completo a evaluación.**