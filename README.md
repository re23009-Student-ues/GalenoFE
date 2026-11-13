# GalenoFE

## Ejemplos de componentes

El catálogo está en [src/ejemplos/index.html](src/ejemplos/index.html). Incluye las
doce demostraciones de componentes reutilizables, con recursos y datos de ejemplo
locales. Consultar [las instrucciones e inventario](src/ejemplos/README.md).

## Consulta y atención (SPA)

En Agenda Médica, seleccionar una tarjeta abre Atención y Procedimientos en
`#/atencion/<id>`, sin recargar el documento. La pantalla permite
volver a Consultas y consultar el paciente, su edad calculada desde la fecha de nacimiento,
los procedimientos y los pasos relacionados. No guarda información clínica en
localStorage ni crea registros o endpoints.

Consume exclusivamente los recursos existentes `consulta` y
`consulta_procedimiento_paso`, con sus servicios y paginación actuales. Conserva
los filtros del listado por usuario/clínica. La edad se calcula en años cumplidos
desde `idPersonaRol.idPersona.fechaNacimiento`, respecto a la fecha local actual,
sin desplazar el día de nacimiento por zona horaria. Si falta la fecha, es inválida
o futura, se muestra «No disponible». No hay un recurso específico de
atención implementado en este frontend: el detalle presenta la consulta y sus
pasos reales. Solo el estado explícito `EN_CURSO` identifica pasos actuales; no se
deduce por orden, fecha ni estado pendiente.

La consulta se muestra como **Finalizada** únicamente cuando el REST devuelve al
menos un paso y todos sus pasos están `COMPLETADO` o `FINALIZADO`. Se revisan todos
sus procedimientos y páginas de pasos; `fechaFin` por sí sola no la finaliza. Los
pasos pendientes, cancelados, desconocidos o ausentes impiden la finalización.
La agenda y el detalle de atención utilizan la misma regla; si falla la carga de
pasos no se presenta una finalización basada en fechas.

Pruebas: abrir `test/atencion_test.html` mediante un servidor HTTP local. Los datos
simulados están únicamente en las pruebas. Suite validada en Brave: 9/9 casos en
escritorio y móvil (360 × 640). Tras adaptar la integración al shell y router por
hash actuales: 9/9 de atención, 20/20 del router, 12/12 del shell, 7/7 de cierre
de sesión y 11/11 del service worker. La integración con el backend real requiere que este esté disponible y
devuelva las relaciones usadas por los servicios existentes.

## Estructura de carpetas
```
GalenoFE/
├── src/                          ← TODO el código de la aplicación
│   ├── index.html                ← única página; define el layout (menú, topbar, #app-root)
│   ├── Recursos/
│   │   ├── estilos/              ← CSS (uno por pantalla/componente)
│   │   └── imagenes/             ← logos y fondos (png, svg)
│   └── js/
│       ├── main.js               ← punto de entrada: sesión, login y arranque del router
│       ├── router.js             ← tabla de rutas → pantalla (custom element)
│       ├── boundary/             ← CAPA DE PRESENTACIÓN (lo que se ve)
│       │   ├── login.js
│       │   ├── menu_lateral.js
│       │   ├── topbar.js
│       │   ├── util_html.js
│       │   ├── vistas/           ← pantallas completas (*_controller.js)
│       │   └── componentes/      ← piezas reutilizables (tarjetas, etc.)
│       ├── control/              ← CAPA DE LÓGICA (servicios, REST, reglas)
│       └── entity/               ← CAPA DE DATOS (clases modelo)
├── test/                         ← pruebas (Mocha + Chai + Sinon, en el navegador)
│   ├── index.html
│   ├── tipoExamen_test.html      ← pruebas unitarias (fetch simulado)
│   ├── tipoExamen_it.html        ← pruebas de integración (backend real)
│   └── js/
│       ├── control/              ← los scripts de prueba (*_test.js, *_it.js)
│       └── lib/                  ← librerías de prueba (chai, mocha, sinon) — NO tocar
├── .vscode/                      ← configuración de depuración y tareas
├── .gitignore
└── repomix-output.xml            ← volcado del repo para IA; se ignora en git, no editar
```
