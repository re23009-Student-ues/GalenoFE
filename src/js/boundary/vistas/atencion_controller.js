import { leer } from '../../control/agenda_service.js';
import { esPaciente } from '../../control/roles.js';
import ConsultaProcedimientoPasoService from '../../control/consultaProcedimientoPaso_service.js';
import { parseFecha, estadoConsulta, calcularEdad } from '../../control/fechas.js';
import { TextArea } from '../componentes/form/textarea/index.js';
import { ConfirmDialog } from '../componentes/overlays/index.js';
import { Toast } from '../componentes/feedback/index.js';
import AtencionFlujo from './atencion_flujo.js';
import { cargarDetalleAtencion, documentoDelPaciente, esResponsableDelPaso, esPasoInvalido } from '../../control/atencion_service.js';

function crear(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const nombrePersona = rol => [rol?.idPersona?.nombres, rol?.idPersona?.apellidos].filter(Boolean).join(' ') || 'Sin responsable registrado';

/** Atención con un paso del Wizard por cada ejecución real del procedimiento. */
export default class AtencionController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;
        this.idConsulta = null;
        this.carga = 0;
        this.observaciones = null;
        this.campos = [];
    }

    connectedCallback() {
        this.onBeforeUnload = event => {
            if (this.hayCambios()) { event.preventDefault(); event.returnValue = ''; }
        };
        this.onNavigation = async event => {
            if (this.permitirNavegacion || !this.hayCambios()) return;
            event.stopImmediatePropagation(); event.preventDefault();
            const target = event.target, detail = event.detail;
            if (await this.confirmarDescarte()) {
                this.permitirNavegacion = true;
                target.dispatchEvent(new CustomEvent('galeno-navegar', { detail, bubbles: true, composed: true }));
                this.permitirNavegacion = false;
            }
        };
        window.addEventListener('beforeunload', this.onBeforeUnload);
        document.addEventListener('galeno-navegar', this.onNavigation, true);
        this.cargar();
    }
    disconnectedCallback() {
        window.removeEventListener('beforeunload', this.onBeforeUnload);
        document.removeEventListener('galeno-navegar', this.onNavigation, true);
        this.carga++;
        this.limpiar();
    }

    limpiar() {
        this.confirmacion?.destroy(); this.confirmacion = null;
        this.flujo?.destroy(); this.flujo = null;
        this.campos.forEach(campo => campo.destroy()); this.campos = [];
        this.observaciones = null; this.detalle = null;
        this.observacionesProcedimiento = null;
        this.pasosVerificados = false;
        this.consulta = null;
        this.pasosConsulta = []; this.procedimientoSeleccionado = null; this.pasoSeleccionado = null;
        this.controlesProcedimientos = new Map(); this.estadoSeleccion = null;
    }

    volver() {
        const button = crear('button', 'atencion__boton', 'Volver a consultas');
        button.type = 'button';
        button.addEventListener('click', () => this.salir());
        return button;
    }

    async salir({ recomendarInstalacion = false } = {}) {
        if (!await this.confirmarDescarte() || !this.isConnected) return false;
        if (recomendarInstalacion) {
            this.closest('galeno-app')?.instalador?.programarRecomendacion(
                'Instala GalenoSV para acceder a tu agenda desde la pantalla de inicio.'
            );
        }
        this.dispatchEvent(new CustomEvent('volver-consultas', { bubbles: true }));
        return true;
    }

    hayCambios() { return this.flujo?.hayCambios() ?? false; }

    async confirmarDescarte() {
        if (this.flujo?.ocupado) { Toast.info('Espera a que termine el guardado.'); return; }
        if (this.confirmacion) return false;
        if (this.hayCambios()) {
            const carga = this.carga;
            const dialogo = new ConfirmDialog({ title: 'Cambios sin guardar', message: 'Hay borradores sin guardar. ¿Deseas descartarlos y abandonar la atención?',
                confirmText: 'Descartar y salir', cancelText: 'Permanecer', type: 'warning' });
            this.confirmacion = dialogo; dialogo.open(); const confirmado = await dialogo.result;
            dialogo.destroy(); this.confirmacion = null;
            if (!confirmado || !this.isConnected || carga !== this.carga) return false;
        }
        return true;
    }

    async cargar() {
        const carga = ++this.carga;
        this.limpiar();
        const aviso = crear('p', 'aviso', 'Cargando registro de atención…');
        aviso.setAttribute('role', 'status');
        this.replaceChildren(this.volver(), aviso);
        if (!this.idConsulta) {
            aviso.textContent = 'Selecciona un registro en Consultas para ver su atención.';
            return;
        }
        try {
            let consulta;
            try { consulta = await (await leer(`consulta/${encodeURIComponent(this.idConsulta)}`)).json(); }
            catch (error) {
                if (error.status !== 404) throw error;
            }
            if (!this.isConnected || carga !== this.carga) return;
            // Conserva el alcance visual del listado sin descargarlo para buscar un UUID.
            if (!consulta || String(consulta.idConsulta).toLowerCase() !== String(this.idConsulta).toLowerCase() ||
                    !this.usuario?.idClinica?.idClinica ||
                    consulta.idPersonaRol?.idClinica?.idClinica !== this.usuario.idClinica.idClinica ||
                    (esPaciente(this.usuario) && consulta.idPersonaRol?.idPersonaRol !== this.usuario.idPersonaRol)) {
                aviso.textContent = 'La consulta no está disponible para este usuario.';
                return;
            }
            this.mostrar(consulta);
            const cargaPasos = new ConsultaProcedimientoPasoService().listarParaConsultas([consulta.idConsulta]);
            void this.cargarDocumentoPaciente(consulta.idPersonaRol?.idPersona?.idPersona, carga);
            const pasos = await cargaPasos;
            if (!this.isConnected || carga !== this.carga) return;
            this.pasosVerificados = true;
            this.pasosConsulta = pasos;
            this.actualizarEstado(consulta, pasos);
            const detalle = await cargarDetalleAtencion(consulta.idConsulta);
            if (!this.isConnected || carga !== this.carga) return;
            this.detalle = detalle;
            this.mostrarDetalle(detalle);
        } catch {
            if (!this.isConnected || carga !== this.carga) return;
            const error = crear('p', 'aviso aviso--error', 'No fue posible cargar el registro completo de atención. Intenta nuevamente.');
            error.setAttribute('role', 'alert');
            const retry = crear('button', 'atencion__boton', 'Reintentar');
            retry.type = 'button';
            retry.addEventListener('click', () => this.cargar(), { once: true });
            if (!this.pasosVerificados) {
                this.querySelector('.atencion__pasos')?.replaceChildren(crear('p', 'aviso', 'No se pudieron cargar los pasos.'));
                this.querySelectorAll('.atencion__estado').forEach(estado => estado.textContent = 'No se pudo verificar');
            }
            this.querySelectorAll('[data-pendiente]').forEach(host => host.replaceChildren(crear('p', 'aviso', 'Información no disponible. Reintenta la carga.')));
            this.append(error, retry);
            Toast.error('No fue posible cargar la atención completa. Puedes reintentar.');
            aviso.remove();
        }
    }

    mostrar(consulta) {
        this.consulta = consulta;
        const persona = consulta.idPersonaRol?.idPersona;
        const nombre = [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ').trim();
        const anios = calcularEdad(persona?.fechaNacimiento);
        const edad = anios === null ? 'No disponible' : `${anios} años`;
        const panel = crear('section', 'atencion__registro');
        panel.append(crear('h2', '', 'Registro de atención'));
        const datos = crear('dl', 'atencion__datos');
        const inicio = crear('div');
        const fechaInicio = crear('dd');
        const fecha = parseFecha(consulta.fechaInicio);
        if (fecha && Number.isFinite(fecha.getTime())) {
            fechaInicio.append(fecha.toLocaleDateString('es-SV', { dateStyle: 'full' }),
                crear('br'), fecha.toLocaleTimeString('es-SV', { timeStyle: 'short' }));
        }
        inicio.append(crear('dt', '', 'Fecha de inicio'), fechaInicio);
        datos.append(inicio);
        for (const [label, value] of [
            ['Empleado responsable', 'Verificando responsables de los pasos…'],
            ['Referencia externa', consulta.referenciaExterna || 'Sin referencia externa'],
            ['Estado de la consulta', 'Verificando pasos…']
        ]) {
            const item = crear('div');
            item.append(crear('dt', '', label), crear('dd', label === 'Estado de la consulta' ? 'atencion__estado' : label === 'Empleado responsable' ? 'atencion__responsables' : '', value));
            datos.append(item);
        }
        const observationsHost = crear('div', 'atencion__observaciones');
        panel.append(datos);
        this.detallesGenerales = crear('details', 'atencion__detalles-generales');
        this.detallesGenerales.append(crear('summary', '', 'Observaciones y detalles del procedimiento'), observationsHost);
        this.observacionesProcedimientoHost = crear('div', 'atencion__observaciones-procedimiento');
        this.detallesGenerales.append(this.observacionesProcedimientoHost);
        this.selectorHost = crear('section', 'atencion__selector-procedimiento');
        this.selectorHost.dataset.pendiente = '';
        this.selectorHost.append(crear('p', 'aviso', 'Cargando procedimientos…'));
        this.flujoHost = crear('section', 'atencion__flujo');
        this.flujoHost.append(crear('p', 'aviso', 'Selecciona un procedimiento para revisar su atención.'));
        const paciente = crear('header', 'atencion__paciente');
        const avatar = crear('span', 'atencion__paciente-avatar',
            `${Array.from((persona?.nombres || '').trim())[0] || ''}${Array.from((persona?.apellidos || '').trim())[0] || ''}`.toUpperCase() || '?');
        avatar.setAttribute('aria-hidden', 'true');
        const identidad = crear('div', 'atencion__paciente-identidad');
        identidad.append(crear('strong', 'atencion__paciente-nombre', nombre || 'Nombre no disponible'),
            crear('span', 'atencion__paciente-edad', `Edad: ${edad}`));
        const documento = crear('p', 'atencion__paciente-documento', 'Cargando documento…');
        documento.setAttribute('role', 'status');
        identidad.append(documento); paciente.append(avatar, identidad);
        const contexto = crear('div');
        contexto.append(crear('dt', '', 'Procedimiento actual'), crear('dd', 'atencion__procedimiento-actual', 'Sin seleccionar')); datos.append(contexto);
        const actual = crear('div'); actual.append(crear('dt', '', 'Estado de la atención'), crear('dd', 'atencion__estado-atencion', 'Sin seleccionar')); datos.append(actual);
        this.replaceChildren(this.volver(), paciente, panel, this.selectorHost, this.detallesGenerales, this.flujoHost);
        this.observaciones = new TextArea(observationsHost, {
            name: 'observaciones',
            label: 'Observaciones de la consulta',
            value: typeof consulta.observaciones === 'string' ? consulta.observaciones : '',
            placeholder: 'Sin observaciones registradas.',
            readOnly: true,
            autoResize: true,
            minRows: 3,
            maxRows: 10,
            showCounter: true
        }).render();
        this.campos.push(this.observaciones);
    }

    async cargarDocumentoPaciente(idPersona, carga) {
        if (!this.isConnected || carga !== this.carga) return;
        const linea = this.querySelector('.atencion__paciente-documento');
        if (!linea) return;
        this.querySelector('.atencion__paciente-reintentar')?.remove();
        linea.textContent = idPersona ? 'Cargando documento…' : 'Documento no disponible.';
        if (!idPersona) return;
        try {
            const documento = await documentoDelPaciente(idPersona);
            if (!this.isConnected || carga !== this.carga) return;
            linea.textContent = documento ? `${documento.idTipoDocumento?.nombre || 'Documento'}: ${documento.valor.trim()}` : 'Sin documentos registrados.';
        } catch {
            if (!this.isConnected || carga !== this.carga) return;
            linea.textContent = 'No se pudo cargar el documento.';
            const reintentar = crear('button', 'atencion__paciente-reintentar', 'Reintentar documento'); reintentar.type = 'button';
            reintentar.addEventListener('click', () => this.cargarDocumentoPaciente(idPersona, carga), { once: true });
            linea.after(reintentar);
        }
    }

    actualizarEstado(consulta, pasos) {
        const valor = estadoConsulta(consulta, new Date(), pasos);
        this.querySelectorAll('.atencion__estado').forEach(estado => { estado.textContent = valor; estado.dataset.estado = valor; });
        const responsables = [...new Set(pasos.filter(p => p.idPersonaRol).map(p => nombrePersona(p.idPersonaRol)))];
        this.querySelector('.atencion__responsables').textContent = responsables.join(', ') || 'Sin responsable registrado';
    }

    texto(host, label, value, editable = false, name = '') {
        const target = crear('div'); host.append(target);
        const campo = new TextArea(target, { label, name, value: typeof value === 'string' ? value : '',
            readOnly: !editable, autoResize: true, minRows: 3, maxRows: 10, showCounter: true }).render();
        this.campos.push(campo); return campo;
    }

    mostrarDetalle(detalle) {
        this.selectorHost.replaceChildren(); delete this.selectorHost.dataset.pendiente;
        this.flujo = new AtencionFlujo(this, this.flujoHost, detalle, this.pasosConsulta);
        const procedimientos = detalle.procedimientos.filter(p =>
            (detalle.definiciones.get(p.idProcedimiento?.idProcedimiento) || []).some(d => d.idRol?.idRol === this.usuario?.idRol?.idRol));
        if (!procedimientos.length) {
            this.selectorHost.append(crear('p', 'aviso', 'No hay procedimientos asignados con pasos para tu rol.'));
            return;
        }
        const solicitado = this.parametros?.idPaso;
        if (solicitado) {
            const paso = this.pasosConsulta.find(p => p.idConsultaProcedimientoPaso === solicitado);
            const procedimiento = procedimientos.find(p => p.idConsultaProcedimiento === paso?.idConsultaProcedimiento?.idConsultaProcedimiento);
            if (!paso || !procedimiento || !esResponsableDelPaso(paso, this.usuario) || esPasoInvalido(paso)) {
                this.selectorHost.append(crear('p', 'aviso aviso--error', 'El paso solicitado no está disponible o ya no está asignado a tu contexto.'));
                return;
            }
        }
        if (procedimientos.length > 1) {
            const label = crear('label', '', 'Procedimiento a atender');
            const select = crear('select', 'atencion__elegir-procedimiento');
            const placeholder = crear('option', '', 'Selecciona un procedimiento'); placeholder.value = ''; select.append(placeholder);
            procedimientos.forEach(p => {
                const option = crear('option', '', p.idProcedimiento?.nombre || 'Procedimiento sin nombre');
                option.value = p.idConsultaProcedimiento; select.append(option);
            });
            select.addEventListener('change', () => {
                if (!this.seleccionarProcedimiento(select.value)) select.value = this.procedimientoSeleccionado || '';
            });
            label.append(select); this.selectorHost.append(label);
        }
        if (solicitado) {
            const paso = this.pasosConsulta.find(p => p.idConsultaProcedimientoPaso === solicitado);
            const id = paso.idConsultaProcedimiento.idConsultaProcedimiento;
            this.seleccionarProcedimiento(id, solicitado);
            const selector = this.querySelector('.atencion__elegir-procedimiento'); if (selector) selector.value = id;
        } else if (procedimientos.length === 1) this.seleccionarProcedimiento(procedimientos[0].idConsultaProcedimiento);
    }

    seleccionarProcedimiento(id, idPaso = null) {
        if (!this.detalle || this.flujo?.ocupado) return false;
        const p = this.detalle.procedimientos.find(p => p.idConsultaProcedimiento === id);
        if (!p || !(this.detalle.definiciones.get(p.idProcedimiento?.idProcedimiento) || []).some(d => d.idRol?.idRol === this.usuario?.idRol?.idRol)) return false;
        if (!this.flujo.abrir(p, idPaso)) return false;
        this.procedimientoSeleccionado = id;
        if (!this.observacionesProcedimiento) this.observacionesProcedimiento = this.texto(this.observacionesProcedimientoHost, 'Observaciones del procedimiento', p.observaciones);
        else this.observacionesProcedimiento.setValue(typeof p.observaciones === 'string' ? p.observaciones : '');
        return true;
    }

    actualizarCabeceraProcedimiento(procedimiento, paso) {
        this.querySelector('.atencion__procedimiento-actual').textContent = procedimiento.idProcedimiento?.nombre || 'Procedimiento sin nombre';
        this.querySelector('.atencion__estado-atencion').textContent = paso?.estado || 'Sin pasos';
        if (paso) this.querySelector('.atencion__responsables').textContent = nombrePersona(paso.idPersonaRol);
    }

}

customElements.define('atencion-controller', AtencionController);
