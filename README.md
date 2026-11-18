# GalenoFE

## Componentes de la aplicación

Agenda muestra su árbol de procedimientos con `galeno-tree`. Atención usa
`galeno-wizard` para mostrar los pasos. Sus suites están en `test/`.

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

### Pruebas

Desde la raíz, ejecuta `python3 -m http.server 8000 --bind 127.0.0.1`.
Abre `http://127.0.0.1:8000/test/` y elige **Ejecutar todas las suites** o
abre una suite individual para ver cada aserción en Mocha. Las suites usan
Chai y Sinon locales y simulan las llamadas REST.

Ejecuta también `node test/serviceWorker_test.mjs` para verificar el
ciclo de vida del service worker, la precarga y el comportamiento offline.

#### Cobertura

| Métrica | Medición inicial | Ronda anterior | Medición actual |
|---|---:|---:|---:|
| Líneas | 98,18 % (3470/3534) | 98,83 % (3493/3534) | 99,63 % (3521/3534) |
| Ramas | 84,85 % (2476/2918) | 85,91 % (2507/2918) | 90,09 % (2629/2918) |

La medición incluye los 52 archivos JavaScript de `src/`, incluido el
service worker, mediante instrumentación temporal de Istanbul. El HTML,
sus scripts inline, los estilos y las dependencias de pruebas quedan fuera
de la medición. REST se simula en las pruebas.

Para repetir la medición, usa Node.js 20 o posterior y un navegador Chromium.
El comando requiere `istanbul-lib-instrument` y `istanbul-lib-coverage` como
herramientas de pruebas. Si están instaladas en el sistema, indica su
directorio con `NODE_PATH`. Por ejemplo, en Linux con Brave:

```sh
NODE_PATH=/usr/share/nodejs node test/cobertura.mjs /usr/bin/brave-browser /tmp/galeno-cobertura.json
```

El JSON incluye los resultados por suite y las líneas y ramas pendientes
por archivo. El comando abre un navegador con perfil temporal y un servidor
local en un puerto libre.


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
│   └── js/
│       ├── control/              ← los scripts de prueba (*_test.js)
│       └── lib/                  ← librerías de prueba (chai, mocha, sinon) — NO tocar
├── .vscode/                      ← configuración de depuración y tareas
├── .gitignore
└── repomix-output.xml            ← volcado del repo para IA; se ignora en git, no editar
```
merge
