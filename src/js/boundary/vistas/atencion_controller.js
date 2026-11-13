import { listarConsultas } from '../../control/resumen_service.js';
import ConsultaProcedimientoPasoService from '../../control/consultaProcedimientoPaso_service.js';
import { formatoFecha, estadoConsulta, calcularEdad } from '../../control/fechas.js';
import { TextArea } from '../componentes/form/textarea/index.js';

function crear(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Detalle de lectura: solo consulta los recursos REST ya existentes. */
export default class AtencionController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;
        this.idConsulta = null;
        this.carga = 0;
        this.observaciones = null;
    }

    connectedCallback() { this.cargar(); }
    disconnectedCallback() {
        this.carga++;
        this.observaciones?.destroy(); this.observaciones = null;
    }

    volver() {
        const button = crear('button', 'atencion__boton', 'Volver a consultas');
        button.type = 'button';
        button.addEventListener('click', () => this.dispatchEvent(new CustomEvent('volver-consultas', { bubbles: true })));
        return button;
    }

    async cargar() {
        const carga = ++this.carga;
        this.observaciones?.destroy(); this.observaciones = null;
        const aviso = crear('p', 'aviso', 'Cargando registro de atención…');
        aviso.setAttribute('role', 'status');
        this.replaceChildren(this.volver(), aviso);
        if (!this.idConsulta) {
            aviso.textContent = 'Selecciona un registro en Consultas para ver su atención.';
            return;
        }
        try {
            // Mantiene los filtros de clínica y permisos del listado existente.
            const consultas = await listarConsultas(this.usuario);
            if (!this.isConnected || carga !== this.carga) return;
            const consulta = consultas.find(item => String(item.idConsulta) === String(this.idConsulta));
            if (!consulta) {
                aviso.textContent = 'La consulta no está disponible para este usuario.';
                return;
            }
            this.mostrar(consulta);
            const pasos = await new ConsultaProcedimientoPasoService().listarParaConsultas([consulta.idConsulta]);
            if (!this.isConnected || carga !== this.carga) return;
            this.querySelector('.atencion__estado').textContent = estadoConsulta(consulta, new Date(), pasos);
            this.mostrarPasos(pasos);
        } catch {
            if (!this.isConnected || carga !== this.carga) return;
            const error = crear('p', 'aviso aviso--error', 'No fue posible cargar el registro completo de atención. Intenta nuevamente.');
            error.setAttribute('role', 'alert');
            const retry = crear('button', 'atencion__boton', 'Reintentar');
            retry.type = 'button';
            retry.addEventListener('click', () => this.cargar(), { once: true });
            this.querySelector('.atencion__pasos')?.remove();
            const estado = this.querySelector('.atencion__estado');
            if (estado) estado.textContent = 'No se pudo verificar';
            this.append(error, retry);
            aviso.remove();
        }
    }

    mostrar(consulta) {
        const persona = consulta.idPersonaRol?.idPersona;
        const nombre = [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ').trim();
        const anios = calcularEdad(persona?.fechaNacimiento);
        const edad = anios === null ? 'No disponible' : `${anios} años`;
        const panel = crear('section', 'atencion__registro');
        panel.append(crear('h2', '', 'Registro de atención'));
        const datos = crear('dl', 'atencion__datos');
        for (const [label, value] of [
            ['Consulta', consulta.idConsulta], ['Paciente', nombre || 'Nombre no disponible'],
            ['Edad', edad], ['Fecha de inicio', formatoFecha(consulta.fechaInicio)],
            ['Estado de la consulta', 'Verificando pasos…']
        ]) {
            const item = crear('div');
            item.append(crear('dt', '', label), crear('dd', label === 'Estado de la consulta' ? 'atencion__estado' : '', value));
            datos.append(item);
        }
        const observationsHost = crear('div', 'atencion__observaciones');
        panel.append(datos, observationsHost);
        const pasos = crear('section', 'atencion__pasos');
        const loading = crear('p', 'aviso', 'Cargando procedimientos y pasos…');
        loading.setAttribute('role', 'status');
        pasos.append(loading);
        this.replaceChildren(this.volver(), panel, pasos);
        this.observaciones = new TextArea(observationsHost, {
            name: 'observaciones',
            label: 'Observaciones de la consulta',
            value: typeof consulta.observaciones === 'string' ? consulta.observaciones : '',
            placeholder: 'Sin observaciones registradas.',
            helperText: 'Información registrada en la consulta. Campo de solo lectura.',
            readOnly: true,
            autoResize: true,
            minRows: 3,
            maxRows: 10,
            showCounter: true
        }).render();
    }

    mostrarPasos(pasos) {
        const host = this.querySelector('.atencion__pasos');
        host.replaceChildren(crear('h3', '', 'Procedimientos y pasos registrados'));
        if (!pasos.length) {
            host.append(crear('p', 'aviso', 'El servicio no devuelve procedimientos ni pasos para esta consulta.'));
            return;
        }
        const enCurso = pasos.filter(paso => typeof paso.estado === 'string' &&
            paso.estado.trim().toUpperCase().replace(/\s+/g, '_') === 'EN_CURSO');
        host.append(crear('p', 'atencion__actual', enCurso.length ?
            `Paso en curso: ${enCurso.map(paso => paso.idProcedimientoPaso?.nombre || 'Nombre no disponible').join(', ')}` :
            'El servicio no indica un paso en curso.'));
        const scroll = crear('div', 'atencion__tabla');
        const table = crear('table');
        table.append(crear('caption', '', 'Pasos de la consulta seleccionada'));
        const header = table.createTHead().insertRow();
        for (const text of ['Procedimiento', 'Paso', 'Estado']) {
            const th = crear('th', '', text); th.scope = 'col'; header.append(th);
        }
        const body = table.createTBody();
        for (const paso of pasos) {
            const row = body.insertRow();
            if (enCurso.includes(paso)) row.className = 'atencion__paso-actual';
            for (const value of [paso.idConsultaProcedimiento?.idProcedimiento?.nombre,
                paso.idProcedimientoPaso?.nombre, paso.estado]) {
                row.insertCell().textContent = value || 'No disponible';
            }
        }
        scroll.append(table); host.append(scroll);
    }
}

customElements.define('atencion-controller', AtencionController);
