# Modal y ConfirmDialog

Módulos ES sin red ni dependencias. El CSS está en `src/Recursos/estilos/modal.css`,
incluido en `src/index.html` y precargado con los tres módulos en el service worker.
En páginas independientes se debe incluir explícitamente el CSS. Requiere soporte
nativo de `<dialog>.showModal()`. El navegador gestiona fondo inerte, foco modal y
navegación Tab/Shift+Tab; no se implementa un focus trap paralelo.

## Modal

```js
import { Modal } from '../componentes/overlays/index.js'; // desde vistas/

const form = document.querySelector('#patientForm');
const modal = new Modal({
    title: 'Registrar paciente', size: 'medium',
    closable: true, closeOnEscape: true, closeOnOverlay: true,
    initialFocus: 'input',
    actions: [
        { label: 'Cancelar', onClick: modal => modal.close() },
        { label: 'Revisar', variant: 'primary', onClick: () => form.requestSubmit() }
    ],
    onOpen: modal => { /* abierto */ },
    onClose: modal => { /* cerrado */ }
});
modal.setContent(form); // nodo DOM existente, con sus listeners
modal.open();
```

| Opción | Predeterminado | Contrato |
| --- | --- | --- |
| `title` | `Diálogo` | Texto no vacío; nombre accesible |
| `size` | `medium` | `small`, `medium`, `large`, `fullscreen` |
| `closable` | `true` | Habilita cierre de usuario: X, Escape y overlay |
| `closeOnEscape` | `true` | Escape solo actúa sobre el superior |
| `closeOnOverlay` | `true` | Cierra solo si pulsación y clic terminan fuera del panel |
| `animated` | `true` | Respeta movimiento reducido |
| `initialFocus` | Nativo | Selector dentro del diálogo o HTMLElement contenido |
| `actions` | `[]` | Footer opcional: `{ label, variant, disabled, onClick(modal, event) }` |
| `onOpen`, `onClose` | Sin callback | Síncronos; se invocan una vez por cambio de estado |

Las variantes de acción son `secondary` (predeterminada), `primary` y `danger`.
Las acciones no se cierran ni ejecutan lógica automáticamente. Los errores de
callbacks del Modal genérico pertenecen a la página.

- `open()` y `close()`: idempotentes; devuelven la instancia. Cerrar es inmediato
  para el estado y callbacks, aunque el navegador puede terminar la transición
  visual. Abrir de nuevo no deja temporizadores ni cierres pendientes.
- `isOpen()`: booleano.
- `setTitle(text)` y `setContent(text | Node)`: seguros, no interpretan HTML;
  devuelven la instancia. Acepta elementos, texto y DocumentFragment.
- `setBusy(boolean)`: bloquea todos los cierres ordinarios, incluido `close()`,
  deshabilita X y acciones y marca `aria-busy`. `setBusy(false)` restaura el estado
  previo de esos botones. La página gestiona el estado de sus propios formularios.
- `destroy()`: idempotente. Fuerza el cierre incluso en procesamiento, notifica
  `onClose` si estaba abierto, restaura contenido y elimina DOM y listeners.
  Después de destruir, abrir/cerrar/establecer contenido son operaciones sin efecto.

El nodo recibido se mueve, no se clona. **Permanece en el modal al cerrar** para
conservar formularios y componentes; se restaura a su ubicación original al
reemplazar contenido o destruir. Se usan marcadores para conservar el orden. Si
la ubicación original ya no existe, el nodo queda separado y puede recuperarse
mediante la referencia de la página. Un mismo nodo no debe pertenecer a dos modales.
Los custom elements movidos pueden recibir sus callbacks nativos de desconexión
y conexión; su propia implementación debe admitir ese ciclo.

`element`, `body` y `footer` permiten referenciar el DOM para integraciones. Usar
los métodos del componente para cerrar/destruir; eliminar el nodo directamente no
es un mecanismo de limpieza. Formularios `method="dialog"` también notifican cierre
y no pueden enviarse con ese método mientras el modal está ocupado.

## ConfirmDialog

```js
import { ConfirmDialog } from '../componentes/overlays/index.js';
import { Toast } from '../componentes/feedback/index.js';

const confirmed = await ConfirmDialog.show({
    title: 'Cancelar cita', message: '¿Deseas cancelar esta cita?',
    type: 'warning', confirmText: 'Cancelar cita', cancelText: 'Volver'
});
if (confirmed) {
    // cancelAppointment es un servicio existente suministrado por la página.
    try {
        await cancelAppointment(appointmentId);
        Toast.success('La cita fue cancelada correctamente.');
    } catch {
        Toast.error('No fue posible cancelar la cita.');
    }
}
```

