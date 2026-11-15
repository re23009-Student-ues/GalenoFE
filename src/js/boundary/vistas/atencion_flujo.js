import { Wizard } from '../componentes/navigation/wizard/index.js';
import { TextArea } from '../componentes/form/textarea/index.js';
import { Checkbox } from '../componentes/form/checkbox/index.js';
import { Toast } from '../componentes/feedback/index.js';
import { flujoDelProcedimiento, guardarCamposAtencion, registrarResultadoAtencion, pasoDelRol, estadoEditableAtencion } from '../../control/atencion_service.js';

const crear = (tag, clase, texto) => {
    const node = document.createElement(tag); if (clase) node.className = clase;
    if (texto !== undefined) node.textContent = texto; return node;
};
let secuencia = 0;

/** Adaptador de la vista de atención al Wizard existente. No completa estados clínicos. */
export default class AtencionFlujo {
    constructor(owner, host, detalle, pasos) {
        this.owner = owner; this.host = host; this.detalle = detalle; this.pasos = pasos;
        this.modelos = new Map(); this.historiales = new Map(); this.campos = []; this.checkboxes = [];
        this.id = `atencion-flujo-${++secuencia}`; this.ocupado = false; this.destroyed = false;
    }

    desmontarWizard() {
        if (!this.wizard) return;
        this.wizard.root.removeEventListener('click', this.onClick, true);
        this.wizard.root.removeEventListener('input', this.onEdit);
        this.wizard.root.removeEventListener('change', this.onEdit);
        this.wizard.destroy(); this.wizard = null;
    }

