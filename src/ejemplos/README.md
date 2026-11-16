# Ejemplos de componentes

Abrir `src/ejemplos/index.html` desde un servidor HTTP local. Por ejemplo, desde la
raíz del proyecto: `python3 -m http.server 8765`, y visitar
`http://localhost:8765/src/ejemplos/`.

Todos los ejemplos usan módulos ES, CSS y datos ficticios locales. No invocan el
backend al abrirse ni utilizan librerías externas. Las funciones opcionales de
carga REST de los ejemplos existentes requieren invocación explícita y una URL
real proporcionada por quien las use.

| Componente | Ejemplo | Estado al revisar |
| --- | --- | --- |
| BarChart | `bar-chart.html` + `bar-chart.js` | Restaurado tras limpieza |
| PieChart | `pie-chart.html` + `pie-chart.js` | Restaurado tras limpieza |
| DataTable | `data-table.html` + `data-table.js` | Restaurado tras limpieza |
| Calendar | `calendar.html` + `calendar.js` | Restaurado tras limpieza |
| Wizard | `wizard.html` + `wizard.js` | Agregado |
| TextArea | `textarea.html` + `textarea.js` | Agregado |
| Toast | `toast.html` + `toast.js` | Agregado |
| Modal | `modal.html` + `modal.js` | Agregado |
| ConfirmDialog | `confirm-dialog.html` + `confirm-dialog.js` | Agregado |
| TarjetaSimple | `tarjeta-simple.html` + `tarjeta-simple.js` | Agregado |
| TarjetaConsulta | `tarjeta-consulta.html` + `tarjeta-consulta.js` | Agregado |
| InstaladorApp | `instalador-app.html` + `instalador-app.js` | Agregado |

Wizard demuestra formularios preservados entre pasos, validación asíncrona,
finalización con fallo/reintento y otra instancia dentro de Modal. Las esperas y
fallos son simulaciones explícitas, sin llamadas HTTP ni registros persistidos.

TextArea demuestra contador, autoResize, validación y FormData nativos. Incluye un
textarea existente, un campo con altura nativa, otro inicialmente oculto y una
instancia dentro de Wizard y Modal. No realiza solicitudes al backend.

Toast permite probar los cuatro tipos, opciones individuales, posiciones, cola,
persistencia y cierres. TarjetaSimple permite actualizar sus slots. TarjetaConsulta
muestra consultas con distintas fechas relativas al momento de carga. No carga
pasos: una fecha de fin pasada ya no muestra Finalizada. En las pantallas reales,
la página asigna `tarjeta.pasos` con los pasos de la consulta devueltos por el REST.
InstaladorApp simula `beforeinstallprompt`, `userChoice` y `appinstalled` sin instalar
la aplicación ni alterar el navegador.

Las exportaciones `index.js` y los módulos auxiliares de fechas, geometría y modelo
se ejercitan mediante los componentes, no son componentes visuales independientes.
Los controllers de pantallas están fuera de la carpeta de componentes reutilizables.

Los ejemplos se mantienen separados de las pantallas reales. Sus HTML, módulos y
CSS compartido se incluyen en la precarga del service worker, según las reglas
actuales del proyecto, para permitir abrirlos sin conexión tras instalar la caché.

La hoja de estilo de TarjetaSimple se resuelve respecto a su módulo con
`import.meta.url`, para que funcione tanto en la SPA como desde estas páginas.

Verificación de la restauración en Brave: 5/5 pruebas aprobadas en
`test/ejemplos_test.html`. Comprueban los doce enlaces del catálogo y los controles
de los cuatro ejemplos restaurados en un ancho de 360 px, sin errores de recursos
ni solicitudes REST automáticas. Las 11 pruebas del service worker también aprobaron.