También se puede mantener el diálogo durante la acción:

```js
const confirmed = await ConfirmDialog.show({
    title: 'Eliminar registro', message: 'Esta acción no se puede deshacer.',
    type: 'danger', confirmText: 'Eliminar',
    onConfirm: async () => { await deletePatient(patientId); },
    onCancel: () => { /* cancelación sin ejecutar la acción */ }
});
if (confirmed) Toast.success('Registro eliminado correctamente.');
```

`onConfirm` es responsabilidad de la página: debe **rechazar/lanzar un error** si
la operación falla. Si un servicio devuelve un resultado de error sin rechazar,
la página debe comprobarlo y lanzar antes de retornar. No hay solicitudes HTTP ni
acoplamiento con Toast dentro de los componentes.

| Opción | Predeterminado |
| --- | --- |
| `title` | `Confirmar acción` |
| `message` | `¿Deseas continuar?` |
| `type` | `default`: también `danger`, `warning`, `info` |
| `confirmText`, `cancelText` | `Confirmar`, `Cancelar` |
| `processingText` | `Procesando…` |
| `errorMessage` | `No fue posible completar la acción. Intenta nuevamente.` |
| `onConfirm` | Callback opcional, síncrono o asíncrono |
| `onCancel` | Callback síncrono opcional; se notifica una vez |
| `size` | `small` |
| `closable`, `closeOnEscape`, `closeOnOverlay`, `animated` | `true` |
| `icon` | SVG generado localmente; `false` para ocultar o SVGElement confiable que se clona |
| `color` | Color de tipo por CSS; acepta un color CSS válido |

Textos no vacíos y callbacks válidos son obligatorios cuando se proporcionan.
Configuraciones inválidas lanzan TypeError en constructores; `show()` devuelve una
promesa rechazada. Un navegador sin dialog produce un error explícito, sin fallback.

Contrato de `show()`:

- `true` solo al confirmar y terminar satisfactoriamente `onConfirm`, si existe.
- `false` al cancelar, cerrar con X/Escape/overlay o destruir.
- Durante procesamiento deshabilita acciones y cierre. Los dobles clics no ejecutan
  otra acción. Cancelar recibe el foco inicial, incluso en confirmaciones destructivas.
- Un rechazo de `onConfirm` **no resuelve la promesa** ni cierra: muestra el texto
  seguro `errorMessage`, permite reintentar o cancelar. Nunca muestra el error técnico.
- El resultado se resuelve una sola vez. Las llamadas a `show()` forman una cola
  FIFO: solo existe una confirmación activa creada por esa API.
- `ConfirmDialog.dismissAll()` destruye la activa y resuelve todos los pendientes
  con `false`, por ejemplo al abandonar una pantalla. No cancela por sí mismo la
  operación de negocio ya iniciada; la página puede usar su propio AbortController.

Para control explícito se admite `new ConfirmDialog(options)`, `open()`, `result`
(Promise boolean) y `destroy()`, además de métodos heredados. Es de un solo uso y
no se reabre después de resolver. Al destruir incluso antes de abrir, `result` se
resuelve con `false`. Las instancias manuales no participan en la cola estática;
la página debe evitar superponerlas.

## Estilos, ejemplos y límites

Variables CSS de `.modal`: `--modal-background`, `--modal-text`, `--modal-border`,
`--modal-radius`, `--modal-padding`, `--modal-shadow`, `--modal-overlay`,
`--modal-primary`, `--modal-danger`. `.confirm-dialog` usa `--confirm-accent`.
Sobrescribirlas en reglas posteriores al CSS. Elegir colores con contraste adecuado.
El fondo usa `::backdrop`, sin un overlay DOM duplicado.

Ejemplos interactivos: `src/ejemplos/modal.html` y
`src/ejemplos/confirm-dialog.html`, enlazados desde el catálogo. Suite local:
`test/overlays_test.html` (Mocha/Chai/Sinon existentes).

Las transiciones de cierre usan `display` y `overlay` con `allow-discrete` y
`@starting-style`: navegadores sin estas extensiones conservan el diálogo funcional
con cambios visuales inmediatos. No se bloquea el scroll de fondo mediante estilos
globales; la interacción y el foco se bloquean nativamente. Los anuncios efectivos
deben revisarse con los lectores de pantalla objetivo.

Validación realizada en Brave: 28/28 pruebas aprobadas en escritorio y 28/28 en
móvil de 360 × 640 con movimiento reducido, además de 6/6 del service worker.
También se verificaron Tab, Shift+Tab, Escape y Enter con teclas reales, la
restauración del formulario y el ejemplo asíncrono con fallo, reintento y Toast
posterior proporcionado por la página. No se comprobó con lectores de pantalla.
