# Wizard

Fachada JavaScript `Wizard(container, options)` con vista propia `<galeno-wizard>`
en DOM ligero. CSS: `src/Recursos/estilos/wizard.css`, incluido en `src/index.html`.
En otra página incluirlo explícitamente. No genera campos, hace HTTP ni persiste
datos. Se integra con las mismas convenciones ES Modules del resto del proyecto.

```js
import { Wizard } from '../componentes/navigation/wizard/index.js'; // desde vistas/

const personalForm = document.querySelector('#personalForm');
const contactForm = document.querySelector('#contactForm');
const review = document.createElement('p');
review.textContent = 'Revisa la información antes de continuar.';

const wizard = new Wizard('#patientWizard', {
    steps: [
        { id: 'personal', title: 'Datos personales', content: personalForm,
          validate: () => personalForm.checkValidity() },
        { id: 'contact', title: 'Contacto', content: contactForm,
          validate: async data => {
              // Función suministrada por la página o su servicio existente.
              const valid = await validateContactData(data.contact);
              return { valid, message: 'Revisa los datos de contacto.' };
          } },
        { id: 'review', title: 'Confirmación', content: review }
    ],
    linear: true,
    onStepChange: (current, previous) => { /* metadatos sin nodos DOM */ },
    onComplete: async data => {
        await savePatient(data); // Servicio existente suministrado por la página.
        // La página puede mostrar Toast.success aquí, sin acoplar Wizard con Toast.
    }
}).render();

// La página sincroniza explícitamente sus controles; no hay binding automático.
personalForm.addEventListener('input', () => {
    wizard.setData({ personal: Object.fromEntries(new FormData(personalForm)) });
});
contactForm.addEventListener('input', () => {
    wizard.setData({ contact: Object.fromEntries(new FormData(contactForm)) });
});
```

## Configuración

| Opción | Predeterminado | Contrato |
| --- | --- | --- |
| `steps` | Obligatorio | Arreglo no vacío de pasos con ids únicos y contenidos independientes |
| `linear` | `true` | No permite saltar pasos pendientes intermedios |
| `showProgress` | `true` | Barra de pasos completados, no porcentaje de campos |
| `showStepNumbers` | `true` | Sin números usa puntos; completados/error conservan sus símbolos |
| `allowBackNavigation` | `true` | Permite Anterior e indicador hacia pasos previos |
| `stepCarousel` | Ver abajo | Carrusel responsivo del indicador; no cambia la navegación de pasos |
| `previousText`, `nextText`, `finishText` | `Anterior`, `Siguiente`, `Finalizar` | Texto no vacío |
| `loadingText` | `Procesando…` | Texto del indicador de procesamiento |
| `data` | `{}` | Objeto de estado compartido inicial, clonado |
| `onStepChange` | Sin callback | Síncrono `(current, previous)`; excepción muestra aviso seguro sin revertir la navegación |
| `onComplete` | Sin callback | Síncrono/asíncrono `(data)`; por defecto completa sin efectos externos |

Cada paso: `id`, `title` (textos no vacíos), `description` (texto opcional),
`content` (Element, Text o DocumentFragment), `validate` (callback opcional),
`enabled` (predeterminado `true`) y `optional` (predeterminado `false`). No hay
inferencia de reglas desde nombres de campos. Un paso sin validador es válido.
Los deshabilitados se excluyen de la navegación, validación y progreso. Las opciones
y la lista de pasos se configuran al construir; no se modifican mediante atributos.

Los textos se insertan con `textContent`, nunca como HTML. Configuraciones inválidas
lanzan TypeError antes de mover contenido. No se admite reutilizar el mismo nodo,
ni un nodo que contenga otro contenido de paso, entre pasos de una instancia.

### Carrusel del indicador

```js
const wizard = new Wizard('#patientWizard', {
    steps,
    stepCarousel: {
        enabled: true,
        autoScroll: true,
        showArrows: true,
        smoothScroll: true
    }
}).render();
```

Las cuatro propiedades son booleanas, con valor predeterminado `true`; se pueden
omitir individualmente o prescindir de `stepCarousel`. El desbordamiento real,
no la cantidad de pasos ni un breakpoint, activa el carrusel y sus flechas.
`enabled: false` conserva la lista original que envuelve y se apila en móvil.
`autoScroll: false` permite controlar manualmente el desplazamiento sin seguir
automáticamente al activo. `showArrows: false` oculta las flechas pero conserva
desplazamiento nativo y teclado. `smoothScroll: false` aplica movimientos inmediatos.

