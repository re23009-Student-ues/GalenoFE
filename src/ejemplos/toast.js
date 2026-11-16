import { Toast } from '../js/boundary/componentes/feedback/index.js';

Toast.configure({ maxVisible: 3 });
const feedback = document.querySelector('#toast-feedback');
let lastId = null;
const messages = {
    success: 'Operación ficticia completada correctamente.',
    error: 'No se pudo completar la operación de ejemplo.',
    warning: 'Este es un aviso de prueba que requiere atención.',
    info: 'Información de ejemplo, sin solicitudes al servidor.'
};
function remember(id) {
    if (id) lastId = id;
    feedback.textContent = id ? `Notificación creada: ${id}.` : 'Revisa la configuración y escribe un mensaje no vacío.';
}
document.querySelectorAll('[data-type]').forEach(button => {
    button.addEventListener('click', () => remember(Toast[button.dataset.type](messages[button.dataset.type])));
});
document.querySelector('#toast-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    remember(Toast.show({
        type: form.get('type'), title: form.get('title'), message: form.get('message'),
        duration: Number(form.get('duration')), position: form.get('position'),
        closable: form.has('closable'), pauseOnHover: form.has('pauseOnHover'),
        showProgress: form.has('showProgress'), animated: form.has('animated')
    }));
});
document.querySelector('#toast-queue').addEventListener('click', () => {
    Toast.dismissAll();
    for (let i = 1; i <= 6; i++) {
        lastId = Toast.info(`Notificación ${i} de 6`, { title: 'Cola FIFO', duration: 2000 });
    }
    feedback.textContent = 'Tres notificaciones visibles y tres pendientes. Aparecerán en orden al liberarse espacio.';
});
document.querySelector('#toast-persistent').addEventListener('click', () => {
    remember(Toast.info('Proceso ficticio de duración indefinida.', { duration: 0, closable: false }));
});
document.querySelector('#toast-dismiss').addEventListener('click', () => {
    feedback.textContent = Toast.dismiss(lastId) ? 'Última notificación cerrada o retirada de la cola.' : 'La última notificación ya no está disponible.';
});
document.querySelector('#toast-dismiss-all').addEventListener('click', () => {
    Toast.dismissAll(); lastId = null; feedback.textContent = 'Todas las notificaciones y pendientes se cerraron.';
});
window.addEventListener('pagehide', event => { if (!event.persisted) Toast.dismissAll(); });
