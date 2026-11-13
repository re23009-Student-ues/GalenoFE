import { cargarAgenda, diaAgenda, fechaAgenda } from '../../control/agenda_service.js';
import { esc } from '../util_html.js';
class Agenda extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        const hoy = diaAgenda();
        this.innerHTML = `<section class="agenda-panel"><h2>Consultas por rol</h2><p>Consulta los pasos asociados a tu rol y los registros anteriores.</p><form class="agenda-form"><label>Desde<input name="desde" type="date" value="${hoy}" required></label><label>Hasta<input name="hasta" type="date" value="${hoy}" required></label><button type="submit">Aplicar</button><button type="button" data-hoy>Hoy</button></form><p role="status" aria-live="polite"></p><div data-lista></div></section>`;
        this.alSubmit = e => { e.preventDefault(); this.cargar(); };
        this.alInput = () => { this.version++; this.querySelector('[data-lista]').replaceChildren(); this.querySelector('[role="status"]').textContent = 'Aplica el rango seleccionado'; this.querySelector('[type="submit"]').disabled = false; };
        this.alClick = e => {
            if (e.target.closest('[data-hoy]')) { this.querySelectorAll('input').forEach(i => i.value = diaAgenda()); this.cargar(); }
            const abrir = e.target.closest('[data-consulta]');
            if (abrir) this.dispatchEvent(new CustomEvent('galeno-navegar', { detail: { ruta: '/atencion/' + encodeURIComponent(abrir.dataset.consulta) }, bubbles: true, composed: true }));
        };
        this.addEventListener('submit', this.alSubmit);
        this.addEventListener('input', this.alInput);
        this.addEventListener('click', this.alClick);
        this.cargar();
    }
    disconnectedCallback() { this.version++; this.removeEventListener('submit', this.alSubmit); this.removeEventListener('input', this.alInput); this.removeEventListener('click', this.alClick); }
    registro(e) {
        // Literales observados en Consulta.xhtml; estados nuevos se conservan como texto.
        const etiquetas = { PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', COMPLETADO: 'Completado' };
        return `<details><summary>${esc(e.idProcedimientoPaso?.nombre || 'Paso sin nombre')} · ${esc(etiquetas[e.estado] || e.estado || 'Sin estado')}</summary><p>Responsable: ${esc([e.idPersonaRol?.idPersona?.nombres, e.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' ') || 'Sin responsable')} · ${esc(e.idPersonaRol?.idRol?.nombre || '')}</p><p>Inicio: ${esc(fechaAgenda(e.fechaInicio))} · Fin: ${esc(fechaAgenda(e.fechaFin))}</p><pre>${esc(e.valor || 'Sin registro')}</pre></details>`;
    }
    async cargar() {
        const version = ++this.version;
        const boton = this.querySelector('[type="submit"]');
        boton.disabled = true;
        const estado = this.querySelector('[role="status"]');
        estado.textContent = 'Cargando agenda…';
        this.querySelector('[data-lista]').replaceChildren();
        try {
            const consultas = await cargarAgenda(this.usuario, this.querySelector('[name="desde"]').value, this.querySelector('[name="hasta"]').value);
            if (!this.isConnected || version !== this.version) return;
            estado.textContent = consultas.length ? `${consultas.length} ${consultas.length === 1 ? 'consulta con pasos' : 'consultas con pasos'} de tu rol` : 'No hay consultas con pasos de tu rol en este rango';
            this.querySelector('[data-lista]').innerHTML = consultas.map(c => `<article><h3>${esc([c.idPersonaRol?.idPersona?.nombres, c.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' ') || 'Paciente sin nombre')}</h3><p>Inicio: ${esc(fechaAgenda(c.fechaInicio))}</p>${c.procedimientos.map(p => `<section><h4>${esc(p.idProcedimiento.nombre || 'Procedimiento sin nombre')}</h4><h4>Pasos de tu rol</h4><ul>${p.pasosDelRol.map(d => `<li>${esc(d.nombre || 'Paso sin nombre')}${d.registros.length ? d.registros.map(e => this.registro(e)).join('') : '<p>Sin registro de ejecución</p>'}</li>`).join('')}</ul><h4>Registros de pasos anteriores</h4>${p.pasosPrevios.length ? p.pasosPrevios.map(e => this.registro(e)).join('') : '<p>Sin registros de pasos anteriores</p>'}<details><summary>Dependencias del procedimiento</summary><ul>${p.secuencias.map(s => `<li>${esc(s.idProcedimientoPaso?.nombre || s.idProcedimientoPaso?.idProcedimientoPaso)} → ${esc(s.idProcedimientoPasoReferencia?.nombre || s.idProcedimientoPasoReferencia?.idProcedimientoPaso)} · ${esc(s.tipoSecuencia || 'Sin tipo')}</li>`).join('') || '<li>Sin secuencias registradas</li>'}</ul></details></section>`).join('')}<button type="button" data-consulta="${esc(c.idConsulta)}">Abrir consulta</button></article>`).join('');
        } catch (e) { if (this.isConnected && version === this.version) estado.textContent = e.message || e.mensaje; }
        finally { if (this.isConnected && version === this.version) boton.disabled = false; }
    }
}
customElements.define('galeno-agenda', Agenda);
