# TextArea

Fachada JavaScript con vista `<galeno-textarea>` en DOM ligero. Conserva un
`<textarea>` nativo, sin Shadow DOM ni intermediarios de FormData. No realiza
peticiones ni guarda información. No hay dependencia de Modal, Wizard o Toast.
CSS: `src/Recursos/estilos/textarea.css`, incluido en `src/index.html`. Incluirlo
explícitamente en otras páginas.

```js
import { TextArea } from '../componentes/form/textarea/index.js'; // desde vistas/

const notes = new TextArea(document.querySelector('#observations'), {
    name: 'observations', label: 'Observaciones', placeholder: 'Escribe aquí…',
    rows: 4, minRows: 3, maxRows: 10, autoResize: true,
    required: true, minLength: 10, maxLength: 1000, showCounter: true,
    helperText: 'Describe las observaciones.'
}).render();

const result = notes.validate(); // { valid: boolean, message: string }
const formData = new FormData(document.querySelector('#patientForm'));
```

## Opciones

| Opción | Predeterminado | Contrato |
| --- | --- | --- |
| `name`, `placeholder` | `''` | Texto |
| `label` | Sin etiqueta adicional | Texto opcional |
| `ariaLabel` | name o `Texto multilínea` | Nombre alternativo si no hay label configurado |
| `value` | `''` | Texto; no se trunca automáticamente |
| `rows` | `4` | Entero positivo |
| `minRows` | `rows` | Mínimo en modo autoResize |
| `maxRows` | Mayor entre `rows` y `10` | Entero positivo, no menor que minRows |
| `minLength`, `maxLength` | `null` | Entero >= 0; null elimina la restricción |
| `required`, `disabled`, `readOnly` | `false` | Booleanos |
| `autoResize` | `false` | Mantiene el comportamiento nativo si está deshabilitado |
| `showCounter` | `false` | Contador visual sin región live ni anuncio en cada tecla |
| `helperText` | `''` | Texto seguro |

Una etiqueta visible da nombre accesible al campo. Si se omite, el nombre se toma
de `ariaLabel`, `name` o «Texto multilínea».

## API

- `render()`: idempotente; devuelve la instancia.
- `getValue()`: lee siempre el valor DOM actual; después de destroy devuelve el último valor conservado.
- `setValue(string)`, `clear()`: actualizan valor, contador, validez y altura sin
  emitir input/change artificiales. No modifican el valor de reset
  después de renderizar. Antes del primer render, setValue establece el valor inicial.
- `focus()`, `blur()`: métodos nativos, sin bloquear Tab/Shift+Tab. Sus eventos
  se conservan en el control.
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
  Elimina el control junto con su vista.

Los setters de tipos inválidos y las configuraciones incorrectas lanzan TypeError.
Los límites numéricos aceptan como máximo 2147483647, sin conversiones silenciosas
por desbordamiento de atributos nativos.
Los métodos mutadores son inofensivos tras destroy si sus
argumentos son válidos.

## Validación y formularios

Se utilizan required, minlength, maxlength y setCustomValidity nativos. También se
comprueba la longitud de valores programáticos: los navegadores no siempre marcan
tooShort/tooLong tras asignar value desde JavaScript. Un campo opcional vacío no
incumple minLength. No se recortan espacios: required sigue la semántica nativa;
la regla de espacios se aplica desde la pantalla cuando corresponde.

El contador usa `textarea.value.length`, en unidades UTF-16 como maxlength. Por
ejemplo, muchos emojis ocupan dos unidades; los saltos de línea del value se
normalizan a LF de acuerdo con el comportamiento nativo. Sin límite: `N caracteres`.
Con límite: `N / máximo`. maxlength restringe la escritura/pegado nativos; setValue
puede superar ese límite y conserva el texto, marcándolo inválido.

La validez se sincroniza desde el render con las restricciones nativas.
Los mensajes visuales y
aria-invalid solo se activan tras input, change, blur, un evento invalid nativo,
setError o validate. Inicialmente no hay mensaje de error visible.

No hay listener de submit ni preventDefault. FormData recibe el name y valor nativos:
disabled queda excluido; readOnly mantiene selección y consulta del texto, participa
en FormData y está excluido de validación de restricciones como indica HTML.
El reset del formulario conserva defaultValue nativo; contador, error y altura se
actualizan después de su acción predeterminada, sin emitir eventos artificiales.

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
// Atención pasa el formulario como content de un paso; también puede usarse en Modal.
// Al abandonar la vista: notes.destroy().
```

La ayuda y el error se asocian por identificador mediante aria-describedby.
Los ids generados son únicos; el foco y los eventos siguen siendo nativos. El
contador no es live para evitar anuncios repetidos. El error usa role=alert.

Variables `.textarea`: `--textarea-text`, `--textarea-muted`, `--textarea-background`,
`--textarea-border`, `--textarea-focus`, `--textarea-error`, `--textarea-disabled`,
`--textarea-readonly`, `--textarea-radius`, `--textarea-spacing`.

Suite: `test/textarea_test.html` con Mocha,
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
