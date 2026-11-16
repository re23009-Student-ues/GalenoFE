# Toast

Servicio único compartido por ES Modules. A diferencia de un gráfico asociado a un
contenedor, las notificaciones necesitan una cola y un límite comunes a todas las
pantallas. No requiere inicialización ni realiza solicitudes HTTP.

Los estilos se cargan desde `src/Recursos/estilos/toast.css`, ya incluido en
`src/index.html`. El service worker precarga ambos módulos y el CSS para uso offline.
En otra página HTML, incluir ese CSS explícitamente.

```js
// Desde src/js/boundary/vistas/:
import { Toast } from '../componentes/feedback/index.js';

Toast.success('Los datos se guardaron correctamente.');
Toast.error('No fue posible completar la operación.');
Toast.warning('Existen campos pendientes de completar.');
Toast.info('Los datos se están actualizando.');

Toast.configure({ duration: 4000, maxVisible: 5, position: 'top-right' });
const id = Toast.show({
    type: 'success', title: 'Paciente registrado',
    message: 'El paciente se registró correctamente.', duration: 5000,
    position: 'top-right', closable: true, showProgress: true
});
Toast.dismiss(id);

const pending = Toast.info('Operación en proceso…', { duration: 0, closable: false });
Toast.dismiss(pending);
Toast.dismissAll();
```

## API y configuración

- `show(options)` y `success/error/warning/info(message, options)` devuelven un ID
  único o `null` si la configuración, el mensaje o el momento de invocación no son
  válidos (se requiere `document.body`). Los atajos fijan el tipo y el mensaje.
- `dismiss(id)` devuelve `true` al iniciar el cierre o cancelar un pendiente;
  `false` para IDs inexistentes o ya cerrándose.
- `dismissAll()` limpia inmediatamente visibles, pendientes, animaciones de salida
  y temporizadores. Conserva los contenedores vacíos para reutilizarlos.
- `configure(options)` devuelve `true` si aplica la configuración, `false` si la
  rechaza. La validación es atómica y no lanza excepciones por opciones inválidas.
  También se rechazan propiedades desconocidas.

| Opción | Predeterminado | Valores |
| --- | --- | --- |
| `message` | Obligatorio en show | Texto no vacío; solo individual |
| `type` | `info` | `success`, `error`, `warning`, `info` |
| `title` | `''` | Texto opcional |
| `duration` | `4000` | Número finito de 0 a 2147483647 ms; 0 = persistente |
| `position` | `top-right` | `top-right`, `top-left`, `top-center`, `bottom-right`, `bottom-left`, `bottom-center` |
| `maxVisible` | `5` | Entero positivo; solo configuración global |
| `closable` | `true` | Booleano |
| `pauseOnHover` | `true` | Booleano |
| `showProgress` | `true` | Booleano; sin barra cuando duration = 0 |
| `animated` | `true` | Booleano; respeta movimiento reducido |

Las opciones individuales prevalecen sobre las globales. Cada notificación guarda
su configuración al crearse, incluidas las pendientes. `maxVisible` gobierna la
capacidad global: aumentarlo activa pendientes inmediatamente; reducirlo conserva
las visibles hasta su cierre. La cola es FIFO entre todas las posiciones, y los
temporizadores empiezan al montar cada notificación. Las que están saliendo siguen
ocupando espacio hasta finalizar su transición. Cada pila muestra las más antiguas
arriba; las inferiores se anclan al borde inferior sin invertir el orden.

El foco dentro de la notificación siempre pausa el temporizador para facilitar el
cierre con teclado. Hover y foco son motivos independientes: se reanuda cuando
ambos terminan. No se mueve el foco al mostrar una notificación. El mensaje y título
se anuncian juntos una sola vez; el progreso es decorativo.

Personalización mediante reglas `.toast-container` cargadas después del CSS:
`--toast-success`, `--toast-error`, `--toast-warning`, `--toast-info`,
`--toast-background`, `--toast-text`, `--toast-border`, `--toast-radius`,
`--toast-shadow`, `--toast-gap`, `--toast-margin`, `--toast-width`,
`--toast-padding` y `--toast-z-index`.

## Operación REST desde una página

Ejemplo ilustrativo: adaptar la URL desde el servicio existente. Toast no conoce
los endpoints ni el estado de las solicitudes. Usar mensajes públicos controlados,
sin mostrar trazas ni respuestas técnicas del servidor.

```js
async function savePatient(patient) {
    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patient)
        });
        if (!response.ok) {
            Toast.error('No fue posible guardar el paciente.');
            return false;
        }
        Toast.success('Paciente registrado correctamente.');
        return true;
    } catch {
        Toast.error('No fue posible conectar. Intenta nuevamente.');
        return false;
    }
}
```

## Pruebas y límites

Abrir `/test/toast_test.html` desde un servidor HTTP local. Usa Mocha, Chai y
Sinon locales, con reloj simulado. Repetir con viewport móvil y movimiento reducido.
La prueba existente del service worker se ejecuta con
`node --test test/serviceWorker_test.mjs`.

Verificación realizada en Brave (Chromium): 20/20 pruebas aprobadas en escritorio
y 20/20 en viewport móvil de 360 × 640 con movimiento reducido. También se
comprobaron con temporizadores reales el progreso, la pausa, la salida animada,
la activación de pendientes y la eliminación de nodos. Las seis pruebas existentes
del service worker aprobaron.

No se incluye límite de longitud de texto ni expiración de la cola: quien llama
debe evitar ráfagas ilimitadas. Una pila con mucho contenido permite desplazamiento
vertical. Las posiciones se gestionan independientemente; en pantallas estrechas,
conviene usar una misma posición para evitar que pilas distintas coincidan. Las
notificaciones persistentes requieren cierre explícito y pueden bloquear la cola.
La lectura efectiva depende del navegador y lector de pantalla y debe verificarse
manualmente con las tecnologías de asistencia objetivo.
