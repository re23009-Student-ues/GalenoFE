import { listarConsultas } from '../../control/resumen_service.js';
import ConsultaProcedimientoPasoService from '../../control/consultaProcedimientoPaso_service.js';
import { formatoFecha, estadoConsulta, calcularEdad } from '../../control/fechas.js';
import { TextArea } from '../componentes/form/textarea/index.js';
import { Wizard } from '../componentes/navigation/wizard/index.js';
import { cargarDetalleAtencion, guardarCamposAtencion, registrarResultadoAtencion, finalizarAtencion, pasoDelRol, documentoDelPaciente } from '../../control/atencion_service.js';

function crear(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const nombrePersona = rol => [rol?.idPersona?.nombres, rol?.idPersona?.apellidos].filter(Boolean).join(' ') || 'Sin responsable registrado';

/** Atención por apartados, con guardado explícito sobre los recursos REST existentes. */
export default class AtencionController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;
        this.idConsulta = null;
        this.carga = 0;
        this.observaciones = null;
        this.campos = [];
        this.ediciones = [];
    }

    connectedCallback() { this.cargar(); }
    disconnectedCallback() {
        this.carga++;
        this.limpiar();
    }

    limpiar() {
        this.wizard?.destroy(); this.wizard = null;
        this.campos.forEach(campo => campo.destroy()); this.campos = [];
        this.observaciones = null; this.ediciones = []; this.detalle = null;
        this.pasosVerificados = false; this.guardando = false;
        this.seleccionExamenes?.clear(); this.seleccionExamenes = null;
        this.apartados = this.borradores = this.mensajeCierre = this.fechasCierre = this.consulta = null;
    }

    volver() {
        const button = crear('button', 'atencion__boton', 'Volver a consultas');
        button.type = 'button';
        button.addEventListener('click', () => this.dispatchEvent(new CustomEvent('volver-consultas', { bubbles: true })));
        return button;
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
            // Mantiene los filtros de clínica y permisos del listado existente.
            const consultas = await listarConsultas(this.usuario);
            if (!this.isConnected || carga !== this.carga) return;
            const consulta = consultas.find(item => String(item.idConsulta) === String(this.idConsulta));
            if (!consulta) {
                aviso.textContent = 'La consulta no está disponible para este usuario.';
                return;
            }
            this.mostrar(consulta);
            const cargaPasos = new ConsultaProcedimientoPasoService().listarParaConsultas([consulta.idConsulta]);
            void this.cargarDocumentoPaciente(consulta.idPersonaRol?.idPersona?.idPersona, carga);
            const pasos = await cargaPasos;
            if (!this.isConnected || carga !== this.carga) return;
            this.pasosVerificados = true;
            this.actualizarEstado(consulta, pasos);
            this.mostrarPasos(pasos);
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
        for (const [label, value] of [
            ['Consulta', consulta.idConsulta], ['Paciente', nombre || 'Nombre no disponible'],
            ['Edad', edad], ['Fecha de inicio', formatoFecha(consulta.fechaInicio)],
            ['Fecha de finalización', formatoFecha(consulta.fechaFin)],
            ['Empleado responsable', 'Verificando responsables de los pasos…'],
            ['Referencia externa', consulta.referenciaExterna || 'Sin referencia externa'],
            ['Estado de la consulta', 'Verificando pasos…']
        ]) {
            const item = crear('div');
            item.append(crear('dt', '', label), crear('dd', label === 'Estado de la consulta' ? 'atencion__estado' : label === 'Empleado responsable' ? 'atencion__responsables' : '', value));
            if (label === 'Fecha de finalización') item.lastElementChild.classList.add('atencion__fecha-fin');
            datos.append(item);
        }
        const observationsHost = crear('div', 'atencion__observaciones');
        panel.append(datos);
        const pasos = crear('section', 'atencion__pasos');
        const loading = crear('p', 'aviso', 'Cargando procedimientos y pasos…');
        loading.setAttribute('role', 'status');
        pasos.append(loading);
        const titulos = ['Información general', 'Procedimientos', 'Pasos de atención', 'Exámenes disponibles',
            'Órdenes de examen', 'Resultados de exámenes', 'Observaciones y cierre'];
        const clases = ['registro', 'procedimientos', 'pasos', 'examenes', 'ordenes', 'resultados', 'cierre'];
        this.apartados = clases.map((clase, index) => index === 0 ? panel : index === 2 ? pasos : crear('section', `atencion__${clase}`));
        for (const index of [1, 3, 4, 5]) {
            this.apartados[index].dataset.pendiente = '';
            this.apartados[index].append(crear('p', 'aviso', 'Cargando información…'));
        }
        this.mensajeCierre = crear('p', 'aviso'); this.mensajeCierre.setAttribute('role', 'status');
        this.fechasCierre = crear('p', 'atencion__fechas-cierre', `Inicio: ${formatoFecha(consulta.fechaInicio)} · Fin: ${formatoFecha(consulta.fechaFin)}`);
        this.apartados[6].append(observationsHost, this.fechasCierre,
            crear('p', 'aviso', 'Para finalizar, guarda los cambios y completa todos los pasos de atención. La finalización registra la fecha de cierre.'), this.mensajeCierre);
        const wizardHost = crear('div', 'atencion__wizard');
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
        this.replaceChildren(this.volver(), paciente, wizardHost);
        this.wizard = new Wizard(wizardHost, {
            linear: false, finishText: 'Finalizar consulta',
            steps: titulos.map((title, index) => ({ id: clases[index], title, content: this.apartados[index],
                validate: index === 6 ? () => this.validarCierre() : undefined })),
            onComplete: () => this.finalizar()
        }).render();
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

    guardar(host, recurso, registro, campos, editable) {
        if (!editable) return;
        let inicial = Object.values(campos).map(c => c.getValue());
        this.ediciones.push(() => Object.values(campos).some((c, index) => c.getValue() !== inicial[index]));
        const boton = crear('button', 'atencion__boton', 'Guardar cambios'); boton.type = 'button';
        const estado = crear('p', 'aviso'); estado.setAttribute('role', 'status');
        boton.addEventListener('click', async () => {
            if (this.guardando || this.wizard?.state === 'completed') return;
            const carga = this.carga, wizard = this.wizard;
            this.guardando = true; boton.disabled = true; wizard.setLoading(true);
            Object.values(campos).forEach(c => c.setDisabled(true));
            estado.textContent = 'Guardando…';
            try {
                const cambios = Object.fromEntries(Object.entries(campos).map(([key, campo]) => [key, campo.getValue()]));
                const datos = recurso === 'examen_resultado' && !registro.idExamenResultado ?
                    await registrarResultadoAtencion(registro.idOrdenExamen, cambios, this.usuario, this.consulta.idConsulta) :
                    await guardarCamposAtencion(recurso, registro, cambios, this.usuario, this.consulta.idConsulta);
                if (!this.isConnected || carga !== this.carga) return;
                Object.assign(registro, datos); inicial = Object.values(campos).map(c => c.getValue());
                estado.textContent = registro._registrado ? 'Resultado registrado. Vuelve a abrir la consulta para editarlo.' : 'Cambios guardados.';
                if (registro._registrado) Object.values(campos).forEach(c => c.setReadOnly(true));
            } catch (error) {
                if (this.isConnected && carga === this.carga) estado.textContent = error.message || 'No fue posible guardar. Tus cambios se conservan para reintentar.';
            } finally {
                if (this.isConnected && carga === this.carga) {
                    this.guardando = false; boton.disabled = !!registro._registrado; wizard.setLoading(false);
                    Object.values(campos).forEach(c => c.setDisabled(false));
                }
            }
        });
        host.append(boton, estado);
    }

    mostrarDetalle(detalle) {
        for (const index of [1, 3, 4, 5]) { this.apartados[index].replaceChildren(); delete this.apartados[index].dataset.pendiente; }
        for (const p of detalle.procedimientos) {
            const item = crear('article', 'atencion__item');
            item.append(crear('h4', '', p.idProcedimiento?.nombre || 'Procedimiento sin nombre'),
                crear('p', '', `Inicio: ${formatoFecha(p.fechaInicio)} · Fin: ${formatoFecha(p.fechaFin)}`));
            this.texto(item, 'Observaciones del procedimiento', p.observaciones);
            this.apartados[1].append(item);
        }
        if (!detalle.procedimientos.length) this.apartados[1].append(crear('p', 'aviso', 'Sin procedimientos asignados.'));
        this.mostrarExamenes(detalle);
        for (const orden of detalle.ordenes) {
            const item = crear('article', 'atencion__item');
            const paso = orden.idConsultaProcedimientoPaso;
            item.append(crear('h4', '', `Orden ${orden.idOrdenExamen}`), crear('p', '', 'Examen: no identificado por el servicio.'),
                crear('p', '', `Paso: ${paso?.idProcedimientoPaso?.nombre || 'No disponible'} · Solicitud: ${formatoFecha(orden.fechaCreacion)}`));
            const campo = this.texto(item, 'Indicaciones', orden.indicaciones, pasoDelRol(paso, this.usuario));
            this.guardar(item, 'orden_examen', orden, { indicaciones: campo }, pasoDelRol(paso, this.usuario));
            this.apartados[4].append(item);
        }
        this.borradores = crear('div', 'atencion__borradores'); this.apartados[4].append(this.borradores);
        if (!detalle.ordenes.length) this.apartados[4].prepend(crear('p', 'aviso', 'Sin órdenes registradas.'));
        const resultados = [...detalle.resultados, ...detalle.ordenes
            .filter(o => !detalle.resultados.some(r => r.idOrdenExamen?.idOrdenExamen === o.idOrdenExamen))
            .map(o => ({ idOrdenExamen: o, resultado: '', interpretacion: '' }))];
        for (const resultado of resultados) {
            const orden = detalle.ordenes.find(o => o.idOrdenExamen === resultado.idOrdenExamen?.idOrdenExamen);
            const editable = pasoDelRol(orden?.idConsultaProcedimientoPaso, this.usuario);
            const item = crear('article', 'atencion__item');
            item.append(crear('h4', '', `Resultado de la orden ${orden.idOrdenExamen}`),
                crear('p', '', resultado.idExamenResultado ? formatoFecha(resultado.fechaCreacion) : 'Resultado pendiente de registrar.'));
            const valor = this.texto(item, 'Resultado', resultado.resultado, editable);
            const interpretacion = this.texto(item, 'Interpretación', resultado.interpretacion, editable);
            item.append(crear('p', '', resultado.rutaAtestado ? `Adjunto registrado: ${resultado.rutaAtestado}` : 'Sin adjunto registrado.'));
            const label = crear('label', 'atencion__archivo', 'Archivo adjunto');
            const archivo = crear('input'); archivo.type = 'file'; archivo.disabled = true; label.append(archivo);
            item.append(label, crear('p', 'aviso', 'La carga de adjuntos requiere un servicio de archivos.'));
            this.guardar(item, 'examen_resultado', resultado, { resultado: valor, interpretacion }, editable);
            this.apartados[5].append(item);
        }
        if (!resultados.length) this.apartados[5].append(crear('p', 'aviso', 'Sin órdenes para registrar resultados. La carga de adjuntos todavía no está disponible.'));
        const editable = !!this.usuario?.idRol?.idRol && detalle.pasosDefinidos.some(p => p.idRol?.idRol === this.usuario.idRol.idRol);
        this.observaciones.setReadOnly(!editable).setHelperText(editable ? 'Guarda las observaciones antes de finalizar.' : 'Información registrada en la consulta. Campo de solo lectura.');
        this.guardar(this.apartados[6], 'consulta', this.consulta, { observaciones: this.observaciones }, editable);
    }

    mostrarExamenes(detalle) {
        this.seleccionExamenes = new Map();
        this.apartados[3].append(crear('p', 'aviso', 'La selección es un borrador: el servicio debe relacionar la orden con el examen para poder enviarla.'));
        for (const config of detalle.examenes) {
            const paso = detalle.pasosDefinidos.find(p => p.idProcedimientoPaso === config.idProcedimientoPaso?.idProcedimientoPaso);
            const label = crear('label', 'atencion__examen');
            const checkbox = crear('input'); checkbox.type = 'checkbox'; checkbox.value = config.idProcedimientoPasoExamen;
            checkbox.disabled = !this.usuario?.idRol?.idRol || paso?.idRol?.idRol !== this.usuario.idRol.idRol;
            label.append(checkbox, crear('span', '', `${config.idExamen.nombre || 'Examen sin nombre'} · ${paso?.nombre || 'Paso sin nombre'}`));
            checkbox.addEventListener('change', () => {
                let borrador = this.seleccionExamenes.get(config.idProcedimientoPasoExamen);
                if (!borrador) {
                    const host = crear('article', 'atencion__item');
                    host.append(crear('h4', '', config.idExamen.nombre || 'Examen sin nombre'),
                        crear('p', '', 'Fecha de solicitud: pendiente de enviar.'));
                    const indicaciones = this.texto(host, 'Indicaciones del examen seleccionado', '', true);
                    host.append(crear('p', 'aviso', 'Borrador sin guardar: falta la relación entre orden y examen en el REST.'));
                    borrador = { host, indicaciones, seleccionado: false }; this.seleccionExamenes.set(config.idProcedimientoPasoExamen, borrador);
                    this.borradores.append(host);
                }
                borrador.seleccionado = checkbox.checked; borrador.host.hidden = !checkbox.checked;
            });
            this.apartados[3].append(label);
        }
        if (!detalle.examenes.length) this.apartados[3].append(crear('p', 'aviso', 'Sin exámenes activos configurados para los pasos de esta consulta.'));
    }

    validarCierre() {
        const message = !this.detalle || !this.pasosVerificados ? 'Espera a que se cargue toda la atención antes de finalizar.' :
            this.ediciones.some(dirty => dirty()) ? 'Guarda los cambios antes de finalizar.' :
                [...(this.seleccionExamenes?.values() || [])].some(b => b.seleccionado) ?
                    'Hay exámenes seleccionados sin enviar. El servicio aún no permite crear sus órdenes; retira la selección para continuar.' : '';
        return { valid: !message, message };
    }

    async finalizar() {
        const carga = this.carga;
        try {
            const datos = await finalizarAtencion(this.consulta, this.usuario);
            if (!this.isConnected || carga !== this.carga) return false;
            Object.assign(this.consulta, datos);
            this.fechasCierre.textContent = `Inicio: ${formatoFecha(datos.fechaInicio)} · Fin: ${formatoFecha(datos.fechaFin)}`;
            this.querySelector('.atencion__fecha-fin').textContent = formatoFecha(datos.fechaFin);
            this.mensajeCierre.textContent = 'Consulta finalizada. Fecha de cierre guardada.';
            this.campos.forEach(c => c.setReadOnly(true));
            this.querySelectorAll('.atencion__wizard .atencion__boton, .atencion__examen input').forEach(control => control.disabled = true);
            return true;
        } catch (error) {
            if (this.isConnected && carga === this.carga) this.mensajeCierre.textContent = error.message || 'No fue posible finalizar la consulta.';
            return false;
        }
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
        for (const text of ['Procedimiento', 'Paso', 'Responsable', 'Estado', 'Fechas', 'Atención brindada / valor']) {
            const th = crear('th', '', text); th.scope = 'col'; header.append(th);
        }
        const body = table.createTBody();
        for (const paso of pasos) {
            const row = body.insertRow();
            if (enCurso.includes(paso)) row.className = 'atencion__paso-actual';
            for (const value of [paso.idConsultaProcedimiento?.idProcedimiento?.nombre,
                paso.idProcedimientoPaso?.nombre, nombrePersona(paso.idPersonaRol), paso.estado,
                `Inicio: ${formatoFecha(paso.fechaInicio)} · Fin: ${formatoFecha(paso.fechaFin)}`]) {
                row.insertCell().textContent = value || 'No disponible';
            }
            const cell = row.insertCell();
            const editable = pasoDelRol(paso, this.usuario);
            const valor = this.texto(cell, 'Valor de la atención', paso.valor, editable);
            this.guardar(cell, 'consulta_procedimiento_paso', paso, { valor }, editable);
        }
        scroll.append(table); host.append(scroll);
    }
}

customElements.define('atencion-controller', AtencionController);
