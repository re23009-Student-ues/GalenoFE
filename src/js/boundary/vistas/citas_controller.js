import { listarCompleto, validarPaciente, buscarCitas, diaAgenda } from '../../control/agenda_service.js';
import { esc } from '../util_html.js';
import '../componentes/tarjeta_cita.js';

class GalenoCitas extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        this.contextos = [];
        const hoy = diaAgenda();
        this.innerHTML = `<section class="agenda-panel"><h2>Buscar mis citas</h2><p>1. Tipo → 2. Documento → 3. Clínica → 4. Fechas</p>
        <form novalidate class="agenda-form"><label>Tipo de documento<select name="tipo" disabled><option value="">Cargando…</option></select></label>
        <label>Número de documento<input name="numero" autocomplete="off" disabled aria-describedby="indicaciones"></label>
        <p id="indicaciones"></p><button type="button" data-validar disabled>Validar documento</button>
        <label>Clínica<select name="clinica" disabled><option value="">Valida tu documento</option></select></label>
        <label>Desde<input name="desde" type="date" value="${hoy}" disabled></label><label>Hasta<input name="hasta" type="date" value="${hoy}" disabled></label>
        <button type="submit" disabled>Buscar citas</button></form><p role="status" aria-live="polite" data-estado></p>
        <button type="button" data-reintentar hidden>Reintentar catálogo</button><section data-resultados aria-label="Resultados de citas"></section></section>`;
        this.alCambio = e => this.cambiar(e);
        this.alClick = e => { if (e.target.closest('[data-validar]')) this.validar(); if (e.target.closest('[data-reintentar]')) this.catalogo(); };
        this.alSubmit = e => { e.preventDefault(); this.buscar(); };
        this.addEventListener('input', this.alCambio);
        this.addEventListener('click', this.alClick);
        this.querySelector('form').addEventListener('submit', this.alSubmit);
        this.catalogo();
    }
    disconnectedCallback() {
        this.version++;
        this.removeEventListener('input', this.alCambio);
        this.removeEventListener('click', this.alClick);
        this.querySelector('form')?.removeEventListener('submit', this.alSubmit);
    }
    campo(nombre) { return this.querySelector(`[name="${nombre}"]`); }
    estado(texto) { this.querySelector('[data-estado]').textContent = texto; }
    vigente(version) { return this.isConnected && this.version === version; }
    cambiar(e) {
        const nombre = e.target.name;
        if (!['tipo','numero','clinica','desde','hasta'].includes(nombre)) return;
        this.version++;
        this.querySelector('[data-resultados]').replaceChildren();
        this.estado('');
        if (nombre === 'tipo' || nombre === 'numero') {
            this.contextos = [];
            this.campo('clinica').innerHTML = '<option value="">Valida tu documento</option>';
            this.campo('clinica').disabled = true;
            this.campo('numero').disabled = !this.campo('tipo').value;
            const tipo = this.tipos?.find(t => t.idTipoDocumento === this.campo('tipo').value);
            this.querySelector('#indicaciones').textContent = tipo?.indicaciones || '';
            this.querySelector('[data-validar]').disabled = !tipo || !this.campo('numero').value;
        }
        this.sincronizar();
    }
    sincronizar() {
        const lista = this.contextos.length && this.campo('clinica').value;
        this.campo('desde').disabled = !lista;
        this.campo('hasta').disabled = !lista;
        this.querySelector('[type="submit"]').disabled = !lista;
    }
    async catalogo() {
        const version = ++this.version;
        this.estado('Cargando tipos de documento…');
        this.querySelector('[data-reintentar]').hidden = true;
        try {
            const tipos = (await listarCompleto('tipo_documento', 'idTipoDocumento')).filter(t => t.activo === true);
            if (!this.vigente(version)) return;
            this.tipos = tipos;
            this.campo('tipo').innerHTML = '<option value="">Selecciona un tipo</option>' + tipos.map(t => `<option value="${esc(t.idTipoDocumento)}">${esc(t.nombre)}</option>`).join('');
            this.campo('tipo').disabled = !tipos.length;
            this.estado(tipos.length ? '' : 'No hay tipos de documento activos');
        } catch (e) { if (this.vigente(version)) { this.estado(e.message || e.mensaje); this.querySelector('[data-reintentar]').hidden = false; } }
    }
    async validar() {
        if (this.querySelector('[data-validar]').disabled) return;
        const version = ++this.version;
        this.contextos = [];
        this.campo('clinica').disabled = true;
        this.sincronizar();
        this.querySelector('[data-resultados]').replaceChildren();
        this.querySelector('[data-validar]').disabled = true;
        this.estado('Validando documento…');
        try {
            const tipo = this.tipos.find(t => t.idTipoDocumento === this.campo('tipo').value);
            const resultado = await validarPaciente(tipo, this.campo('numero').value.trim());
            if (!this.vigente(version)) return;
            this.contextos = resultado.contextos;
            const clinicas = [...new Map(this.contextos.filter(c => c.idClinica?.idClinica).map(c => [c.idClinica.idClinica, c.idClinica])).values()];
            this.campo('clinica').innerHTML = '<option value="">Selecciona una clínica</option>' + clinicas.map(c => `<option value="${esc(c.idClinica)}">${esc(c.nombre)}</option>`).join('');
            this.campo('clinica').disabled = !clinicas.length;
            this.estado(clinicas.length ? 'Documento validado. Selecciona tu clínica.' : 'No hay clínicas disponibles para esta inscripción');
            this.campo('clinica').focus();
        } catch (e) { if (this.vigente(version)) { this.estado(e.message || e.mensaje); this.campo('numero').focus(); } }
        finally { if (this.vigente(version)) this.querySelector('[data-validar]').disabled = false; }
    }
    async buscar() {
        if (this.querySelector('[type="submit"]').disabled) return;
        const version = ++this.version;
        this.querySelector('[type="submit"]').disabled = true;
        this.querySelector('[data-resultados]').replaceChildren();
        this.estado('Buscando citas…');
        try {
            const citas = await buscarCitas(this.contextos, this.campo('clinica').value, this.campo('desde').value, this.campo('hasta').value);
            if (!this.vigente(version)) return;
            this.estado(citas.length ? `${citas.length} ${citas.length === 1 ? 'cita encontrada' : 'citas encontradas'}` : 'No hay citas en el rango seleccionado');
            for (const cita of citas) {
                const tarjeta = document.createElement('galeno-tarjeta-cita');
                tarjeta.cita = cita;
                this.querySelector('[data-resultados]').append(tarjeta);
            }
        } catch (e) { if (this.vigente(version)) this.estado(e.message || e.mensaje); }
        finally { if (this.vigente(version)) this.sincronizar(); }
    }
}
customElements.define('galeno-citas', GalenoCitas);
export default GalenoCitas;
