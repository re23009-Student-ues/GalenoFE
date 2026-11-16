import { Modal } from '../js/boundary/componentes/overlays/index.js';

const form = document.querySelector('#example-form');
const feedback = document.querySelector('#modal-feedback');
let information, formModal, nested;
document.querySelector('#open-info').addEventListener('click', () => {
    information?.destroy();
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.textContent = 'Información ficticia de una consulta. Prueba Tab, Shift+Tab, Escape y clic sobre el fondo.';
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Abrir segundo diálogo';
    button.addEventListener('click', () => {
        nested?.destroy();
        nested = new Modal({ title: 'Segundo diálogo', size: 'small' });
        nested.setContent('Escape solo cierra el diálogo superior.'); nested.open();
    });
    content.append(message, button);
    if (document.querySelector('#modal-long').checked) for (let i = 1; i <= 30; i++) {
        const p = document.createElement('p'); p.textContent = `Sección ficticia ${i}: contenido para probar el desplazamiento interno.`; content.append(p);
    }
    information = new Modal({ title: 'Detalles de ejemplo', size: document.querySelector('#modal-size').value,
        actions: [{ label: 'Cerrar', onClick: modal => modal.close() }],
        onClose: () => { feedback.textContent = 'Modal informativo cerrado.'; }
    });
    information.setContent(content).open();
});
document.querySelector('#open-form').addEventListener('click', () => {
    if (!formModal || formModal.destroyed) {
        formModal = new Modal({ title: 'Revisar formulario ficticio', initialFocus: 'input', actions: [
            { label: 'Cerrar', onClick: modal => modal.close() },
            { label: 'Revisar formulario', variant: 'primary', onClick: () => form.requestSubmit() }
        ] });
        formModal.setContent(form);
    }
    formModal.open();
});
form.addEventListener('submit', event => {
    event.preventDefault();
    document.querySelector('#form-feedback').textContent = 'Formulario validado localmente. No se guardó ni envió información.';
});
document.querySelector('#restore-form').addEventListener('click', () => {
    formModal?.destroy(); feedback.textContent = 'Formulario restaurado con sus valores y listeners.';
});
window.addEventListener('pagehide', event => {
    if (!event.persisted) { nested?.destroy(); information?.destroy(); formModal?.destroy(); }
});
