# Wizard de Atención

`Wizard` monta `galeno-wizard` en el contenedor de Atención. Cada paso aporta
`id`, `title`, un elemento DOM independiente en `content` y `enabled`.
El indicador y los botones delegan en `onSelect(id)`, `onPrevious()`,
`onSave()` y `onNext()`. La edición del panel activo llama a `onEdit()`.

`updateView({ steps, previous, saveDisabled, next })` presenta el estado
calculado por Atención. `steps` mantiene el orden del montaje y aporta
`enabled`, `completed`, `disabled`, `detail`, `status` y un `tooltip`
opcional. `previous` aporta `title` y `disabled`; `next`, `text` y
`disabled`. `setLoading()` bloquea las acciones durante una operación.
`goToStep(id)` muestra un paso visible y enfoca su encabezado tras la
decisión de Atención. Los paneles conservan sus nodos y borradores.

El indicador activa su carrusel al desbordar. El teclado y las flechas
desplazan el indicador independientemente del paso activo. `destroy()`
libera listeners, el observador y los frames, y restaura la posición de los
paneles que se movieron desde el DOM.

Estilos en `src/Recursos/estilos/wizard.css` y `consultas.css`.
Pruebas en `test/wizard_test.html` y `test/atencion_test.html`.
