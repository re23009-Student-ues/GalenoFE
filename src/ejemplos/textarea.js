import { TextArea } from '../js/boundary/componentes/form/textarea/index.js';
import { Modal } from '../js/boundary/componentes/overlays/index.js';
import { Wizard } from '../js/boundary/componentes/navigation/wizard/index.js';

const events = document.querySelector('#textarea-events');
const feedback = document.querySelector('#textarea-feedback');
const eventMessage = (type, value) => { events.textContent = `Último evento: ${type}. Longitud: ${value.length}.`; };
const observations = new TextArea('#observations', {
    placeholder: 'Escribe contenido ficticio…', rows: 4, minRows: 3, maxRows: 6,
    maxLength: 500, minLength: 10, required: true, autoResize: true, showCounter: true,
    helperText: 'Mínimo 10 y máximo 500 caracteres. No uses información real.',
    validator: value => value.trim() ? true : 'Escribe contenido, no solo espacios.',
    onInput: value => eventMessage('input', value), onChange: value => eventMessage('change', value),
    onFocus: value => eventMessage('focus', value), onBlur: value => eventMessage('blur', value)
}).render();
const native = new TextArea('#native-textarea', { name: 'nativeNotes', label: 'Notas opcionales',
    rows: 3, autoResize: false, helperText: 'Este control conserva su redimensionado nativo.' }).render();
const hidden = new TextArea('#textarea-hidden', { label: 'Campo inicialmente oculto', autoResize: true,
    minRows: 2, maxRows: 5, showCounter: true, value: 'Línea de ejemplo.\n'.repeat(8) }).render();

document.querySelector('#textarea-fill').addEventListener('click', () => observations.setValue('Línea de ejemplo multilínea.\n'.repeat(12)));
document.querySelector('#textarea-clear').addEventListener('click', () => observations.clear());
document.querySelector('#textarea-validate').addEventListener('click', () => {
    feedback.textContent = observations.validate().valid ? 'Contenido válido.' : 'Revisa el error del campo.';
});
document.querySelector('#textarea-error').addEventListener('click', () => observations.setError('Error ficticio suministrado por la página.'));
document.querySelector('#textarea-clear-error').addEventListener('click', () => observations.clearError());
document.querySelector('#textarea-disabled').addEventListener('change', event => observations.setDisabled(event.target.checked));
document.querySelector('#textarea-readonly').addEventListener('change', event => observations.setReadOnly(event.target.checked));
document.querySelector('#textarea-example').addEventListener('submit', event => {
    event.preventDefault();
    document.querySelector('#textarea-data').textContent = JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)), null, 2);
});
document.querySelector('#textarea-example').addEventListener('reset', () => {
    document.querySelector('#textarea-disabled').checked = false;
    document.querySelector('#textarea-readonly').checked = false;
    observations.setDisabled(false).setReadOnly(false);
});
document.querySelector('#textarea-toggle').addEventListener('click', event => {
    const panel = document.querySelector('#textarea-hidden'); panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    event.currentTarget.textContent = panel.hidden ? 'Mostrar campo inicialmente oculto' : 'Ocultar campo';
});

let wizard, modalField;
const modalHost = document.createElement('div');
const modal = new Modal({ title: 'TextArea dentro de Wizard', size: 'large', onClose: () => {
    modalField?.destroy(); wizard?.destroy(); modalField = wizard = null;
} });
modal.setContent(modalHost);
document.querySelector('#textarea-modal').addEventListener('click', () => {
    if (modal.isOpen()) return;
    const introduction = document.createElement('p'); introduction.textContent = 'Avanza para mostrar un TextArea que inicialmente está oculto.';
    const form = document.createElement('form'), host = document.createElement('div'); form.append(host);
    modalField = new TextArea(host, { name: 'wizardNotes', label: 'Notas ficticias', required: true,
        minLength: 5, maxLength: 300, autoResize: true, minRows: 2, maxRows: 5, showCounter: true }).render();
    wizard = new Wizard(modalHost, { steps: [
        { id: 'start', title: 'Inicio', content: introduction },
        { id: 'notes', title: 'Notas', content: form, validate: () => modalField.validate().valid }
    ], onComplete: () => { feedback.textContent = 'Wizard de demostración completado. No se guardó información.'; } }).render();
    modal.open();
});
window.addEventListener('pagehide', event => {
    if (!event.persisted) { observations.destroy(); native.destroy(); hidden.destroy(); modal.destroy(); }
});