    abrir(procedimiento) {
        if (this.ocupado || this.owner.guardando || this.destroyed) return false;
        let flujo;
        try { flujo = flujoDelProcedimiento(this.detalle, procedimiento, this.pasos); }
        catch (error) {
            if (!this.wizard) this.host.replaceChildren(crear('p', 'aviso aviso--error', error.message));
            Toast.error(error.message); return false;
        }
        this.desmontarWizard(); this.host.replaceChildren();
        this.procedimiento = procedimiento; this.flujo = flujo;
        this.historial = this.historiales.get(procedimiento.idConsultaProcedimiento) || [];
        this.historiales.set(procedimiento.idConsultaProcedimiento, this.historial);
        if (!flujo.pasos.length) {
            this.host.append(crear('p', 'aviso', 'Este procedimiento no tiene ejecuciones de pasos registradas.'));
            this.owner.actualizarCabeceraProcedimiento(procedimiento, null); return true;
        }
        if (flujo.faltantes.length) this.host.append(crear('p', 'aviso', 'El procedimiento tiene pasos configurados sin ejecución; no podrá finalizarse hasta completar su configuración.'));
        const destino = crear('div', 'atencion__wizard'); this.host.append(destino);
        const modelos = flujo.pasos.map(paso => this.modelo(paso));
        this.wizard = new Wizard(destino, {
            linear: false, finishText: 'Finalizar procedimiento',
            steps: modelos.map(m => ({ id: m.paso.idConsultaProcedimientoPaso, title: m.paso.idProcedimientoPaso?.nombre || 'Paso sin nombre',
                content: m.root, optional: true })),
            isStepComplete: id => flujo.completo(this.modelos.get(id).paso),
            onStepChange: () => queueMicrotask(() => { if (!this.destroyed) this.actualizarControles(); }),
            onComplete: () => { Toast.warning('La finalización del procedimiento todavía no está disponible.'); return false; }
        }).render();
        this.guardarBoton = crear('button', 'atencion__boton atencion__guardar-paso', 'Guardar'); this.guardarBoton.type = 'button';
        this.wizard.forward.before(this.guardarBoton);
        this.onClick = event => {
            const button = event.target.closest('button');
            if (button === this.guardarBoton) {
                event.preventDefault(); event.stopImmediatePropagation(); void this.guardarActual();
            } else if (button === this.wizard.back || button === this.wizard.forward || button?.parentNode?.parentNode === this.wizard.indicator) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (button === this.wizard.back) void this.anterior();
                else if (button === this.wizard.forward) void this.siguiente();
                else void this.ir(button.dataset.step, false);
            }
        };
        this.onEdit = () => this.actualizarControles();
        this.wizard.root.addEventListener('click', this.onClick, true);
        this.wizard.root.addEventListener('input', this.onEdit);
        this.wizard.root.addEventListener('change', this.onEdit);
        this.actualizarControles(); return true;
    }

    texto(host, label, value, editable, name) {
        const target = crear('div'); host.append(target);
        const campo = new TextArea(target, { label, name, value: typeof value === 'string' ? value : '',
            readOnly: !editable, autoResize: true, minRows: 3, maxRows: 10, showCounter: true }).render();
        this.campos.push(campo); return campo;
    }

    modelo(paso) {
        const id = paso.idConsultaProcedimientoPaso;
        if (this.modelos.has(id)) return this.modelos.get(id);
        const root = crear('section', 'atencion__paso-medico');
        const editable = pasoDelRol(paso, this.owner.usuario) && estadoEditableAtencion(paso) && (this.flujo.habilitado(paso) || this.flujo.completo(paso)) && !this.procedimiento.fechaFin;
        const m = { paso, root, editable, ordenes: [], resultados: [], examenes: [], inicial: typeof paso.valor === 'string' ? paso.valor : '' };
        m.estado = crear('p', 'atencion__estado-paso', `Estado: ${paso.estado || 'No disponible'}`);
        const responsable = [paso.idPersonaRol?.idPersona?.nombres, paso.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' ');
        root.append(m.estado, crear('p', '', `Responsable: ${responsable || 'Sin responsable registrado'}`));
        m.valor = this.texto(root, 'Atención brindada', paso.valor, editable, `valor-${id}`);
        m.valor.setHelperText(editable ? 'Obligatoria para completar el paso. Puedes guardar borradores sin completarlo.' : 'Atención registrada. Campo de solo lectura para este contexto.');
        const disponibles = this.detalle.examenes.filter(e => e.idProcedimientoPaso?.idProcedimientoPaso === paso.idProcedimientoPaso?.idProcedimientoPaso);
        const ordenes = this.detalle.ordenes.filter(o => o.idConsultaProcedimientoPaso?.idConsultaProcedimientoPaso === id);
        if (disponibles.length) {
            const section = crear('section', 'atencion__examenes-paso'); section.append(crear('h4', '', 'Exámenes disponibles (opcionales)'));
            root.append(section);
            for (const examen of disponibles) {
                const host = crear('div', 'atencion__examen-opcion'); section.append(host);
                const orden = ordenes.find(o => o.idProcedimientoPasoExamen?.idProcedimientoPasoExamen === examen.idProcedimientoPasoExamen);
                const indicacionesHost = crear('div', 'atencion__indicaciones-seleccion'); host.append(indicacionesHost); indicacionesHost.hidden = !orden;
                const indicaciones = this.texto(indicacionesHost, `Indicaciones: ${examen.idExamen?.nombre || 'Examen'}`, orden?.indicaciones, editable, `indicaciones-${id}-${examen.idProcedimientoPasoExamen}`);
                const checkboxHost = crear('div'); host.prepend(checkboxHost);
                const checkbox = new Checkbox(checkboxHost, { name: `examenes-${id}`, value: examen.idProcedimientoPasoExamen,
                    label: examen.idExamen?.nombre || 'Examen sin nombre', checked: !!orden, disabled: !editable,
                    onChange: checked => {
                        // Una orden persistida no se elimina al desmarcarla.
                        if (orden && !checked) { checkbox.setChecked(true); Toast.info('Las órdenes registradas se conservan; su anulación requiere una operación específica.'); return; }
                        indicacionesHost.hidden = !checked;
                    }
                }).render();
                this.checkboxes.push(checkbox); m.examenes.push({ checkbox, indicaciones, orden, examen });
                if (orden) m.ordenes.push({ orden, campo: indicaciones, inicial: indicaciones.getValue() });
            }
            section.append(crear('p', 'aviso', 'Puedes preparar la selección. Su envío requiere que la orden identifique el examen; mientras tanto, retira las selecciones sin guardar para guardar solo la atención.'));
        }
        for (const orden of ordenes) {
            if (!m.ordenes.some(o => o.orden.idOrdenExamen === orden.idOrdenExamen)) {
                const item = crear('section', 'atencion__item');
                item.append(crear('h4', '', `Orden ${orden.idOrdenExamen}`),
                    crear('p', 'aviso', 'El servicio no identifica el examen de esta orden. No se asociará automáticamente a una selección.'));
                const campo = this.texto(item, 'Indicaciones registradas', orden.indicaciones, editable, `orden-${orden.idOrdenExamen}`);
                m.ordenes.push({ orden, campo, inicial: campo.getValue() }); root.append(item);
            }
            const resultados = this.detalle.resultados.filter(r => r.idOrdenExamen?.idOrdenExamen === orden.idOrdenExamen);
            if (!resultados.length && editable) resultados.push({ idOrdenExamen: orden, resultado: '', interpretacion: '' });
            for (const resultado of resultados) {
                const nuevo = !resultado.idExamenResultado;
                const item = crear(nuevo ? 'details' : 'section', 'atencion__resultado-paso');
                item.append(crear(nuevo ? 'summary' : 'h4', '', `${nuevo ? 'Registrar resultado (opcional)' : 'Resultado'} de la orden ${orden.idOrdenExamen}`));
                const valor = this.texto(item, 'Resultado', resultado.resultado, editable, `resultado-${resultado.idExamenResultado || orden.idOrdenExamen}`);
                const interpretacion = this.texto(item, 'Interpretación', resultado.interpretacion, editable, `interpretacion-${resultado.idExamenResultado || orden.idOrdenExamen}`);
                m.resultados.push({ resultado, valor, interpretacion, inicial: [valor.getValue(), interpretacion.getValue()] });
                if (resultado.rutaAtestado) {
                    const referencia = crear('p', 'atencion__adjunto');
                    try {
                        const url = new URL(resultado.rutaAtestado);
                        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
                        const enlace = crear('a', '', 'Ver adjunto'); enlace.href = url.href; enlace.target = '_blank'; enlace.rel = 'noopener noreferrer'; referencia.append(enlace);
                    } catch { referencia.textContent = `Referencia del adjunto: ${resultado.rutaAtestado}`; }
                    item.append(referencia);
                }
                root.append(item);
            }
        }
        m.ayuda = crear('p', 'aviso atencion__limite-transicion'); root.append(m.ayuda);
        const crearSelector = (clase, label) => {
            const wrapper = crear('label', clase, label), select = crear('select');
            select.id = `${this.id}-${clase}-${id}`; wrapper.append(select); root.append(wrapper); return { wrapper, select };
        };
        m.sucesor = crearSelector('atencion__sucesor', 'Siguiente paso');
        m.predecesor = crearSelector('atencion__predecesor', 'Paso anterior');
        m.sucesor.select.addEventListener('change', () => this.actualizarControles());
        m.predecesor.select.addEventListener('change', () => this.actualizarControles());
        this.modelos.set(id, m); return m;
    }

    actual() { return this.wizard ? this.modelos.get(this.wizard.getCurrentStep().id) : null; }
    destinos(m, mapa) {
        return [...(mapa.get(m.paso.idProcedimientoPaso?.idProcedimientoPaso) || [])]
            .map(id => this.flujo.porDefinicion.get(id)).filter(Boolean);
    }
    actualizarSelector(selector, pasos) {
        const elegido = selector.select.value;
        const firma = pasos.map(p => p.idConsultaProcedimientoPaso).join('|');
        if (selector.select.dataset.firma !== firma) {
            selector.select.replaceChildren(crear('option', '', 'Selecciona un paso'));
            selector.select.firstChild.value = '';
            pasos.forEach(p => { const option = crear('option', '', p.idProcedimientoPaso?.nombre || 'Paso sin nombre'); option.value = p.idConsultaProcedimientoPaso; selector.select.append(option); });
            selector.select.dataset.firma = firma; selector.select.value = elegido;
        }
        selector.wrapper.hidden = pasos.length < 2;
        return pasos.length === 1 ? pasos[0].idConsultaProcedimientoPaso : selector.select.value;
    }
    actualizarControles() {
        if (!this.wizard || this.destroyed) return;
        const m = this.actual(); if (!m) return;
        m.estado.textContent = `Estado: ${m.paso.estado || 'No disponible'}`;
        const siguientes = this.destinos(m, this.flujo.siguientes).filter(p => this.flujo.habilitado(p) || this.flujo.completo(p));
        this.siguienteId = this.actualizarSelector(m.sucesor, siguientes);
        const anteriores = this.destinos(m, this.flujo.anteriores);
        const idsAnteriores = new Set(anteriores.map(p => p.idConsultaProcedimientoPaso));
        const historial = [...this.historial].reverse().find(id => idsAnteriores.has(id));
        this.anteriorId = historial || this.actualizarSelector(m.predecesor, anteriores);
        if (historial) m.predecesor.wrapper.hidden = true;
        const terminal = !(this.flujo.siguientes.get(m.paso.idProcedimientoPaso?.idProcedimientoPaso)?.size);
        const ocupado = this.ocupado || this.owner.guardando;
        this.wizard.back.disabled = ocupado || !this.anteriorId;
        this.wizard.forward.textContent = terminal ? 'Finalizar procedimiento' : 'Siguiente';
        this.wizard.forward.disabled = ocupado || terminal || !this.siguienteId || !this.flujo.completo(m.paso);
        this.guardarBoton.disabled = ocupado || !m.editable;
        m.ayuda.textContent = terminal ? 'Finalizar está bloqueado: falta una operación de finalización validada por el servidor. No se cerrará toda la consulta.' :
            !this.flujo.completo(m.paso) ? 'Puedes guardar la atención. Completar este paso y habilitar el siguiente requiere una operación validada por el servidor.' :
                siguientes.length > 1 ? 'Elige el sucesor habilitado para continuar.' :
                    !siguientes.length ? 'No hay sucesores habilitados o faltan ejecuciones para continuar.' : '';
        for (const step of this.wizard.steps) {
            const modelo = this.modelos.get(step.id);
            step.button.disabled = ocupado || step.id === m.paso.idConsultaProcedimientoPaso || !(this.flujo.habilitado(modelo.paso) || this.flujo.completo(modelo.paso));
            step.stateLabel.textContent = `${step.id === m.paso.idConsultaProcedimientoPaso ? 'Actual · ' : ''}${modelo.paso.estado || 'Sin estado'}`;
        }
        this.owner.actualizarCabeceraProcedimiento(this.procedimiento, m.paso);
    }

    pendiente(m) {
        return m.valor.getValue() !== m.inicial || m.ordenes.some(o => o.campo.getValue() !== o.inicial) ||
            m.resultados.some(r => r.valor.getValue() !== r.inicial[0] || r.interpretacion.getValue() !== r.inicial[1]) ||
            m.examenes.some(e => e.checkbox.getChecked() && !e.orden);
    }
    hayCambios() { return [...this.modelos.values()].some(m => this.pendiente(m)); }

    async guardarActual(exigirAtencion = false) {
        const m = this.actual();
        if (!m || this.ocupado || this.owner.guardando || this.destroyed) return false;
        if (!m.editable) return !this.pendiente(m);
        if ((exigirAtencion || this.flujo.completo(m.paso)) && !m.valor.getValue().trim()) {
            m.valor.setError('Registra la atención brindada para continuar.'); Toast.warning('La atención brindada es obligatoria en un paso completado.'); return false;
        }
        if (!m.valor.validate().valid || m.ordenes.some(o => !o.campo.validate().valid) ||
            m.resultados.some(r => !r.valor.validate().valid || !r.interpretacion.validate().valid)) { Toast.warning('Revisa los campos del paso.'); return false; }
        if (m.resultados.some(r => !r.resultado.idExamenResultado && !r.valor.getValue().trim() && r.interpretacion.getValue() !== r.inicial[1])) {
            Toast.warning('Escribe el resultado antes de guardar su interpretación.'); return false;
        }
        if (m.examenes.some(e => e.checkbox.getChecked() && !e.orden)) {
            Toast.warning('No se pueden enviar estas órdenes hasta relacionar cada orden con su examen en el backend. Tus indicaciones se conservan.'); return false;
        }
        this.ocupado = true; this.wizard.setLoading(true); this.actualizarControles();
        const editables = [m.valor, ...m.ordenes.map(o => o.campo), ...m.resultados.flatMap(r => [r.valor, r.interpretacion])]; editables.forEach(c => c.setDisabled(true));
        m.examenes.forEach(e => e.checkbox.setDisabled(true));
        try {
            if (m.valor.getValue() !== m.inicial) {
                const datos = await guardarCamposAtencion('consulta_procedimiento_paso', m.paso, { valor: m.valor.getValue() }, this.owner.usuario, this.owner.consulta.idConsulta);
                if (this.destroyed) return false;
                Object.assign(m.paso, datos); m.inicial = datos.valor;
            }
            for (const o of m.ordenes) if (o.campo.getValue() !== o.inicial) {
                const datos = await guardarCamposAtencion('orden_examen', o.orden, { indicaciones: o.campo.getValue() }, this.owner.usuario, this.owner.consulta.idConsulta);
                if (this.destroyed) return false;
                Object.assign(o.orden, datos); o.inicial = datos.indicaciones;
            }
            for (const r of m.resultados) if (r.valor.getValue() !== r.inicial[0] || r.interpretacion.getValue() !== r.inicial[1]) {
                const cambios = { resultado: r.valor.getValue(), interpretacion: r.interpretacion.getValue() };
                const datos = r.resultado.idExamenResultado ?
                    await guardarCamposAtencion('examen_resultado', r.resultado, cambios, this.owner.usuario, this.owner.consulta.idConsulta) :
                    await registrarResultadoAtencion(r.resultado.idOrdenExamen, cambios, this.owner.usuario, this.owner.consulta.idConsulta);
                if (this.destroyed) return false;
                Object.assign(r.resultado, datos); r.inicial = [cambios.resultado, cambios.interpretacion];
                if (datos._registrado) {
                    r.valor.setReadOnly(true); r.interpretacion.setReadOnly(true);
                    Toast.info('Resultado registrado. Vuelve a abrir la atención para editarlo.');
                }
            }
            Toast.success('Atención guardada. El estado del paso se conserva.'); return true;
        } catch (error) {
            if (!this.destroyed) Toast.error(`${error.message || 'No fue posible guardar el paso.'} Los cambios pendientes se conservan para reintentar.`);
            return false;
        } finally {
            if (!this.destroyed) {
                this.ocupado = false; this.wizard.setLoading(false); editables.forEach(c => c.setDisabled(false));
                m.examenes.forEach(e => e.checkbox.setDisabled(!m.editable)); this.actualizarControles();
            }
        }
    }

    async ir(id, guardar = true) {
        if (!this.wizard || this.ocupado || this.owner.guardando || this.destroyed || id === this.wizard.getCurrentStep().id) return false;
        const destino = this.modelos.get(id); if (!destino || !(this.flujo.habilitado(destino.paso) || this.flujo.completo(destino.paso))) return false;
        const actual = this.actual();
        if (guardar && this.pendiente(actual) && !await this.guardarActual()) return false;
        if (this.destroyed) return false;
        const cambio = await this.wizard.goToStep(id);
        if (cambio) { this.historial.push(actual.paso.idConsultaProcedimientoPaso); this.actualizarControles(); }
        return cambio;
    }
    async siguiente() {
        const m = this.actual(); if (!m || this.ocupado) return false;
        if (m.editable && (!this.flujo.completo(m.paso) || this.pendiente(m)) && !m.valor.getValue().trim()) {
            m.valor.setError('Registra la atención brindada para continuar.'); Toast.warning('La atención brindada es obligatoria.'); return false;
        }
        if (!this.flujo.completo(m.paso)) { Toast.warning('El servidor todavía no ofrece la operación de completar este paso. Puedes guardar su atención.'); return false; }
        if (!this.siguienteId) return false;
        return this.ir(this.siguienteId, true);
    }
    async anterior() {
        if (!this.anteriorId || this.ocupado) return false;
        const id = this.anteriorId;
        const historial = [...this.historial];
        const cambio = await this.ir(id, false);
        if (cambio) {
            const posicion = historial.lastIndexOf(id);
            this.historial.splice(0, this.historial.length, ...historial.slice(0, posicion >= 0 ? posicion : historial.length)); this.actualizarControles();
        }
        return cambio;
    }

    destroy() {
        this.destroyed = true; this.desmontarWizard();
        this.checkboxes.forEach(c => c.destroy()); this.campos.forEach(c => c.destroy());
        this.checkboxes = []; this.campos = []; this.modelos.clear(); this.historiales.clear(); this.host.replaceChildren();
    }
}
