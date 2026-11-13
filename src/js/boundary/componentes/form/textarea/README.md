# TextArea

Fachada JavaScript con vista `<galeno-textarea>` en DOM ligero. Conserva un
`<textarea>` nativo, sin Shadow DOM ni intermediarios de FormData. No realiza
peticiones ni guarda información. No hay dependencia de Modal, Wizard o Toast.
CSS: `src/Recursos/estilos/textarea.css`, incluido en `src/index.html`. Incluirlo
explícitamente en otras páginas.

```js
import { TextArea } from '../componentes/form/textarea/index.js'; // desde vistas/

// Puede ser un <textarea> existente o un contenedor donde crear uno.
const notes = new TextArea('#observations', {
    name: 'observations', label: 'Observaciones', placeholder: 'Escribe aquí…',
    rows: 4, minRows: 3, maxRows: 10, autoResize: true,
    required: true, minLength: 10, maxLength: 1000, showCounter: true,
    helperText: 'Describe las observaciones.',
    validator: value => value.trim() ? true : 'No uses solo espacios.',
    onInput: (value, event) => { /* Evento input nativo */ },
    onChange: (value, event) => { /* Evento change nativo */ },
    onFocus: (value, event) => {},
    onBlur: (value, event) => {}
}).render();

const result = notes.validate(); // { valid: boolean, message: string }
const formData = new FormData(document.querySelector('#patientForm'));
```

## Opciones

| Opción | Predeterminado | Contrato |
| --- | --- | --- |
| `name`, `placeholder` | Valores nativos existentes o `''` | Texto |
| `label` | Sin etiqueta adicional | Texto opcional |
| `ariaLabel` | Nombre existente, name o `Texto multilínea` | Nombre alternativo si no hay label configurado |
| `value` | Valor actual del textarea o `''` | Texto; no se trunca automáticamente |
| `rows` | Filas nativas existentes o `4` | Entero positivo |
| `minRows` | `rows` | Mínimo en modo autoResize |
| `maxRows` | Mayor entre `rows` y `10` | Entero positivo, no menor que minRows |
| `minLength`, `maxLength` | Restricción nativa existente o `null` | Entero >= 0; null elimina la restricción |
| `required`, `disabled`, `readOnly` | Valores nativos existentes o false | Booleanos |
| `autoResize` | `false` | Mantiene el comportamiento nativo si está deshabilitado |
| `showCounter` | `false` | Contador visual sin región live ni anuncio en cada tecla |
| `helperText` | `''` | Texto seguro |
| `validator` | Sin validador | Función síncrona pura `(value) => true | false | string` |
| `onInput`, `onChange`, `onFocus`, `onBlur` | Sin callbacks | `(value, nativeEvent)` |

Si hay un label externo, omitir `label` para reutilizarlo sin añadir otra etiqueta visible. Un label
configurado explícitamente añade una etiqueta propia y establece aria-labelledby;
no modifica el texto de etiquetas externas. En un label envolvente utiliza un
span etiquetado para no generar labels anidados. Sin etiqueta visible se conserva
el nombre accesible existente o se proporciona un nombre alternativo.

## API

- `render()`: idempotente; devuelve la instancia. No reemplaza un textarea existente.
- `getValue()`: lee siempre el valor DOM actual; después de destroy devuelve el último valor conservado.
- `setValue(string)`, `clear()`: actualizan valor, contador, validez y altura sin
  emitir input/change ni callbacks artificiales. No modifican el valor de reset
  después de renderizar. Antes del primer render, setValue establece el valor inicial.
- `focus()`, `blur()`: métodos nativos, sin bloquear Tab/Shift+Tab. Sus eventos
  reales sí llaman los callbacks correspondientes.
- `validate()`: `{ valid, message }`; muestra errores explícitamente. Después de
  destruir devuelve `{ valid: false, message: 'El control fue destruido.' }`.
- `setError(string)`: error suministrado por la página; usa textContent y
  setCustomValidity. Se mantiene hasta editar, setValue o clearError.
- `clearError()`: elimina el mensaje manual y vuelve al estado visual sin error;
  las restricciones siguen aplicándose a la validez nativa. Un valor inválido
  sigue bloqueando la validación del formulario, aunque el mensaje esté oculto.
- `setDisabled(boolean)`, `setReadOnly(boolean)`, `setHelperText(string)`: mantienen
  estado y DOM sincronizados, devolviendo la instancia.
- `refresh()`: método adicional para recalcular contador, validez, asociación al
  formulario y altura después de cambios directos mediante APIs DOM.
- `destroy()`: idempotente. Desconecta observadores, eventos, reset y frames pendientes.
  Restaura atributos, clases, estilos, defaultValue y validez personalizada originales
  de un control existente, preservando su valor actual, identidad y listeners
  externos. Lo devuelve a su posición original con un marcador; sin marcador queda
  separado y accesible mediante la referencia de la página. Un control creado
  dentro de un contenedor se elimina junto con la vista.

Los setters de tipos inválidos y las configuraciones incorrectas lanzan TypeError.
Los límites numéricos aceptan como máximo 2147483647, sin conversiones silenciosas
por desbordamiento de atributos nativos.
No compartir un mismo textarea entre varias instancias; sí se admiten múltiples
campos independientes. Los métodos mutadores son inofensivos tras destroy si sus
argumentos son válidos.

