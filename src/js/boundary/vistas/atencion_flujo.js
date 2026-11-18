import { Wizard } from '../componentes/navigation/wizard/index.js';
import { TextArea } from '../componentes/form/textarea/index.js';
import { Checkbox } from '../componentes/form/checkbox/index.js';
import { Toast } from '../componentes/feedback/index.js';
import { ConfirmDialog, Modal } from '../componentes/overlays/index.js';
import ReportePaso from '../componentes/reporte_paso.js';
import { flujoDelProcedimiento, guardarCamposAtencion, registrarResultadoAtencion, estadoEditableAtencion,
    ordenesDeExamenes, textoOrdenExamen, indicacionesOrdenExamen, prefijoOrdenExamen, registrarOrdenAtencion, completarPasoAtencion, retrocederPasoAtencion, esResponsableDelPaso, pasosDelCamino, esPasoInvalido } from '../../control/atencion_service.js';

const crear = (tag, clase, texto) => {
    const node = document.createElement(tag); if (clase) node.className = clase;
    if (texto !== undefined) node.textContent = texto; return node;
};
let secuencia = 0;

/** Adaptador del Wizard; las transiciones clínicas requieren confirmación del servidor. */
export default class AtencionFlujo {
    constructor(owner, host, detalle, pasos) {
        this.owner = owner; this.host = host; this.detalle = detalle; this.pasos = pasos;
        this.caminos = new Map(); this.modelos = new Map(); this.historiales = new Map(); this.campos = []; this.checkboxes = [];
        this.id = `atencion-flujo-${++secuencia}`; this.ocupado = false; this.destroyed = false;
    }

    desmontarWizard() {
        this.reporte?.destroy(); this.reporte = null;
        if (!this.wizard) return;
        this.wizard.root.removeEventListener('click', this.onClick, true);
        this.wizard.root.removeEventListener('input', this.onEdit);
        this.wizard.root.removeEventListener('change', this.onEdit);
        this.wizard.destroy(); this.wizard = null;
    }

