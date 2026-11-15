# Checkbox

Fachada `new Checkbox(container, options).render()`, como TextArea; vista propia
`<galeno-checkbox>` y `<input type="checkbox">` en DOM ligero. Importar desde
`form/checkbox/index.js` e incluir `Recursos/estilos/checkbox.css` (ya en index.html).
El destino es un contenedor o selector; no envuelve inputs existentes.

Opciones: `id` opcional y único, `name` y `label` (texto), `value` (texto, por defecto
`on`), `checked`, `disabled`, `required` (booleanos, por defecto false),
`onChange(checked, value)`. Los IDs automáticos y de errores se reservan incluso
antes del montaje; un id explícito duplicado lanza TypeError. No reutilizar el
mismo contenedor después de reemplazar su contenido sin destruir las instancias.

Métodos: `getChecked()`, `getValue()`, `setChecked(boolean)`, `setDisabled(boolean)`,
`setError(texto)`, `clearError()`, `validate()` → `{ valid, message }`, `focus()`,
`render()` y `destroy()`. Los setters, focus y render devuelven la instancia.
Destroy es idempotente y libera listeners, temporizador, nodos y reservas de ID.
`setChecked` no emite cambios ni altera el valor inicial de reset.
La interacción emite además `galeno-checkbox-change` con `{ checked, value }` en
`detail`, propagación y composed. El evento nativo change también se conserva.

Solo required o un error explícito bloquean la validación; deshabilitado se excluye.
Los errores aparecen tras interacción, validate, setError o invalid nativo.
clearError oculta el error pero conserva la restricción required. FormData incluye
solo casillas seleccionadas y habilitadas. Reset restaura checked inicial y limpia
errores sin emitir onChange; reset cancelado conserva el estado.

```js
import { Checkbox } from './js/boundary/componentes/form/checkbox/index.js';
const fields = examenes.map(examen => new Checkbox('#examenes', {
    name: 'examenes', label: examen.nombre, value: examen.id,
    checked: guardados.includes(examen.id),
    onChange: (checked, value) => console.log(checked, value)
}).render());
const seleccionados = () => fields.filter(f => f.getChecked()).map(f => f.getValue());
// Wizard: content es el formulario que contiene #examenes.
// validate: () => fields.every(f => f.validate().valid)
// Antes de retirar o reconstruir la vista:
fields.forEach(f => f.destroy());
```

Wizard y Modal mueven los nodos sin recrear inputs; la selección se conserva y
los listeners de reset se reconectan al formulario actual. Sin HTTP ni persistencia.
Ejemplo ejecutable: `src/ejemplos/checkbox.html`. Suite: `test/checkbox_test.html`.
Tab y Espacio utilizan el comportamiento nativo; no hay manejadores de teclado propios.
