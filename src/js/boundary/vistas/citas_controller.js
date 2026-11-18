import { listarCompleto, validarPaciente, buscarCitas, validarFormatoDocumento, validarRango } from '../../control/agenda_service.js';
import { ejemploDocumento } from '../../control/documento_formato.js';
import { esc } from '../util_html.js';
import '../componentes/tarjeta_cita.js';

class GalenoCitas extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        this.citas = [];
        this.contextos = null;
        this.ocupado = false;
        this.innerHTML = `<section class="agenda-panel">
            <h2>Buscar mis citas</h2>
            <form class="agenda-form" data-busqueda novalidate>
                <label>Tipo de documento
                    <select name="tipo" disabled><option value="">Cargando…</option></select>
                </label>
                <div class="citas-documento">
                    <label>Número de documento
                        <input name="numero" autocomplete="off" disabled aria-describedby="indicaciones error-documento">
                    </label>
                    <p id="indicaciones"></p>
                    <p id="error-documento" class="citas-error" aria-live="polite"></p>
                </div>
                <button type="submit" data-buscar disabled>Buscar citas</button>
            </form>
            <p role="status" aria-live="polite" data-estado></p>
            <button type="button" data-reintentar hidden>Reintentar catálogo</button>
            <section data-resultados hidden aria-label="Resultados de citas">
                <h3>Mis citas</h3>
                <form class="agenda-form" data-filtros>
                    <label class="citas-filtro-clinica">Clínica
                        <select name="clinica"><option value="">Todas las clínicas</option></select>
                    </label>
                    <div class="citas-filtro-rango">
                        <label>Desde<input name="desde" type="date"></label>
                        <label>Hasta<input name="hasta" type="date"></label>
                        <div class="citas-filtro-botones">
                            <button type="submit">Filtrar</button>
                            <button type="button" data-limpiar>Mostrar todas</button>
                        </div>
                    </div>
                </form>
                <p role="status" aria-live="polite" data-resumen></p>
            </section>
        </section>
        <section class="citas-grid" data-lista hidden aria-label="Citas encontradas"></section>`;
        this.alCambio = e => this.cambiar(e);
        this.alCambiarClinica = e => { if (e.target.name === 'clinica') this.filtrar(); };
        this.alClick = e => {
            if (e.target.closest('[data-reintentar]')) this.catalogo();
            if (e.target.closest('[data-limpiar]')) {
                this.querySelector('[data-filtros]').reset();
                this.filtrar();
            }
        };
        this.alSubmit = e => {
            e.preventDefault();
            if (e.target.matches('[data-filtros]')) this.filtrar();
            else this.buscar();
        };
        this.addEventListener('input', this.alCambio);
        this.addEventListener('change', this.alCambiarClinica);
        this.addEventListener('click', this.alClick);
        this.addEventListener('submit', this.alSubmit);
        this.catalogo();
    }
    disconnectedCallback() {
        this.version++;
        this.removeEventListener('input', this.alCambio);
        this.removeEventListener('change', this.alCambiarClinica);
        this.removeEventListener('click', this.alClick);
        this.removeEventListener('submit', this.alSubmit);
    }
    campo(nombre) { return this.querySelector(`[name="${nombre}"]`); }
    estado(texto) { this.querySelector('[data-estado]').textContent = texto; }
    vigente(version) { return this.isConnected && this.version === version; }
    tipoSeleccionado() { return this.tipos?.find(t => t.idTipoDocumento === this.campo('tipo').value); }
    cambiar(e) {
        if (['desde', 'hasta'].includes(e.target.name)) {
            this.version++;
            this.ocupado = false;
            this.citas = [];
            this.querySelector('[data-lista]').replaceChildren();
            this.querySelector('[data-lista]').hidden = true;
            this.querySelector('[data-resumen]').textContent = 'Aplica el filtro para consultar la selección';
            this.sincronizar();
            return;
        }
        if (!['tipo', 'numero'].includes(e.target.name)) return;
        this.version++;
        this.ocupado = false;
        this.limpiarResultados();
        this.estado('');
        this.campo('numero').disabled = !this.tipoSeleccionado();
        const ejemplo = ejemploDocumento(this.tipoSeleccionado());
        this.campo('numero').placeholder = ejemplo ? `Ej.: ${ejemplo}` : '';
        this.querySelector('#indicaciones').textContent = this.tipoSeleccionado()?.indicaciones || '';
        this.validarEntrada();
        this.sincronizar();
    }
    validarEntrada() {
        const campo = this.campo('numero');
        let error = '';
        try { validarFormatoDocumento(this.tipoSeleccionado(), campo.value.trim()); }
        catch (e) { error = e.message; }
        campo.setCustomValidity(error);
        const mostrarError = Boolean(campo.value && error);
        campo.setAttribute('aria-invalid', String(mostrarError));
        this.querySelector('#error-documento').textContent = mostrarError ? error : '';
    }
    sincronizar() {
        this.querySelector('[data-buscar]').disabled = this.ocupado
            || !this.tipoSeleccionado() || !this.campo('numero').value.trim()
            || !this.campo('numero').validity.valid;
    }
    limpiarResultados() {
        this.citas = [];
        this.contextos = null;
        this.campo('clinica').innerHTML = '<option value="">Todas las clínicas</option>';
        this.querySelector('[data-resultados]').hidden = true;
        this.querySelector('[data-filtros]').reset();
        this.querySelector('[data-lista]').replaceChildren();
        this.querySelector('[data-lista]').hidden = true;
        this.querySelector('[data-resumen]').textContent = '';
    }
    async catalogo() {
        const version = ++this.version;
        this.estado('Cargando tipos de documento…');
        this.querySelector('[data-reintentar]').hidden = true;
        try {
            const tipos = (await listarCompleto('tipo_documento?activo=true', 'idTipoDocumento')).filter(t => t.activo === true);
            if (!this.vigente(version)) return;
            this.tipos = tipos;
            this.campo('tipo').innerHTML = '<option value="">Selecciona un tipo</option>' + tipos.map(t => `<option value="${esc(t.idTipoDocumento)}">${esc(t.nombre)}</option>`).join('');
            this.campo('tipo').disabled = !tipos.length;
            this.estado(tipos.length ? '' : 'No hay tipos de documento activos');
        } catch (e) { if (this.vigente(version)) { this.estado(e.message || e.mensaje); this.querySelector('[data-reintentar]').hidden = false; } }
    }
    async buscar() {
        this.validarEntrada();
        this.sincronizar();
        if (this.querySelector('[data-buscar]').disabled) return;
        const version = ++this.version;
        this.limpiarResultados();
        this.ocupado = true;
        this.sincronizar();
        this.estado('Buscando citas…');
        try {
            const paciente = await validarPaciente(this.tipoSeleccionado(), this.campo('numero').value.trim());
            if (!this.vigente(version)) return;
            const citas = await buscarCitas(paciente.contextos);
            if (!this.vigente(version)) return;
            this.contextos = paciente.contextos;
            const clinicas = new Map(paciente.contextos.filter(c => c.idClinica?.idClinica)
                .map(c => [c.idClinica.idClinica, c.idClinica]));
            this.campo('clinica').innerHTML = '<option value="">Todas las clínicas</option>'
                + [...clinicas.values()].map(c => `<option value="${esc(c.idClinica)}">${esc(c.nombre || 'Clínica sin nombre')}</option>`).join('');
            this.citas = citas;
            this.querySelector('[data-resultados]').hidden = false;
            this.estado('');
            this.mostrarCitas();
        } catch (e) { if (this.vigente(version)) { this.estado(e.message || e.mensaje); this.campo('numero').focus(); } }
        finally { if (this.vigente(version)) { this.ocupado = false; this.sincronizar(); } }
    }
    async filtrar() {
        if (!this.contextos) return;
        const version = ++this.version;
        const desde = this.campo('desde').value, hasta = this.campo('hasta').value;
        const resumen = this.querySelector('[data-resumen]');
        this.citas = [];
        this.querySelector('[data-lista]').replaceChildren();
        this.querySelector('[data-lista]').hidden = true;
        this.ocupado = true;
        this.sincronizar();
        try {
            if (desde || hasta) validarRango(desde || hasta, hasta || desde);
            resumen.textContent = 'Buscando citas…';
            const clinica = this.campo('clinica').value;
            const contextos = clinica ? this.contextos.filter(c => c.idClinica?.idClinica === clinica) : this.contextos;
            const citas = await buscarCitas(contextos, desde, hasta);
            if (!this.vigente(version)) return;
            this.citas = citas;
            this.mostrarCitas();
        } catch (e) { if (this.vigente(version)) resumen.textContent = e.message || e.mensaje; }
        finally { if (this.vigente(version)) { this.ocupado = false; this.sincronizar(); } }
    }
    mostrarCitas() {
        const citas = this.citas;
        const tarjetas = citas.map(cita => {
            const tarjeta = document.createElement('galeno-tarjeta-cita');
            tarjeta.cita = cita;
            return tarjeta;
        });
        this.querySelector('[data-lista]').replaceChildren(...tarjetas);
        this.querySelector('[data-lista]').hidden = !tarjetas.length;
        this.querySelector('[data-resumen]').textContent = citas.length
            ? `${citas.length} ${citas.length === 1 ? 'cita encontrada asociada' : 'citas encontradas asociadas'} al documento`
            : this.campo('clinica').value ? 'No hay citas para los filtros seleccionados'
            : this.campo('desde').value || this.campo('hasta').value ? 'No hay citas en el rango seleccionado' : 'No se encontraron citas asociadas al documento';
    }
}
customElements.define('galeno-citas', GalenoCitas);
export default GalenoCitas;
