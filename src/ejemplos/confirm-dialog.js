import { ConfirmDialog } from '../js/boundary/componentes/overlays/index.js';
import { Toast } from '../js/boundary/componentes/feedback/index.js';

const feedback = document.querySelector('#confirm-feedback');
document.querySelectorAll('[data-confirm-type]').forEach(button => {
    button.addEventListener('click', async () => {
        const confirmed = await ConfirmDialog.show({ title: 'Confirmación de ejemplo',
            message: 'Esta acción es ficticia y no modifica registros.', type: button.dataset.confirmType,
            confirmText: button.dataset.confirmType === 'danger' ? 'Eliminar (simulado)' : 'Continuar'
        });
        feedback.textContent = confirmed ? 'Resultado: true (confirmado).' : 'Resultado: false (cancelado o cerrado).';
    });
});
document.querySelector('#confirm-async').addEventListener('click', async () => {
    let attempts = 0;
    const failFirst = document.querySelector('#fail-first').checked;
    const confirmed = await ConfirmDialog.show({ title: 'Operación ficticia', type: 'danger',
        message: 'Se simulará una espera de 700 ms, sin conexión al backend.', confirmText: 'Ejecutar simulación',
        onConfirm: async () => {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 700));
            if (failFirst && attempts === 1) throw new Error('Fallo exclusivo de la demostración');
        }
    });
    feedback.textContent = `Resultado: ${confirmed}. Intentos: ${attempts}.`;
    if (confirmed) Toast.success('La operación ficticia terminó correctamente.');
});
document.querySelector('#confirm-queue').addEventListener('click', async () => {
    const results = await Promise.all([1, 2, 3].map(number => ConfirmDialog.show({
        title: `Confirmación ${number} de 3`, message: 'Solo se muestra una confirmación a la vez.'
    })));
    feedback.textContent = `Resultados en orden: ${results.join(', ')}.`;
});
window.addEventListener('pagehide', event => { if (!event.persisted) { ConfirmDialog.dismissAll(); Toast.dismissAll(); } });
