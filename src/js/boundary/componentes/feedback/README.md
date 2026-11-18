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

const id = Toast.info('Revisando cambios…');
Toast.dismiss(id);
```

## API

- `success`, `error`, `warning` e `info` reciben un mensaje y devuelven el ID
  del aviso. Un mensaje vacío o inválido devuelve `null`.
- `dismiss(id)` inicia el cierre o cancela un aviso pendiente. `dismissAll()`
  vacía la cola y limpia los temporizadores.
- `info(mensaje, { duration, action })` permite indicar la duración en milisegundos
  y una acción opcional con `label` y `run`. El botón cierra el aviso y ejecuta `run`.

Se muestran hasta cinco avisos arriba a la derecha, con botón de cierre y
progreso. Por defecto cada aviso cuenta cuatro segundos desde que se muestra. La cola es FIFO
y un aviso que está cerrándose conserva su lugar hasta completar la transición.

El foco dentro de la notificación siempre pausa el temporizador para facilitar el
cierre con teclado. Hover y foco son motivos independientes: se reanuda cuando
ambos terminan. No se mueve el foco al mostrar una notificación. El mensaje se anuncia una sola vez; el progreso es decorativo.

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
vertical.
La lectura efectiva depende del navegador y lector de pantalla y debe verificarse
manualmente con las tecnologías de asistencia objetivo.
