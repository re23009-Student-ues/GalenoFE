# Checkbox

Fachada `new Checkbox(container, options).render()`, como TextArea; vista propia
`<galeno-checkbox>` y `<input type="checkbox">` en DOM ligero. Importar desde
`form/checkbox/index.js` e incluir `Recursos/estilos/checkbox.css` (ya en index.html).
El destino es un elemento contenedor. El componente genera un identificador
único para asociar el control con su etiqueta.

Opciones: `name`, `label`, `value`, `checked`, `disabled` y `onChange(checked)`.
La vista proporciona el nombre y el valor que recibe FormData para las casillas
marcadas y habilitadas. `setChecked(boolean)` actualiza el estado sin emitir
`change` ni cambiar el valor inicial que restaura el formulario.

```js
import { Checkbox } from './js/boundary/componentes/form/checkbox/index.js';
const fields = examenes.map(examen => new Checkbox(document.querySelector('#examenes'), {
    name: 'examenes', label: examen.nombre, value: examen.id,
    checked: guardados.includes(examen.id),
    onChange: checked => actualizarIndicaciones(examen, checked)
}).render());
const seleccionados = () => examenes.filter((_, index) => fields[index].getChecked());
// Antes de retirar o reconstruir la vista:
fields.forEach(f => f.destroy());
```

Wizard y Modal mueven los nodos sin recrear inputs; la selección se conserva. La vista recibe el evento `change` nativo.
`setDisabled(boolean)` controla la interacción y `destroy()` retira el nodo y el listener.
Suite: `test/checkbox_test.html`.
Tab y Espacio utilizan el comportamiento nativo; no hay manejadores de teclado propios.
