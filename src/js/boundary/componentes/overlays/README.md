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
- `setContent(text | Node)` admite elementos, texto y DocumentFragment. El texto se muestra literalmente. Devuelve la instancia.
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
const dialogo = new ConfirmDialog({
    title: 'Cerrar sesión',
    message: '¿Deseas volver al acceso público?',
    type: 'warning',
    confirmText: 'Cerrar sesión',
    cancelText: 'Permanecer',
    onConfirm: () => cerrarSesion()
});
try {
    dialogo.open();
    if (await dialogo.result) mostrarAccesoPublico();
} finally {
    dialogo.destroy();
}
```

`type` admite `default` y `warning`. El diálogo enfoca Cancelar al abrir. X,
Escape, el fondo o Cancelar resuelven `result` en falso. El callback opcional
`onConfirm` puede devolver una promesa. Mientras se resuelve, el diálogo bloquea
el cierre y nuevas confirmaciones, y muestra `processingText`. Si rechaza,
muestra `errorMessage` y permite reintentar o cancelar. Destruir una instancia
pendiente resuelve su resultado en falso e ignora confirmaciones tardías.

Pruebas en `test/overlays_test.html`.