Las flechas solo desplazan el indicador; no validan ni cambian el paso. Se
deshabilitan en los extremos. El área desplazable recibe foco con Tab cuando
hay desbordamiento: Izquierda/Derecha desplazan, Inicio/Fin van a los extremos.
Los botones de pasos mantienen su navegación existente y `aria-current="step"`.
Se admite desplazamiento táctil y trackpad nativos sin interceptar gestos.

`next()`, `previous()`, `goToStep()` y `reset()` mantienen visible el activo
y lo centran cuando el área permite mostrar al menos dos pasos completos. Se agrega
espacio lateral para centrar también el primero y el último; este espacio no se
cuenta al detectar desbordamiento y desaparece cuando todos caben. Si solo
cabe un paso, únicamente asegura su visibilidad.
El carrusel no desplaza la página ni añade cambios de foco. El contenido
de los formularios no se reconstruye. `ResizeObserver` ajusta el indicador al
cambiar el contenedor, abrir un Modal o revelar un contenedor oculto. Las medidas
se agrupan en un frame; `destroy()` cancela el frame, desconecta el observador y
retira listeners. No se fuerza el activo durante desplazamientos manuales.
`prefers-reduced-motion: reduce` desactiva el movimiento suave.

## API y navegación

- `render()`: devuelve la instancia; idempotente, sin duplicar listeners ni mover
  formularios de nuevo. No roba foco al montarse.
- `next()`, `previous()`, `goToStep(id)`: **Promise<boolean>**. `true` si navegó o
  completó; `false` si se bloqueó, falló, no hubo cambio, el id no existe, no se ha
  renderizado, se destruyó o ya terminó el proceso.
- `getCurrentStep()`, `getSteps()`: copias de metadatos `{ id, title, description,
  index, enabled, optional, active, completed, status }`. `index` es base cero
  respecto a la configuración; `status`: `current`, `completed`, `pending`, `error`.
- `getData()`: copia profunda del estado compartido.
- `setData(object)`: combina por claves del primer nivel, clona y devuelve la
  instancia. No sincroniza el DOM ni serializa formularios. Invalida las marcas
  de completado porque puede cambiar dependencias de cualquier paso.
- `setLoading(boolean)`: bloqueo externo de navegación, devuelve la instancia;
  ponerlo en false no interrumpe una validación/finalización interna.
- `reset()`: booleano. Restaura datos iniciales y estados, vuelve al primer paso
  habilitado y notifica el cambio si lo hay. **No borra ni reinicia los controles**.
  Se rechaza durante procesamiento. La página puede llamar `form.reset()` por su
  cuenta y sincronizar de nuevo los datos si necesita borrar controles.
- `destroy()`: idempotente. Retira listeners y vista, restaura nodos y descarta
  resultados asíncronos tardíos. No aborta las operaciones suministradas por la página.

Los formularios se montan una sola vez en paneles que usan `hidden`: no se clonan
ni desconectan al cambiar de paso. Conservan estado y listeners. Al destruir se
restauran mediante marcadores en su ubicación original (también en fragmentos).
Si se eliminó el marcador original, el contenido queda separado y se conserva
mediante la referencia que tenga la página. No compartir nodos entre instancias.

Un paso se considera completado después de validar correctamente una navegación
hacia adelante. Volver no valida; editar un control invalida la marca de su paso.
La navegación lineal puede volver a pasos anteriores y avanzar directamente solo
si los intermedios ya se completaron. La no lineal permite saltos, pero valida el
paso actual y los obligatorios intermedios: si fallan, permanece en el paso de
origen y muestra cuál requiere corrección. No marca otros pasos al fallar.
Los opcionales pueden omitirse al saltar en modo no lineal, pero se validan si se
visitan y se intenta salir hacia adelante.
La barra cuenta pasos validados: un opcional omitido no se marca completado.

La presentación usa botones nativos (Tab, Shift+Tab, Enter/Espacio), lista ordenada,
`aria-current="step"`, regiones de estado/error, títulos enfocables y paneles
etiquetados. Las flechas del área del carrusel desplazan, sin seleccionar pasos. El foco
se mueve al título del nuevo paso o al mensaje de error. El envío de un formulario
activo avanza sin envío nativo si la página no manejó ya su evento con preventDefault.

## Validación y finalización

`validate(data, step)` recibe copias y devuelve `true`, `false`, `{ valid: boolean,
message?: string }`, o una promesa de cualquiera. Las excepciones y resultados
inválidos producen un error seguro sin avanzar ni mostrar trazas técnicas.

