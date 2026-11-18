import { listarCompleto, validarPaciente, buscarCitas, validarFormatoDocumento, validarRango } from '../../control/agenda_service.js';
import { ejemploDocumento } from '../../control/documento_formato.js';
import { Toast } from '../componentes/feedback/index.js';
import '../componentes/tarjeta_cita.js';

const DEMORA_AVISO_INSTALACION = 3000;

function texto(tag, contenido) {
    const nodo = document.createElement(tag);
    nodo.textContent = contenido;
    return nodo;
}

function etiquetar(nombre, control) {
    const etiqueta = texto('label', nombre);
    etiqueta.append(control);
    return etiqueta;
}

function fecha(nombre, etiqueta) {
    const campo = document.createElement('input');
    campo.name = nombre;
    campo.type = 'date';
    return etiquetar(etiqueta, campo);
}

function opcion(valor, nombre) {
    const nodo = texto('option', String(nombre ?? ''));
    nodo.value = String(valor ?? '');
    return nodo;
}

function aviso() {
    const nodo = document.createElement('p');
    nodo.setAttribute('role', 'status');
    nodo.setAttribute('aria-live', 'polite');
    return nodo;
}

class GalenoCitas extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        this.citas = [];
        this.contextos = null;
        this.ocupado = false;
        this.montarFormulario();
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
        this.addEventListener('galeno-consulta-descargada', this.programarAvisoInstalacion);
        this.catalogo();
    }
    montarFormulario() {
        const panel = document.createElement('section');
        panel.className = 'agenda-panel';

        const busqueda = document.createElement('form');
        busqueda.className = 'agenda-form';
        busqueda.dataset.busqueda = '';
        busqueda.noValidate = true;
        const tipo = document.createElement('select');
        tipo.name = 'tipo';
        tipo.disabled = true;
        tipo.append(opcion('', 'Cargando…'));

        const documento = document.createElement('div');
        documento.className = 'citas-documento';
        const numero = document.createElement('input');
        numero.name = 'numero';
        numero.autocomplete = 'off';
        numero.disabled = true;
        numero.setAttribute('aria-describedby', 'indicaciones error-documento');
        const indicaciones = document.createElement('p');
        indicaciones.id = 'indicaciones';
        const error = document.createElement('p');
        error.id = 'error-documento';
        error.className = 'citas-error';
        error.setAttribute('aria-live', 'polite');
        documento.append(etiquetar('Número de documento', numero), indicaciones, error);

        const buscar = texto('button', 'Buscar citas');
        buscar.type = 'submit';
        buscar.dataset.buscar = '';
        buscar.disabled = true;
        busqueda.append(etiquetar('Tipo de documento', tipo), documento, buscar);

        const estado = aviso();
        estado.dataset.estado = '';
        const reintentar = texto('button', 'Reintentar catálogo');
        reintentar.type = 'button';
        reintentar.dataset.reintentar = '';
        reintentar.hidden = true;
        panel.append(texto('h2', 'Buscar mis citas'), busqueda, estado, reintentar, this.montarFiltros());

        const lista = document.createElement('section');
        lista.className = 'citas-grid';
        lista.dataset.lista = '';
        lista.hidden = true;
        lista.setAttribute('aria-label', 'Citas encontradas');
        this.replaceChildren(panel, lista);
    }

    montarFiltros() {
        const resultados = document.createElement('section');
        resultados.dataset.resultados = '';
        resultados.hidden = true;
        resultados.setAttribute('aria-label', 'Resultados de citas');
        const filtros = document.createElement('form');
        filtros.className = 'agenda-form';
        filtros.dataset.filtros = '';
        const clinica = document.createElement('select');
        clinica.name = 'clinica';
        clinica.append(opcion('', 'Todas las clínicas'));
        const etiquetaClinica = etiquetar('Clínica', clinica);
        etiquetaClinica.className = 'citas-filtro-clinica';

        const rango = document.createElement('div');
        rango.className = 'citas-filtro-rango';
        const botones = document.createElement('div');
        botones.className = 'citas-filtro-botones';
        const filtrar = texto('button', 'Filtrar');
        filtrar.type = 'submit';
        const limpiar = texto('button', 'Mostrar todas');
        limpiar.type = 'button';
        limpiar.dataset.limpiar = '';
        botones.append(filtrar, limpiar);
        rango.append(fecha('desde', 'Desde'), fecha('hasta', 'Hasta'), botones);
        filtros.append(etiquetaClinica, rango);

        const resumen = aviso();
        resumen.dataset.resumen = '';
        resultados.append(texto('h3', 'Mis citas'), filtros, resumen);
        return resultados;
    }

    disconnectedCallback() {
        this.version++;
        clearTimeout(this.temporizadorInstalacion);
        this.temporizadorInstalacion = null;
        if (this.avisoInstalacion) Toast.dismiss(this.avisoInstalacion);
        this.avisoInstalacion = null;
        this.removeEventListener('galeno-consulta-descargada', this.programarAvisoInstalacion);
        this.removeEventListener('input', this.alCambio);
        this.removeEventListener('change', this.alCambiarClinica);
        this.removeEventListener('click', this.alClick);
        this.removeEventListener('submit', this.alSubmit);
    }

    programarAvisoInstalacion = () => {
        if (this.temporizadorInstalacion || this.avisoInstalacion) return;
        this.temporizadorInstalacion = setTimeout(() => {
            this.temporizadorInstalacion = null;
            this.avisoInstalacion = this.closest('galeno-app')?.instalador?.recomendar(
                'Instala GalenoSV para acceder a tus citas desde la pantalla de inicio.'
            );
        }, DEMORA_AVISO_INSTALACION);
    };
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
        this.campo('clinica').replaceChildren(opcion('', 'Todas las clínicas'));
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
            const select = this.campo('tipo');
            select.replaceChildren(opcion('', 'Selecciona un tipo'), ...tipos.map(t => opcion(t.idTipoDocumento, t.nombre)));
            select.disabled = !tipos.length;
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
            this.campo('clinica').replaceChildren(
                opcion('', 'Todas las clínicas'),
                ...Array.from(clinicas.values(), c => opcion(c.idClinica, c.nombre || 'Clínica sin nombre'))
            );
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