## Validación y formularios

Se utilizan required, minlength, maxlength y setCustomValidity nativos. También se
comprueba la longitud de valores programáticos: los navegadores no siempre marcan
tooShort/tooLong tras asignar value desde JavaScript. Un campo opcional vacío no
incumple minLength. No se recortan espacios: required sigue la semántica nativa;
la regla de espacios pertenece al validator de la página.

El contador usa `textarea.value.length`, en unidades UTF-16 como maxlength. Por
ejemplo, muchos emojis ocupan dos unidades; los saltos de línea del value se
normalizan a LF de acuerdo con el comportamiento nativo. Sin límite: `N caracteres`.
Con límite: `N / máximo`. maxlength restringe la escritura/pegado nativos; setValue
puede superar ese límite y conserva el texto, marcándolo inválido.

El validador personalizado se ejecuta después de las restricciones básicas y debe
ser síncrono y sin efectos externos. `true` valida; un string no vacío es el error;
false u otros resultados invalidan con mensaje genérico. Las excepciones muestran
un mensaje seguro sin trazas. Las promesas no están admitidas como validadores;
se consideran inválidas y sus rechazos se consumen para evitar errores sin manejar.
Para validación asíncrona, coordinarla desde la página o el Wizard.

La validez se sincroniza silenciosamente desde el render para que el formulario
nativo también reconozca la validación personalizada. Los mensajes visuales y
aria-invalid solo se activan tras input, change, blur, un evento invalid nativo,
setError o validate. Inicialmente no hay mensaje de error visible.

No hay listener de submit ni preventDefault. FormData recibe el name y valor nativos:
disabled queda excluido; readOnly mantiene selección y consulta del texto, participa
en FormData y está excluido de validación de restricciones como indica HTML.
El reset del formulario conserva defaultValue nativo; contador, error y altura se
actualizan después de su acción predeterminada, sin emitir callbacks artificiales.

En un ejemplo de página (la página decide si enviar):

```js
form.addEventListener('submit', event => {
    event.preventDefault(); // Responsabilidad de esta página.
    if (!notes.validate().valid) return;
    const data = new FormData(form);
    // La página utiliza sus servicios existentes si necesita guardar data.
});
```

## AutoResize, accesibilidad y composición

AutoResize mide line-height, padding y bordes. Limita la altura entre minRows y
maxRows; al máximo usa scroll vertical. Sin autoResize no cambia height ni resize
en línea. ResizeObserver detecta cambios de ancho, tipografía y visibilidad desde
display:none; las correcciones se agrupan en requestAnimationFrame, fuera del ciclo
del observador. No utiliza polling ni observa todos los cambios del documento.

Al mover el Web Component se desconecta y reconecta el observador y el listener de
reset del formulario correspondiente. Por eso funciona al mostrarse en un paso
oculto de Wizard o al abrir un Modal sin conocerlos. No se destruye por un simple
movimiento del DOM: la página debe llamar destroy al abandonar el campo.

```js
const host = document.createElement('div');
const form = document.createElement('form'); form.append(host);
const notes = new TextArea(host, { name: 'notes', required: true, autoResize: true }).render();
const wizard = new Wizard(wizardHost, { steps: [
    { id: 'notes', title: 'Notas', content: form, validate: () => notes.validate().valid }
] }).render();
// El mismo host o formulario puede ser contenido de Modal.
// Al abandonar: notes.destroy(); wizard.destroy(); modal?.destroy();
```

Se conserva aria-describedby externo y se añaden ayuda/error por id, sin duplicados.
Los ids generados son únicos; el foco y los eventos siguen siendo nativos. El
contador no es live para evitar anuncios repetidos. El error usa role=alert.

Variables `.textarea`: `--textarea-text`, `--textarea-muted`, `--textarea-background`,
`--textarea-border`, `--textarea-focus`, `--textarea-error`, `--textarea-disabled`,
`--textarea-readonly`, `--textarea-radius`, `--textarea-spacing`.

Ejemplo: `src/ejemplos/textarea.html`. Suite: `test/textarea_test.html` con Mocha,
Chai y Sinon existentes. Requiere ES Modules, custom elements y requestAnimationFrame.
Mantener la pestaña de pruebas en primer plano: los navegadores pausan los frames
de las mediciones de altura en segundo plano.
Sin ResizeObserver se responde a resize de ventana; llamar refresh al mostrar
contenedores ocultos. Las asignaciones directas a textarea.value no emiten eventos
nativos: usar setValue o llamar refresh. No incluye validación asíncrona, persistencia
ni reglas clínicas. La lectura efectiva debe verificarse con lectores de pantalla.

Verificación en Brave: 27/27 pruebas en escritorio y 27/27 en móvil de 360 × 640
con movimiento reducido. También aprobaron 11/11 del service worker y 5/5 del
catálogo de ejemplos. Con entrada nativa se comprobó maxlength (500 caracteres),
contador, Enter multilínea y navegación Tab/Shift+Tab. No se probó con lectores
de pantalla reales.