En Finalizar primero se valida el actual y después todos los obligatorios
habilitados anteriores, incluso si estaban completados. Si un anterior dejó de
ser válido, se abre ese paso para corregirlo, también cuando el regreso ordinario
está deshabilitado. Para revisiones de paneles ocultos usar `checkValidity()`;
`reportValidity()` puede intentar enfocar controles ocultos antes de que se abra
el paso. No escribir datos desde el validador: sincronizarlos antes, con eventos
de los formularios. Si los datos o controles cambian mientras se validan, se
rechaza el resultado obsoleto y se solicita reintentar.

Solo después de validar se llama `onComplete(data)`. Mientras tanto se bloquean
botones y métodos de navegación, incluyendo dobles clics. `false` o una excepción
de onComplete producen un error de finalización; conserva datos y permite reintentar.
No llamar setData durante onComplete: cambiar el estado compartido mientras se
procesa invalida la confirmación de éxito. Usar la copia recibida por el callback.
Cualquier otro retorno exitoso completa. Los servicios que representen fallos con
un objeto deben ser comprobados por la página y lanzar un error si corresponde.
Un proceso completado no se ejecuta de nuevo hasta reset; tampoco se actualiza su
estado compartido con setData hasta reiniciarlo. Los controles DOM no se bloquean
automáticamente: pertenecen a la página.

`state` refleja `initial`, `in-progress`, `validating`, `validation-error`,
`completing`, `completion-error`, `completed`; la vista expone el mismo `data-state`.
El bloqueo externo se anuncia como procesamiento sin cambiar esa fase.

## Modal, estilos y límites

```js
import { Modal } from '../componentes/overlays/index.js';
const host = document.createElement('div');
const modal = new Modal({ title: 'Formulario multipaso', size: 'large' });
modal.setContent(host);
const wizard = new Wizard(host, { steps, onComplete }).render();
modal.open();
// Al abandonar definitivamente el proceso:
wizard.destroy();
modal.destroy();
```

Wizard no conoce Modal ni Toast. La página gestiona sus ciclos de vida y puede usar
`modal.setBusy(true)` durante una operación crítica. Cerrar Modal no destruye Wizard
automáticamente; destruir Modal tampoco cancela los callbacks del Wizard. Destruir
ambos explícitamente al abandonar la pantalla; usar AbortController en callbacks
propios si necesitan cancelación.

Variables en `.wizard`: `--wizard-primary`, `--wizard-success`, `--wizard-error`,
`--wizard-text`, `--wizard-muted`, `--wizard-border`, `--wizard-background`,
`--wizard-spacing`, `--wizard-radius`. Sobrescribir después del CSS. El indicador
horizontal conserva un ancho mínimo de 160px por paso (limitado por el viewport
en espacios menores), envuelve títulos largos y desplaza solo su área. Sin carrusel
habilitado conserva el apilado móvil original. Respeta movimiento reducido en el
carrusel y el indicador de carga.

Ejemplo local: `src/ejemplos/wizard.html`, con dos instancias, formularios,
validación y finalización asíncronas simuladas y Modal. No usa backend.
Suite: `test/wizard_test.html`, con Mocha, Chai y Sinon locales.

Requiere un navegador moderno con ES Modules, custom elements y structuredClone;
se recomienda ResizeObserver para detectar contenedores que cambian de tamaño o
visibilidad. Sin él solo se recalcula al navegar o redimensionar la ventana.
para el ejemplo modal se requiere dialog.showModal(). No almacena datos, no hace
binding, no evalúa reglas de negocio ni cancela por sí mismo acciones externas ya
iniciadas. Los datos compartidos deben ser objetos planos con valores clonables,
sin funciones ni nodos DOM; setData no combina objetos anidados recursivamente.
La lectura efectiva con tecnologías de asistencia debe verificarse manualmente.

Validación del carrusel y centrado: 51/51 casos en escritorio y 51/51 en móvil
emulado de 360 × 640 con movimiento reducido, incluyendo las 31 pruebas anteriores.
Cubre 2, 3, 10 y 20 pasos, títulos largos, resize, contenedor oculto, Modal,
opciones, extremos, teclado, navegación, independencia de instancias y limpieza.
En la demostración se verificó Fin con una tecla real (desplaza sin navegar),
seguimiento suave hasta el paso nueve en tableta de 768 × 1024 y ausencia de
desbordamiento de página en móvil/tableta. El desplazamiento táctil/trackpad usa
overflow nativo; no se probó con hardware táctil físico ni lectores de pantalla.
