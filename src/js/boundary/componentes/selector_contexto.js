import { rolesDePersona } from '../../control/sesion_service.js';
import { esPaciente } from '../../control/roles.js';
import { esc } from '../util_html.js';
class SelectorContexto extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        this.innerHTML = `<section class="agenda-panel"><h2>Contexto laboral</h2><div class="agenda-form"><label>Clínica<select name="clinica" disabled></select></label><label>Rol en esta clínica<select name="rol" disabled></select></label></div><p role="status" aria-live="polite">Cargando inscripciones…</p><button type="button" hidden>Reintentar</button></section>`;
        this.alCambio = e => {
            if (e.target.name === 'clinica') this.roles();
            if (!['clinica', 'rol'].includes(e.target.name)) return;
            const personaRol = this.contextos.find(c => c.idPersonaRol === this.querySelector('[name="rol"]').value);
            if (personaRol && personaRol.idPersonaRol !== this.usuario.idPersonaRol) this.dispatchEvent(new CustomEvent('galeno-contexto-seleccionado', { detail: { personaRol }, bubbles: true, composed: true }));
        };
        this.alReintentar = () => this.cargar();
        this.addEventListener('change', this.alCambio);
        this.querySelector('button').addEventListener('click', this.alReintentar);
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
            this.querySelector('[name="clinica"]').innerHTML = clinicas.map(c => `<option value="${esc(c.idClinica)}">${esc(c.nombre)}</option>`).join('');
            this.querySelector('[name="clinica"]').value = this.usuario.idClinica.idClinica;
            this.querySelector('[name="clinica"]').disabled = !clinicas.length;
            this.roles();
            this.querySelector('[role="status"]').textContent = contextos.length ? '' : 'No hay contextos laborales disponibles';
        } catch (e) { if (this.isConnected && version === this.version) { this.querySelector('[role="status"]').textContent = e.message || e.mensaje; this.querySelector('button').hidden = false; } }
    }
    roles() {
        const opciones = this.contextos.filter(c => c.idClinica.idClinica === this.querySelector('[name="clinica"]').value);
        const select = this.querySelector('[name="rol"]');
        select.innerHTML = opciones.map(c => `<option value="${esc(c.idPersonaRol)}">${esc(c.idRol.nombre)}</option>`).join('');
        if (opciones.some(c => c.idPersonaRol === this.usuario.idPersonaRol)) select.value = this.usuario.idPersonaRol;
        select.disabled = !opciones.length;
    }
}
customElements.define('galeno-selector-contexto', SelectorContexto);