    abrir(procedimiento, idPaso = null) {
        if (this.ocupado || this.owner.guardando || this.destroyed) return false;
        let flujo;
        try { flujo = flujoDelProcedimiento(this.detalle, procedimiento, this.pasos); }
        catch (error) {
            if (!this.wizard) this.host.replaceChildren(crear('p', 'aviso aviso--error', error.message));
            Toast.error(error.message); return false;
        }
        const solicitado = idPaso ? flujo.pasos.find(p => p.idConsultaProcedimientoPaso === idPaso) : null;
        if (idPaso && (!solicitado || !esResponsableDelPaso(solicitado, this.owner.usuario) || esPasoInvalido(solicitado))) return false;
        this.desmontarWizard(); this.host.replaceChildren();
        this.procedimiento = procedimiento; this.flujo = flujo;
        this.elecciones = this.caminos.get(procedimiento.idConsultaProcedimiento) || new Map();
        this.caminos.set(procedimiento.idConsultaProcedimiento, this.elecciones);
        if (solicitado) {
            const destino = solicitado.idProcedimientoPaso.idProcedimientoPaso;
            const hacia = new Map([[destino, null]]), cola = [destino]; let raiz;
            for (let i = 0; i < cola.length; i++) {
                const actual = cola[i], anteriores = flujo.anteriores.get(actual);
                if (!anteriores.size) { raiz = actual; break; }
                for (const anterior of anteriores) if (!hacia.has(anterior) && !esPasoInvalido(flujo.porDefinicion.get(anterior))) {
                    hacia.set(anterior, actual); cola.push(anterior);
                }
            }
            for (let actual = raiz; actual !== undefined && actual !== destino; actual = hacia.get(actual)) {
                if (flujo.siguientes.get(actual).size > 1) this.elecciones.set(actual, hacia.get(actual));
            }
        }
        this.visibles = pasosDelCamino(flujo, this.elecciones);
        if (solicitado && !this.visibles.has(solicitado.idProcedimientoPaso.idProcedimientoPaso)) {
            this.host.append(crear('p', 'aviso aviso--error', 'El paso solicitado no pertenece a un camino disponible.')); return false;
        }
        this.historial = this.historiales.get(procedimiento.idConsultaProcedimiento) || [];
        this.historiales.set(procedimiento.idConsultaProcedimiento, this.historial);
        if (!flujo.pasos.some(p => !esPasoInvalido(p))) {
            this.host.append(crear('p', 'aviso', 'Este procedimiento no tiene ejecuciones de pasos registradas.'));
            this.owner.actualizarCabeceraProcedimiento(procedimiento, null); return true;
        }
        if (flujo.faltantes.length) this.host.append(crear('p', 'aviso', 'El procedimiento tiene pasos configurados sin ejecución; no podrá finalizarse hasta completar su configuración.'));
        const destino = crear('div', 'atencion__wizard'); this.host.append(destino);
        const modelos = flujo.pasos.map(paso => this.modelo(paso));
        this.wizard = new Wizard(destino, {
            linear: false, finishText: 'Guardar y avanzar',
            steps: modelos.map(m => ({ id: m.paso.idConsultaProcedimientoPaso, title: m.paso.idProcedimientoPaso?.nombre || 'Paso sin nombre',
                content: m.root, optional: true, enabled: this.visibles.has(m.paso.idProcedimientoPaso?.idProcedimientoPaso) })),
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
                else if (this.puedeVerReporte(button.dataset.step)) this.verReporte(button.dataset.step);
                else void this.ir(button.dataset.step, false);
            }
        };
        this.onEdit = () => this.actualizarControles();
        this.wizard.root.addEventListener('click', this.onClick, true);
        this.wizard.root.addEventListener('input', this.onEdit);
        this.wizard.root.addEventListener('change', this.onEdit);
        const propios = modelos.filter(m => this.visibles.has(m.paso.idProcedimientoPaso?.idProcedimientoPaso) && esResponsableDelPaso(m.paso, this.owner.usuario));
        const propio = (solicitado && propios.find(m => m.paso.idConsultaProcedimientoPaso === idPaso)) || propios.find(m => !flujo.completo(m.paso) && flujo.habilitado(m.paso) && estadoEditableAtencion(m.paso)) ||
            propios.find(m => !flujo.completo(m.paso) && estadoEditableAtencion(m.paso)) ||
            [...propios].reverse().find(m => flujo.completo(m.paso)) || propios.find(m => flujo.habilitado(m.paso));
        if (propio) void this.wizard.goToStep(propio.paso.idConsultaProcedimientoPaso);
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
        const editable = esResponsableDelPaso(paso, this.owner.usuario) && estadoEditableAtencion(paso) && !this.flujo.completo(paso) && this.flujo.habilitado(paso) && !this.procedimiento.fechaFin;
        const m = { paso, root, editable, ordenes: [], resultados: [], examenes: [], inicial: typeof paso.valor === 'string' ? paso.valor : '' };
        m.espera = crear('p', 'aviso atencion__espera-paso', this.mensajeEspera(paso));
        m.espera.setAttribute('role', 'status'); m.espera.hidden = !m.espera.textContent;
        root.append(m.espera);
        m.estado = crear('p', 'atencion__estado-paso', `Estado: ${paso.estado || 'No disponible'}`);
        const responsable = [paso.idPersonaRol?.idPersona?.nombres, paso.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' ');
        m.responsable = crear('p', '', `Responsable: ${responsable || 'Sin responsable registrado'}`);
        root.append(m.estado, m.responsable);
        const autorizado = esResponsableDelPaso(paso, this.owner.usuario);
        m.valor = this.texto(root, 'Atención brindada', autorizado ? paso.valor : '', editable, `valor-${id}`);
        m.valor.setHelperText(editable ? 'Obligatoria para completar el paso. Puedes guardar borradores sin completarlo.' : 'Atención registrada. Campo de solo lectura para este contexto.');
        const disponibles = this.detalle.examenes.filter(e => autorizado && e.idProcedimientoPaso?.idProcedimientoPaso === paso.idProcedimientoPaso?.idProcedimientoPaso);
        const ordenes = this.detalle.ordenes.filter(o => autorizado && o.idConsultaProcedimientoPaso?.idConsultaProcedimientoPaso === id);
        const asociaciones = ordenesDeExamenes(paso, disponibles, ordenes);
        if (disponibles.length) {
            const section = crear('section', 'atencion__examenes-paso'); section.append(crear('h4', '', 'Exámenes disponibles (opcionales)'));
            root.append(section);
            for (const examen of disponibles) {
                const host = crear('div', 'atencion__examen-opcion'); section.append(host);
                const orden = asociaciones.get(examen.idProcedimientoPasoExamen);
                const texto = orden ? textoOrdenExamen(paso, examen, orden) : '';
                const indicacionesHost = crear('div', 'atencion__indicaciones-seleccion'); host.append(indicacionesHost); indicacionesHost.hidden = !orden;
                const indicaciones = this.texto(indicacionesHost, `Indicaciones: ${examen.idExamen?.nombre || 'Examen'}`, texto, editable, `indicaciones-${id}-${examen.idProcedimientoPasoExamen}`);
                const checkboxHost = crear('div'); host.prepend(checkboxHost);
                const checkbox = new Checkbox(checkboxHost, { name: `examenes-${id}`, value: examen.idProcedimientoPasoExamen,
                    label: examen.idExamen?.nombre || 'Examen sin nombre', checked: !!orden, disabled: !editable,
                    onChange: checked => {
                        // Una orden persistida no se elimina al desmarcarla.
                        if (seleccion.orden && !checked) { checkbox.setChecked(true); Toast.info('Las órdenes registradas se conservan; su anulación requiere una operación específica.'); return; }
                        indicacionesHost.hidden = !checked;
                    }
                }).render();
                const seleccion = { checkbox, indicaciones, orden, examen };
                this.checkboxes.push(checkbox); m.examenes.push(seleccion);
                if (orden) m.ordenes.push({ orden, examen, campo: indicaciones, inicial: indicaciones.getValue() });
            }
            section.append(crear('p', 'aviso', 'Selecciona los exámenes e indica su preparación. Guardar registra las órdenes seleccionadas.'));
        }
        for (const orden of ordenes) {
            const examen = disponibles.find(e => textoOrdenExamen(paso, e, orden) !== null);
            const nombreOrden = examen ? prefijoOrdenExamen(paso, examen) :
                (typeof orden.indicaciones === 'string' && orden.indicaciones.match(/^(\[[^\]\r\n]+\] \[[^\]\r\n]+\])(?: |$)/)?.[1]) || 'Orden sin examen identificado';
            if (!m.ordenes.some(o => o.orden.idOrdenExamen === orden.idOrdenExamen)) {
                const item = crear('section', 'atencion__item');
                item.append(crear('h4', '', nombreOrden),
                    crear('p', 'aviso', 'Esta orden no tiene una asociación única con un examen del paso. Se conserva sin marcar una selección.'));
                const campo = this.texto(item, 'Indicaciones registradas', orden.indicaciones, editable, `orden-${orden.idOrdenExamen}`);
                m.ordenes.push({ orden, campo, inicial: campo.getValue() }); root.append(item);
            }
            this.montarResultados(m, orden, nombreOrden);
        }
        m.ayuda = crear('p', 'aviso atencion__limite-transicion'); root.append(m.ayuda);
        const crearSelector = (clase, label) => {
            const wrapper = crear('label', clase, label), select = crear('select');
            select.id = `${this.id}-${clase}-${id}`; wrapper.append(select); root.append(wrapper); return { wrapper, select };
        };
        m.sucesor = crearSelector('atencion__sucesor', 'Camino a seguir');
        m.predecesor = crearSelector('atencion__predecesor', 'Paso anterior');
        m.sucesor.select.addEventListener('change', () => {
            if (this.ocupado || this.owner.guardando || this.destroyed) return;
            const elegido = this.modelos.get(m.sucesor.select.value)?.paso.idProcedimientoPaso?.idProcedimientoPaso;
            const id = m.paso.idProcedimientoPaso.idProcedimientoPaso;
            if (elegido) this.elecciones.set(id, elegido); else this.elecciones.delete(id);
            this.actualizarControles();
        });
        m.predecesor.select.addEventListener('change', () => this.actualizarControles());
        if (!autorizado) root.replaceChildren(crear('p', 'aviso', 'Solo el responsable asignado puede ver y trabajar este paso.'));
        this.modelos.set(id, m); return m;
    }

    montarResultados(m, orden, nombreOrden, abrir = false) {
        if (m.resultados.some(r => r.resultado.idOrdenExamen?.idOrdenExamen === orden.idOrdenExamen)) return [];
        const campos = [];
        const resultados = this.detalle.resultados.filter(r => r.idOrdenExamen?.idOrdenExamen === orden.idOrdenExamen);
        if (!resultados.length && m.editable) resultados.push({ idOrdenExamen: orden, resultado: '', interpretacion: '' });
        for (const resultado of resultados) {
            const nuevo = !resultado.idExamenResultado;
            const item = crear(nuevo ? 'details' : 'section', 'atencion__resultado-paso');
            item.append(crear(nuevo ? 'summary' : 'h4', '', `${nuevo ? 'Registrar resultado (opcional)' : 'Resultado'} de ${nombreOrden}`));
            const valor = this.texto(item, 'Resultado', resultado.resultado, m.editable, `resultado-${resultado.idExamenResultado || orden.idOrdenExamen}`);
            const interpretacion = this.texto(item, 'Interpretación', resultado.interpretacion, m.editable, `interpretacion-${resultado.idExamenResultado || orden.idOrdenExamen}`);
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
            if (nuevo && abrir) item.open = true;
            if (m.ayuda) m.ayuda.before(item); else m.root.append(item);
            campos.push(valor, interpretacion);
        }
        return campos;
    }

    actual() { return this.wizard ? this.modelos.get(this.wizard.getCurrentStep().id) : null; }
    puedeVerReporte(id) {
        const actual = this.actual(), destino = this.modelos.get(id)?.paso;
        if (this.destroyed || this.ocupado || this.owner.guardando || !actual || !destino ||
                !esResponsableDelPaso(actual.paso, this.owner.usuario) || !this.flujo.completo(destino) ||
                !this.visibles.has(destino.idProcedimientoPaso?.idProcedimientoPaso)) return false;
        const pendientes = [...this.flujo.anteriores.get(actual.paso.idProcedimientoPaso.idProcedimientoPaso)];
        const vistos = new Set();
        while (pendientes.length) {
            const anterior = pendientes.pop();
            if (vistos.has(anterior) || esPasoInvalido(this.flujo.porDefinicion.get(anterior))) continue;
            vistos.add(anterior);
            if (anterior === destino.idProcedimientoPaso.idProcedimientoPaso) return true;
            pendientes.push(...this.flujo.anteriores.get(anterior));
        }
        return false;
    }
    verReporte(id) {
        if (!this.puedeVerReporte(id) || this.reporte) return false;
        const paso = this.modelos.get(id).paso;
        const contenido = new ReportePaso();
        contenido.datos = { paso, ordenes: this.detalle.ordenes, resultados: this.detalle.resultados };
        const dialogo = new Modal({ title: `Reporte de ${paso.idProcedimientoPaso?.nombre || 'paso completado'}`, size: 'large',
            actions: [{ label: 'Cerrar', onClick: modal => modal.close() }],
            onClose: () => { dialogo.destroy(); if (this.reporte === dialogo) this.reporte = null; } });
        this.reporte = dialogo;
        dialogo.setContent(contenido); dialogo.open(); return true;
    }
    mensajeEspera(paso) {
        if (!esResponsableDelPaso(paso, this.owner.usuario) || this.flujo.habilitado(paso)) return '';
        const pendientes = [...(this.flujo.anteriores.get(paso.idProcedimientoPaso?.idProcedimientoPaso) || [])]
            .filter(id => !esPasoInvalido(this.flujo.porDefinicion.get(id)) && String(this.flujo.porDefinicion.get(id)?.estado ?? '').trim().toUpperCase() !== 'COMPLETADO');
        const definiciones = this.detalle.definiciones.get(this.procedimiento.idProcedimiento?.idProcedimiento) || [];
        const responsables = pendientes.map(id => {
            const anterior = this.flujo.porDefinicion.get(id);
            const nombre = [anterior?.idPersonaRol?.idPersona?.nombres, anterior?.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' ');
            const titulo = anterior?.idProcedimientoPaso?.nombre || definiciones.find(d => d.idProcedimientoPaso === id)?.nombre || 'Paso anterior';
            return `«${titulo}»: ${nombre || 'sin responsable registrado'}`;
        });
        return `Estás esperando ${pendientes.length === 1 ? 'al responsable del paso anterior' : 'a los responsables de los pasos anteriores'}: ${responsables.join('; ')}. No puedes trabajar en tu paso hasta que completen los pasos anteriores.`;
    }
    destinos(m, mapa) {
        return [...(mapa.get(m.paso.idProcedimientoPaso?.idProcedimientoPaso) || [])]
            .map(id => this.flujo.porDefinicion.get(id)).filter(p => p && !esPasoInvalido(p));
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
    bifurcacion(m) { return m.paso.idProcedimientoPaso?.indicaFin !== true && this.destinos(m, this.flujo.siguientes).length > 1; }
    actualizarVisibilidad() {
        this.visibles = pasosDelCamino(this.flujo, this.elecciones);
        let cambio = false;
        for (const step of this.wizard.steps) {
            const visible = this.visibles.has(this.modelos.get(step.id).paso.idProcedimientoPaso?.idProcedimientoPaso);
            if (step.enabled !== visible) { step.enabled = visible; cambio = true; }
        }
        if (cambio) {
            this.wizard.render(); this.wizard.progress.max = this.wizard.enabled().length;
            this.wizard.scheduleCarousel(true, false);
        }
    }
    actualizarControles() {
        if (!this.wizard || this.destroyed) return;
        this.actualizarVisibilidad();
        const m = this.actual(); if (!m) return;
        m.estado.textContent = `Estado: ${m.paso.estado || 'No disponible'}`;
        m.espera.textContent = this.mensajeEspera(m.paso); m.espera.hidden = !m.espera.textContent;
        // Permite elegir la rama que quedaría habilitada al completar el paso actual.
        const siguientes = (m.paso.idProcedimientoPaso?.indicaFin === true ? [] : this.destinos(m, this.flujo.siguientes)).filter(p => this.flujo.habilitado(p) || this.flujo.completo(p) ||
            [...this.flujo.anteriores.get(p.idProcedimientoPaso.idProcedimientoPaso)].every(id =>
                id === m.paso.idProcedimientoPaso.idProcedimientoPaso || this.flujo.completo(this.flujo.porDefinicion.get(id))));
        this.siguienteId = this.actualizarSelector(m.sucesor, siguientes);
        const anteriores = this.destinos(m, this.flujo.anteriores);
        const idsAnteriores = new Set(anteriores.map(p => p.idConsultaProcedimientoPaso));
        const historial = [...this.historial].reverse().find(id => idsAnteriores.has(id));
        this.anteriorId = historial || this.actualizarSelector(m.predecesor, anteriores);
        if (historial) m.predecesor.wrapper.hidden = true;
        const terminal = m.paso.idProcedimientoPaso?.indicaFin === true || !(this.flujo.siguientes.get(m.paso.idProcedimientoPaso?.idProcedimientoPaso)?.size);
        const ocupado = this.ocupado || this.owner.guardando;
        m.sucesor.select.disabled = ocupado; m.predecesor.select.disabled = ocupado;
        const responsable = !m.retrocesoDenegado && esResponsableDelPaso(m.paso, this.owner.usuario);
        this.wizard.back.title = responsable ? 'Reabrir el paso anterior y reasignar los responsables de ambos pasos' : 'Solo el responsable asignado al paso actual puede regresar';
        this.wizard.back.setAttribute('aria-label', 'Regresar al paso anterior, reabrirlo y reasignar responsables de ambos pasos');
        this.wizard.back.disabled = ocupado || !this.anteriorId || !responsable || this.flujo.completo(m.paso) || !this.flujo.habilitado(m.paso);
        const completo = this.flujo.completo(m.paso);
        this.wizard.forward.textContent = completo && terminal ? 'Paso completado' : m.paso.idProcedimientoPaso?.indicaFin === true ? 'Completar' : 'Guardar y avanzar';
        this.wizard.forward.disabled = ocupado || this.bifurcacion(m) && !this.siguienteId || !responsable || !this.flujo.habilitado(m.paso) || (completo ? terminal || !this.siguienteId || !esResponsableDelPaso(this.modelos.get(this.siguienteId)?.paso, this.owner.usuario) : !m.editable);
        this.guardarBoton.disabled = ocupado || !m.editable;
        m.ayuda.textContent = completo ? 'Paso completado. Solo el responsable del siguiente paso puede solicitar su reapertura con Anterior.' :
            !m.espera.hidden ? '' : 'Completar guarda la atención y confirma el paso en el servidor. Los exámenes son opcionales.';
        for (const step of this.wizard.steps) {
            const modelo = this.modelos.get(step.id);
            let responsable = step.button.querySelector('.atencion__paso-responsable');
            if (!responsable) {
                responsable = crear('span', 'atencion__paso-responsable');
                step.stateLabel.before(responsable);
            }
            responsable.textContent = [modelo.paso.idPersonaRol?.idPersona?.nombres, modelo.paso.idPersonaRol?.idPersona?.apellidos]
                .filter(Boolean).join(' ').trim() || 'Sin responsable asignado';
            step.button.disabled = !this.puedeVerReporte(step.id) && (!step.enabled || ocupado || this.flujo.completo(modelo.paso) || !esResponsableDelPaso(modelo.paso, this.owner.usuario) || step.id === m.paso.idConsultaProcedimientoPaso || !(this.flujo.habilitado(modelo.paso) || this.flujo.completo(modelo.paso)));
            step.button.title = this.puedeVerReporte(step.id) ? 'Ver reporte del paso completado' : '';
            step.stateLabel.textContent = `${step.id === m.paso.idConsultaProcedimientoPaso ? 'Actual · ' : ''}${modelo.paso.estado || 'Sin estado'}`;
        }
        this.owner.actualizarCabeceraProcedimiento(this.procedimiento, m.paso);
    }

    pendiente(m) {
        if (esPasoInvalido(m.paso) || !esResponsableDelPaso(m.paso, this.owner.usuario)) return false;
        return m.valor.getValue() !== m.inicial || m.ordenes.some(o => o.campo.getValue() !== o.inicial) ||
            m.resultados.some(r => r.valor.getValue() !== r.inicial[0] || r.interpretacion.getValue() !== r.inicial[1]) ||
            m.examenes.some(e => e.checkbox.getChecked() && !e.orden);
    }
    hayCambios() { return [...this.modelos.values()].some(m => this.pendiente(m)); }

    async guardarActual(exigirAtencion = false) {
        const m = this.actual();
        if (!m || !esResponsableDelPaso(m.paso, this.owner.usuario) || this.ocupado || this.owner.guardando || this.destroyed) return false;
        const elegirCamino = exigirAtencion && this.bifurcacion(m) && !!this.siguienteId && (m.editable || this.flujo.completo(m.paso));
        if (!this.flujo.habilitado(m.paso) || this.flujo.completo(m.paso) && !elegirCamino) return false;
        if (!m.editable && !(elegirCamino && !this.pendiente(m))) return !this.pendiente(m);
        if ((exigirAtencion || this.flujo.completo(m.paso)) && !m.valor.getValue().trim()) {
            m.valor.setError('Registra la atención brindada para continuar.'); Toast.warning('La atención brindada es obligatoria en un paso completado.'); return false;
        }
        if (!m.valor.validate().valid || m.ordenes.some(o => !o.campo.validate().valid) || m.examenes.some(e => e.checkbox.getChecked() && !e.indicaciones.validate().valid) ||
            m.resultados.some(r => !r.valor.validate().valid || !r.interpretacion.validate().valid)) { Toast.warning('Revisa los campos del paso.'); return false; }
        if (m.resultados.some(r => !r.resultado.idExamenResultado && !r.valor.getValue().trim() && r.interpretacion.getValue() !== r.inicial[1])) {
            Toast.warning('Escribe el resultado antes de guardar su interpretación.'); return false;
        }
        try {
            for (const e of m.examenes.filter(e => e.checkbox.getChecked())) {
                const prefijo = prefijoOrdenExamen(m.paso, e.examen);
                if (m.examenes.filter(otra => prefijoOrdenExamen(m.paso, otra.examen) === prefijo).length !== 1 ||
                        !e.orden && this.detalle.ordenes.some(o => textoOrdenExamen(m.paso, e.examen, o) !== null)) {
                    throw new Error('El nombre del paso y examen identifica varias opciones u órdenes. Revisa la configuración antes de guardar.');
                }
            }
        } catch (error) { Toast.warning(error.message); return false; }
        this.ocupado = true; this.wizard.setLoading(true); this.actualizarControles();
        const editables = [...new Set([m.valor, ...m.examenes.map(e => e.indicaciones), ...m.ordenes.map(o => o.campo), ...m.resultados.flatMap(r => [r.valor, r.interpretacion])])]; editables.forEach(c => c.setDisabled(true));
        m.examenes.forEach(e => e.checkbox.setDisabled(true));
        try {
            if (m.valor.getValue() !== m.inicial && (!exigirAtencion || this.flujo.completo(m.paso))) {
                const datos = await guardarCamposAtencion('consulta_procedimiento_paso', m.paso, { valor: m.valor.getValue() }, this.owner.usuario, this.owner.consulta.idConsulta);
                if (this.destroyed) return false;
                Object.assign(m.paso, datos); m.inicial = datos.valor;
            }
            for (const e of m.examenes.filter(e => e.checkbox.getChecked() && !e.orden)) {
                const orden = await registrarOrdenAtencion(m.paso, e.examen, e.indicaciones.getValue(), this.owner.usuario, this.owner.consulta.idConsulta);
                if (this.destroyed) return false;
                e.orden = orden;
                this.detalle.ordenes.push(orden);
                m.ordenes.push({ orden, examen: e.examen, campo: e.indicaciones, inicial: textoOrdenExamen(m.paso, e.examen, orden) });
                const nuevos = this.montarResultados(m, orden, prefijoOrdenExamen(m.paso, e.examen), true);
                nuevos.forEach(campo => campo.setDisabled(true)); editables.push(...nuevos);
            }
            for (const o of m.ordenes) if (o.campo.getValue() !== o.inicial) {
                const indicaciones = o.examen ? indicacionesOrdenExamen(m.paso, o.examen, o.campo.getValue()) : o.campo.getValue();
                const datos = await guardarCamposAtencion('orden_examen', o.orden, { indicaciones }, this.owner.usuario, this.owner.consulta.idConsulta);
                if (this.destroyed) return false;
                Object.assign(o.orden, datos); o.inicial = o.examen ? textoOrdenExamen(m.paso, o.examen, datos) : datos.indicaciones;
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
            if (exigirAtencion && (!this.flujo.completo(m.paso) || elegirCamino)) {
                const datos = await completarPasoAtencion(m.paso, m.valor.getValue(), this.owner.usuario, this.owner.consulta.idConsulta,
                    m.paso.idProcedimientoPaso?.indicaFin === true ? { pasos: this.flujo.pasos } : elegirCamino ? { siguiente: this.siguienteId, pasos: this.flujo.pasos } : null);
                if (this.destroyed) return false;
                const { _pasosConfirmados, ...confirmado } = datos;
                Object.assign(m.paso, confirmado); m.inicial = datos.valor;
                if (_pasosConfirmados) for (const p of _pasosConfirmados) Object.assign(this.modelos.get(p.idConsultaProcedimientoPaso).paso, p);
                m.retrocesoDenegado = false;
                this.actualizarPermisos();
                this.owner.actualizarEstado(this.owner.consulta, this.owner.pasosConsulta);
            }
            Toast.success(exigirAtencion ? 'Atención guardada y paso completado.' : 'Atención guardada. El estado del paso se conserva.'); return true;
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

    actualizarPermisos() {
        for (const m of this.modelos.values()) {
            if (m.paso.idConsultaProcedimiento?.idConsultaProcedimiento !== this.procedimiento.idConsultaProcedimiento) continue;
            m.editable = esResponsableDelPaso(m.paso, this.owner.usuario) && estadoEditableAtencion(m.paso) && !this.flujo.completo(m.paso) &&
                this.flujo.habilitado(m.paso) && !this.procedimiento.fechaFin;
            if (!esResponsableDelPaso(m.paso, this.owner.usuario)) m.root.replaceChildren(crear('p', 'aviso', 'Solo el responsable asignado puede ver y trabajar este paso.'));
            m.valor.setHelperText(m.editable ? 'Obligatoria para completar el paso. Puedes guardar borradores sin completarlo.' : 'Atención registrada. Campo de solo lectura para este contexto.');
            const nombre = [m.paso.idPersonaRol?.idPersona?.nombres, m.paso.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' ');
            m.responsable.textContent = `Responsable: ${nombre || 'Sin responsable registrado'}`;
            [m.valor, ...m.ordenes.map(o => o.campo), ...m.examenes.map(e => e.indicaciones)].forEach(c => c.setReadOnly(!m.editable));
            m.resultados.forEach(r => [r.valor, r.interpretacion].forEach(c => c.setReadOnly(!m.editable || !!r.resultado._registrado)));
            m.examenes.forEach(e => e.checkbox.setDisabled(this.ocupado || !m.editable));
        }
    }

    async ir(id, guardar = true) {
        if (!this.wizard || this.ocupado || this.owner.guardando || this.destroyed || id === this.wizard.getCurrentStep().id) return false;
        const destino = this.modelos.get(id); if (!destino || !this.visibles.has(destino.paso.idProcedimientoPaso?.idProcedimientoPaso) || !esResponsableDelPaso(destino.paso, this.owner.usuario) || this.flujo.completo(destino.paso) || !(this.flujo.habilitado(destino.paso) || this.flujo.completo(destino.paso))) return false;
        const actual = this.actual();
        if (guardar && this.pendiente(actual) && !await this.guardarActual()) return false;
        if (this.destroyed) return false;
        const cambio = await this.wizard.goToStep(id);
        if (cambio) { this.historial.push(actual.paso.idConsultaProcedimientoPaso); this.actualizarControles(); }
        return cambio;
    }
    async siguiente() {
        const m = this.actual(); if (!m || !esResponsableDelPaso(m.paso, this.owner.usuario) || this.ocupado || this.owner.guardando || this.destroyed) return false;
        if (!this.flujo.habilitado(m.paso)) return false;
        if (m.editable && (!this.flujo.completo(m.paso) || this.pendiente(m)) && !m.valor.getValue().trim()) {
            m.valor.setError('Registra la atención brindada para continuar.'); Toast.warning('La atención brindada es obligatoria.'); return false;
        }
        const siguienteElegido = this.siguienteId;
        if (this.bifurcacion(m) && !this.siguienteId) { Toast.warning('Selecciona el camino para continuar.'); return false; }
        if ((!this.flujo.completo(m.paso) || this.bifurcacion(m)) && ((!m.editable && !this.flujo.completo(m.paso)) || !await this.confirmarCompletar(m))) return false;
        if (this.bifurcacion(m) && siguienteElegido !== this.siguienteId) return false;
        if (!this.flujo.completo(m.paso) || this.pendiente(m) || this.bifurcacion(m)) {
            if ((!m.editable && !this.bifurcacion(m)) || !await this.guardarActual(true)) return false;
        }
        this.actualizarControles();
        const siguiente = this.modelos.get(this.siguienteId)?.paso;
        const pendientesPropios = this.pasos.some(paso => esResponsableDelPaso(paso, this.owner.usuario) && !esPasoInvalido(paso) && !this.flujo.completo(paso));
        if (!pendientesPropios || siguiente && !esResponsableDelPaso(siguiente, this.owner.usuario)) {
            return this.owner.salir();
        }
        if (!this.siguienteId || !this.flujo.habilitado(this.modelos.get(this.siguienteId).paso) && !this.flujo.completo(this.modelos.get(this.siguienteId).paso)) {
            return this.flujo.completo(m.paso);
        }
        return this.ir(this.siguienteId, false);
    }

    async confirmarCompletar(modelo) {
        if (this.ocupado || this.confirmacionCompletar || this.destroyed) return false;
        const elegido = this.modelos.get(this.siguienteId)?.paso;
        const avisoCamino = modelo.paso.idProcedimientoPaso?.indicaFin === true ? ' Las ramas no seleccionadas de este procedimiento quedarán inválidas y ocultas. Se conservarán los pasos ya completados.' : this.bifurcacion(modelo) ? ` Se seguirá el camino «${elegido?.idProcedimientoPaso?.nombre || 'Sin nombre'}» y los pasos exclusivos de otros caminos quedarán inválidos y ocultos.` : '';
        const dialogo = new ConfirmDialog({ title: 'Completar paso',
            message: `Se guardará la atención registrada y se marcará como completado el paso «${modelo.paso.idProcedimientoPaso?.nombre || 'Sin nombre'}».${avisoCamino} ¿Deseas continuar?`,
            confirmText: modelo.paso.idProcedimientoPaso?.indicaFin === true ? 'Completar' : 'Guardar y avanzar', cancelText: 'Cancelar', type: 'warning' });
        this.confirmacionCompletar = dialogo;
        this.ocupado = true; this.actualizarControles();
        try {
            dialogo.open();
            const confirmado = await dialogo.result;
            return confirmado && !this.destroyed && this.actual() === modelo;
        } finally {
            dialogo.destroy(); this.confirmacionCompletar = null;
            if (!this.destroyed) { this.ocupado = false; this.actualizarControles(); }
        }
    }
    async confirmarRetroceso(actual, destino) {
        if (this.ocupado || this.confirmacionRetroceso || this.destroyed) return false;
        const dialogo = new ConfirmDialog({ title: 'Regresar al paso anterior',
            message: `Se reabrirá el paso «${destino.paso.idProcedimientoPaso?.nombre || 'Sin nombre'}» como pendiente y se reasignarán los responsables de ambos pasos. Se conservarán los datos guardados. Si el paso reabierto queda asignado a otra persona, volverás a Consultas. ¿Deseas continuar?`,
            confirmText: 'Reabrir paso anterior', cancelText: 'Cancelar', type: 'warning' });
        this.confirmacionRetroceso = dialogo;
        this.ocupado = true; this.actualizarControles();
        try {
            dialogo.open();
            const confirmado = await dialogo.result;
            return confirmado && !this.destroyed && this.actual() === actual && this.anteriorId === destino.paso.idConsultaProcedimientoPaso;
        } finally {
            dialogo.destroy(); this.confirmacionRetroceso = null;
            if (!this.destroyed) { this.ocupado = false; this.actualizarControles(); }
        }
    }

    async anterior() {
        if (!this.anteriorId || this.ocupado || this.owner.guardando || this.destroyed) return false;
        const id = this.anteriorId;
        const historial = [...this.historial];
        const actual = this.actual(), destino = this.modelos.get(id);
        if (!actual || !destino) return false;
        if (!this.flujo.habilitado(actual.paso) || this.flujo.completo(actual.paso)) return false;
        if (actual.retrocesoDenegado || !esResponsableDelPaso(actual.paso, this.owner.usuario)) {
            Toast.warning('Solo el responsable asignado al paso actual puede regresar.'); return false;
        }
        if (!await this.confirmarRetroceso(actual, destino) || this.destroyed || !esResponsableDelPaso(actual.paso, this.owner.usuario) ||
                this.flujo.completo(actual.paso) || !this.flujo.habilitado(actual.paso)) return false;
        this.ocupado = true; this.wizard.setLoading(true); this.actualizarControles();
        const campos = this.campos.map(c => [c, c.control.disabled]);
        campos.forEach(([c]) => c.setDisabled(true)); this.checkboxes.forEach(c => c.setDisabled(true));
        try {
            const datos = await retrocederPasoAtencion(actual.paso, destino.paso, this.owner.usuario, this.owner.consulta.idConsulta);
            if (this.destroyed) return false;
            Object.assign(actual.paso, datos.origen, { fechaFin: datos.origen.fechaFin ?? null });
            Object.assign(destino.paso, datos.destino, { fechaFin: datos.destino.fechaFin ?? null });
            actual.retrocesoDenegado = false; destino.retrocesoDenegado = false;
            destino.inicial = datos.destino.valor ?? '';
            this.ocupado = false; this.wizard.setLoading(false); this.actualizarPermisos();
            this.owner.actualizarEstado(this.owner.consulta, this.owner.pasosConsulta);
            if (!esResponsableDelPaso(destino.paso, this.owner.usuario)) {
                this.actualizarControles();
                Toast.success('Paso anterior pendiente y responsables actualizados. Solo el nuevo responsable puede abrirlo.');
                return await this.owner.salir();
            }
            const cambio = await this.ir(id, false);
            if (cambio) {
                const posicion = historial.lastIndexOf(id);
                this.historial.splice(0, this.historial.length, ...historial.slice(0, posicion >= 0 ? posicion : historial.length));
                Toast.success('Paso anterior pendiente y responsables de ambos pasos actualizados.');
            }
            return cambio;
        } catch (error) {
            if (error.status === 403) actual.retrocesoDenegado = true;
            if (!this.destroyed) Toast.error(`${error.message || 'No fue posible regresar al paso anterior.'} Los borradores se conservan.`);
            return false;
        } finally {
            if (!this.destroyed) {
                this.ocupado = false; this.wizard.setLoading(false);
                campos.forEach(([c, disabled]) => c.setDisabled(disabled));
                this.actualizarPermisos(); this.actualizarControles();
            }
        }
    }

    destroy() {
        this.destroyed = true; this.confirmacionCompletar?.destroy(); this.confirmacionRetroceso?.destroy(); this.desmontarWizard();
        this.checkboxes.forEach(c => c.destroy()); this.campos.forEach(c => c.destroy());
        this.checkboxes = []; this.campos = []; this.modelos.clear(); this.historiales.clear(); this.caminos.clear(); this.host.replaceChildren();
    }
}
