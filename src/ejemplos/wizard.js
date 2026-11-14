import { Wizard } from '../js/boundary/componentes/navigation/wizard/index.js';
import { Modal } from '../js/boundary/componentes/overlays/index.js';
import { Toast } from '../js/boundary/componentes/feedback/index.js';

const feedback = document.querySelector('#wizard-demo-feedback');
const rejectContact = document.querySelector('#reject-contact');
const failCompletion = document.querySelector('#fail-completion');

function demo(host, modal = null) {
    const controller = new AbortController();
    function delay(ms) {
        return new Promise((resolve, reject) => {
            const cancel = () => { clearTimeout(timer); reject(new DOMException('Simulación cancelada', 'AbortError')); };
            const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve(); }, ms);
            controller.signal.addEventListener('abort', cancel, { once: true });
            if (controller.signal.aborted) cancel();
        });
    }
    function field(title, name, type = 'text') {
        const form = document.createElement('form');
        const label = document.createElement('label'); label.className = 'wizard-demo__field'; label.textContent = title;
        const input = document.createElement('input'); input.name = name; input.type = type; input.required = true;
        label.append(input); form.append(label); return { form, input };
    }
    const personal = field('Nombre ficticio', 'name');
    const contact = field('Correo ficticio', 'email', 'email');
    const review = document.createElement('p'); review.className = 'wizard-demo__review';
    let attempts = 0;
    const wizard = new Wizard(host, {
        linear: !modal,
        steps: [
            { id: 'personal', title: 'Datos personales', description: 'Formulario requerido', content: personal.form,
                validate: () => ({ valid: personal.form.checkValidity(), message: 'Escribe un nombre ficticio para continuar.' }) },
            { id: 'contact', title: 'Contacto', description: 'Validación asíncrona de ejemplo', content: contact.form,
                validate: async () => {
                    if (!contact.form.checkValidity()) return { valid: false, message: 'Escribe un correo con formato válido.' };
                    await delay(500);
                    return { valid: !rejectContact.checked, message: 'Validación rechazada en la simulación. Desmarca la opción para reintentar.' };
                } },
            { id: 'review', title: 'Confirmación', description: 'Revisión final', content: review }
        ],
        onStepChange: current => {
            if (current.id === 'review') {
                const data = wizard.getData();
                review.textContent = `Nombre ficticio: ${data.personal?.name || 'Sin dato'}\nCorreo ficticio: ${data.contact?.email || 'Sin dato'}\nNo se enviará información a un servidor.`;
            }
        },
        onComplete: async () => {
            modal?.setBusy(true);
            try {
                attempts++; await delay(600);
                if (failCompletion.checked && attempts === 1) throw new Error('Fallo simulado');
                Toast.success('Proceso ficticio completado. No se guardaron registros.');
            } finally { modal?.setBusy(false); }
        }
    }).render();
    const sync = () => wizard.setData({ personal: { name: personal.input.value }, contact: { email: contact.input.value } });
    personal.form.addEventListener('input', sync); contact.form.addEventListener('input', sync);
    sync();
    return { wizard, reset() { if (wizard.reset()) { attempts = 0; sync(); return true; } return false; },
        destroy() {
            controller.abort(); personal.form.removeEventListener('input', sync); contact.form.removeEventListener('input', sync); wizard.destroy();
        } };
}

const main = demo(document.querySelector('#patientWizard'));
const carousel = new Wizard('#carouselWizard', {
    linear: false,
    steps: Array.from({ length: 10 }, (_, index) => {
        const content = document.createElement('p');
        content.textContent = `Contenido del paso ${index + 1}. El desplazamiento del indicador conserva este panel.`;
        return { id: `carousel-${index}`, title: index === 6 ? 'Historial y antecedentes personales' : `Paso ${index + 1}`, content };
    })
}).render();
document.querySelector('#reset-wizard').addEventListener('click', () => {
    feedback.textContent = main.reset() ? 'Proceso reiniciado; los valores de los controles se conservan.' : 'Espera a que termine el procesamiento.';
});
document.querySelector('#show-wizard-data').addEventListener('click', () => {
    document.querySelector('#wizard-demo-data').textContent = JSON.stringify(main.wizard.getData(), null, 2);
});
const modalHost = document.createElement('div');
let modalDemo;
const modal = new Modal({ title: 'Wizard en Modal', size: 'large', onClose: () => { modalDemo?.destroy(); modalDemo = null; } });
modal.setContent(modalHost);
document.querySelector('#open-wizard-modal').addEventListener('click', () => {
    modalDemo = demo(modalHost, modal); modal.open();
});
window.addEventListener('pagehide', event => {
    if (!event.persisted) { main.destroy(); carousel.destroy(); modal.destroy(); Toast.dismissAll(); }
});
