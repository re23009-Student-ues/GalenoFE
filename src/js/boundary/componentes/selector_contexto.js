import { rolesDePersona } from '../../control/sesion_service.js';
import { esPaciente } from '../../control/roles.js';
function campo(nombre, texto) {
    const etiqueta = document.createElement('label');
    etiqueta.textContent = texto;
    const select = document.createElement('select');
    select.name = nombre;
    select.disabled = true;
    etiqueta.append(select);
    return etiqueta;
}

function opcion(valor, texto) {
    const elemento = document.createElement('option');
    elemento.value = String(valor ?? '');
    elemento.textContent = String(texto ?? '');
    return elemento;
}

class SelectorContexto extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        const panel = document.createElement('section');
        panel.className = 'agenda-panel';
        const titulo = document.createElement('h2');
        titulo.textContent = 'Contexto laboral';
        const formulario = document.createElement('div');
        formulario.className = 'agenda-form';
        formulario.append(campo('clinica', 'Clínica'), campo('rol', 'Rol en esta clínica'));
        const aviso = document.createElement('p');
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        aviso.textContent = 'Cargando inscripciones…';
        const reintentar = document.createElement('button');
        reintentar.type = 'button';
        reintentar.hidden = true;
        reintentar.textContent = 'Reintentar';
        panel.append(titulo, formulario, aviso, reintentar);
        this.replaceChildren(panel);

        this.alCambio = e => {
            if (e.target.name === 'clinica') this.roles();
            if (!['clinica', 'rol'].includes(e.target.name)) return;
            const personaRol = this.contextos.find(c => c.idPersonaRol === this.querySelector('[name="rol"]').value);
            if (personaRol && personaRol.idPersonaRol !== this.usuario.idPersonaRol) this.dispatchEvent(new CustomEvent('galeno-contexto-seleccionado', { detail: { personaRol }, bubbles: true, composed: true }));
        };
        this.alReintentar = () => this.cargar();
        this.addEventListener('change', this.alCambio);
        reintentar.addEventListener('click', this.alReintentar);
        this.cargar();
    }
    disconnectedCallback() { this.version++; this.removeEventListener('change', this.alCambio); this.querySelector('button')?.removeEventListener('click', this.alReintentar); }
    async cargar() {
        const version = ++this.version;
        this.querySelector('button').hidden = true;
        try {
            const contextos = (await rolesDePersona(this.usuario.idPersona.idPersona)).filter(c => !esPaciente(c) && c.idPersona?.idPersona === this.usuario.idPersona.idPersona && c.idClinica?.idClinica && c.idRol?.idRol);
            if (!this.isConnected || version !== this.version) return;
            this.contextos = contextos;
            const clinicas = [...new Map(contextos.map(c => [c.idClinica.idClinica, c.idClinica])).values()];
            const select = this.querySelector('[name="clinica"]');
            select.replaceChildren(...clinicas.map(c => opcion(c.idClinica, c.nombre)));
            select.value = this.usuario.idClinica.idClinica;
            select.disabled = !clinicas.length;
            this.roles();
            this.querySelector('[role="status"]').textContent = contextos.length ? '' : 'No hay contextos laborales disponibles';
        } catch (e) { if (this.isConnected && version === this.version) { this.querySelector('[role="status"]').textContent = e.message || e.mensaje; this.querySelector('button').hidden = false; } }
    }
    roles() {
        const opciones = this.contextos.filter(c => c.idClinica.idClinica === this.querySelector('[name="clinica"]').value);
        const select = this.querySelector('[name="rol"]');
        select.replaceChildren(...opciones.map(c => opcion(c.idPersonaRol, c.idRol.nombre)));
        if (opciones.some(c => c.idPersonaRol === this.usuario.idPersonaRol)) select.value = this.usuario.idPersonaRol;
        select.disabled = !opciones.length;
    }
}
customElements.define('galeno-selector-contexto', SelectorContexto);
