# GalenoFE

Estructura de carpetas

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
└── repomix-output.xml            ← volcado del repo para IA; se ignora en git, no editar.
