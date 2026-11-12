 # Reglas del proyecto
- Solo ECMAScript. Prohibido frameworks, librerías, CSS de terceros.
- Todo elemento de UI es un Web Component propio (customElements.define).
- Estilos propios en src/Recursos/estilos.
- Cada comportamiento nuevo lleva pruebas Mocha/Chai/Sinon en test/js.
- Todo archivo nuevo de src se agrega a ARCHIVOS en serviceWorker.js.
- Cambios pequeños y enfocados; no reescribir archivos completos.
