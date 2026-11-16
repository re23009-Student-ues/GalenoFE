import { cargarAgenda, diaAgenda, ZONA_AGENDA } from '../../control/agenda_service.js';
import { calcularEdad } from '../../control/fechas.js';
import { documentoDelPaciente } from '../../control/atencion_service.js';
import Tree from './data-display/Tree.js';
import TarjetaSimple from './tarjeta_simple.js';
class Agenda extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        const hoy = diaAgenda();
        this.innerHTML = `<section class="agenda-panel"><h2>Consultas por rol</h2><p>Tus pasos se indican con «-responsable».</p><form class="agenda-form"><label>Desde<input name="desde" type="date" value="${hoy}" required></label><label>Hasta<input name="hasta" type="date" value="${hoy}" required></label><button type="submit">Aplicar</button><button type="button" data-hoy>Hoy</button></form><p role="status" aria-live="polite"></p><div data-lista></div></section>`;
        this.alSubmit = e => { e.preventDefault(); this.cargar(); };
        this.alInput = e => { if (!e.target.closest('.agenda-form')) return; this.version++; this.destruirArboles(); this.querySelector('[data-lista]').replaceChildren(); this.querySelector('[role="status"]').textContent = 'Aplica el rango seleccionado'; this.querySelector('[type="submit"]').disabled = false; };
        this.alClick = e => {
            if (e.target.closest('[data-hoy]')) { this.querySelectorAll('.agenda-form input').forEach(i => i.value = diaAgenda()); this.cargar(); }
            const abrir = e.target.closest('[data-consulta]');
            if (abrir) this.dispatchEvent(new CustomEvent('galeno-navegar', { detail: { ruta: '/atencion/' + encodeURIComponent(abrir.dataset.consulta) }, bubbles: true, composed: true }));
        };
        this.addEventListener('submit', this.alSubmit);
        this.addEventListener('input', this.alInput);
        this.addEventListener('click', this.alClick);
        this.cargar();
    }
    disconnectedCallback() { this.version++; this.destruirArboles(); this.removeEventListener('submit', this.alSubmit); this.removeEventListener('input', this.alInput); this.removeEventListener('click', this.alClick); }
    destruirArboles() {
        this.arboles?.forEach(arbol => arbol.destroy());
        this.arboles = [];
    }
    datosProcedimientos(procedimientos) {
        return procedimientos.map((procedimiento, index) => {
            const pasos = new Map();
            const agregar = (paso, registros = []) => {
                const id = paso.idProcedimientoPaso;
                const existente = pasos.get(id);
                const responsable = !!this.usuario?.idPersonaRol && registros.some(registro =>
                    registro.idPersonaRol?.idPersonaRol === this.usuario.idPersonaRol &&
                    String(registro.estado ?? '').trim().toUpperCase() !== 'INVALIDO');
                const activos = [...new Set([...(existente?.registros || []), ...registros])]
                    .filter(registro => String(registro.estado ?? '').trim().toUpperCase() !== 'INVALIDO');
                const propios = [...new Set(activos.filter(registro => registro.idPersonaRol?.idPersonaRol === this.usuario?.idPersonaRol)
                    .map(registro => registro.idConsultaProcedimientoPaso).filter(Boolean))];
                pasos.set(id, { registros: activos, idPaso: propios.length === 1 ? propios[0] : null,
                    completado: !!activos.length && activos.every(registro => ['COMPLETADO', 'FINALIZADO'].includes(String(registro.estado ?? '').trim().toUpperCase())), id: `procedimiento-${index}-paso-${id}`, paso: paso.nombre || existente?.paso || 'Paso sin nombre',
                    responsable: responsable || !!existente?.responsable });
            };
            (procedimiento.pasos || []).forEach(paso => agregar(paso, paso.registros));
            procedimiento.pasosPrevios.forEach(registro => agregar(registro.idProcedimientoPaso || {}, [registro]));
            procedimiento.pasosDelRol.forEach(paso => agregar(paso, paso.registros));
            const siguientes = new Map([...pasos.keys()].map(id => [id, new Set()]));
            const entradas = new Map([...pasos.keys()].map(id => [id, 0]));
            for (const secuencia of procedimiento.secuencias || []) {
                const origen = secuencia.idProcedimientoPaso?.idProcedimientoPaso;
                const destino = secuencia.idProcedimientoPasoReferencia?.idProcedimientoPaso;
                if (!pasos.has(origen) || !pasos.has(destino)) throw new Error('La secuencia del procedimiento contiene pasos desconocidos.');
                if (!siguientes.get(origen).has(destino)) {
                    siguientes.get(origen).add(destino); entradas.set(destino, entradas.get(destino) + 1);
                }
            }
            const raices = [...pasos.keys()].filter(id => entradas.get(id) === 0);
            const orden = [...raices];
            for (let i = 0; i < orden.length; i++) for (const destino of siguientes.get(orden[i])) {
                entradas.set(destino, entradas.get(destino) - 1);
                if (entradas.get(destino) === 0) orden.push(destino);
            }
            if (orden.length !== pasos.size) throw new Error('El procedimiento contiene un ciclo de secuencias.');
            const children = [], pendientes = raices.map(id => ({ id, destino: children })).reverse();
            let ocurrencia = 0;
            while (pendientes.length) {
                const { id, destino } = pendientes.pop(), paso = pasos.get(id);
                const nodo = { id: `procedimiento-${index}-nodo-${ocurrencia++}`,
                    nombre: `${paso.paso}${paso.responsable ? ' -responsable' : ''}`, responsable: paso.responsable,
                    idPaso: paso.idPaso, completado: paso.completado, children: [] };
                destino.push(nodo);
                // El grafo ya se validó sin ciclos. Una convergencia se representa
                // con ocurrencias independientes bajo cada uno de sus predecesores.
                const hijos = [...siguientes.get(id)];
                for (let i = hijos.length - 1; i >= 0; i--) pendientes.push({ id: hijos[i], destino: nodo.children });
            }
            return { id: `procedimiento-${index}`, nombre: procedimiento.idProcedimiento?.nombre || 'Procedimiento sin nombre', children };
        });
    }

    expansionAsignada(data) {
        const expandidos = [], conAsignaciones = new WeakMap();
        const pendientes = data.map(nodo => [nodo, false]);
        while (pendientes.length) {
            const [nodo, visitado] = pendientes.pop();
            const hijos = nodo.children || [];
            if (!visitado) {
                pendientes.push([nodo, true]);
                hijos.forEach(hijo => pendientes.push([hijo, false]));
                continue;
            }
            const tieneDescendientePropio = hijos.some(hijo => conAsignaciones.get(hijo));
            if (tieneDescendientePropio) expandidos.push(nodo.id);
            conAsignaciones.set(nodo, !!nodo.responsable || tieneDescendientePropio);
        }
        return expandidos;
    }

    montarConsultas(consultas) {
        const lista = this.querySelector('[data-lista]');
        const fragment = document.createDocumentFragment();
        const documentos = new Map();
        consultas.forEach(c => {
            const tarjeta = new TarjetaSimple();
            tarjeta.className = 'agenda__consulta';
            const persona = c.idPersonaRol?.idPersona;
            const titulo = document.createElement('div'); titulo.slot = 'titulo'; titulo.className = 'agenda__paciente';
            const nombre = document.createElement('h3'); nombre.className = 'agenda__paciente-nombre';
            nombre.textContent = [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ') || 'Paciente sin nombre';
            const edad = document.createElement('p'); edad.className = 'agenda__paciente-edad';
            const anios = calcularEdad(persona?.fechaNacimiento);
            edad.textContent = anios === null ? 'Edad no disponible' : `${anios} años`;
            const documento = document.createElement('p'); documento.className = 'agenda__paciente-documento';
            documento.hidden = true; documento.setAttribute('role', 'status');
            titulo.append(nombre, edad, documento);
            void this.cargarDocumento(tarjeta, documento, persona?.idPersona, documentos);
            const inicio = document.createElement('p'); inicio.className = 'agenda__consulta-fecha';
            const dia = document.createElement('span'); dia.className = 'agenda__consulta-dia';
            const hora = document.createElement('span'); hora.className = 'agenda__consulta-hora';
            const fecha = new Date(String(c.fechaInicio || '').replace(/\[.*\]$/, ''));
            if (Number.isFinite(fecha.getTime())) {
                dia.textContent = new Intl.DateTimeFormat('es-SV', { timeZone: ZONA_AGENDA, dateStyle: 'medium' }).format(fecha);
                hora.textContent = new Intl.DateTimeFormat('es-SV', { timeZone: ZONA_AGENDA, timeStyle: 'short' }).format(fecha);
            } else { dia.textContent = c.fechaInicio ? 'Fecha no válida' : 'Sin fecha'; hora.hidden = true; }
            inicio.append(dia, hora);
            inicio.setAttribute('aria-label', `Fecha de la consulta: ${dia.textContent}${hora.hidden ? '' : `, ${hora.textContent}`}`);
            titulo.append(inicio);
            const arbol = new Tree(); arbol.slot = 'contenido';
            const data = this.datosProcedimientos(c.procedimientos);
            arbol.configure({ title: 'Pasos de la consulta', data,
                labelKey: 'nombre', theme: 'light', searchable: false, guides: true, expanded: this.expansionAsignada(data),
                renderLabel: nodo => {
                    const etiqueta = document.createElement('span'); etiqueta.className = 'agenda__paso';
                    const nombre = document.createElement('span'); nombre.textContent = nodo.nombre; etiqueta.append(nombre);
                    if (nodo.responsable && nodo.idPaso) etiqueta.classList.add('agenda__paso--propio');
                    if (nodo.completado) {
                        const estado = document.createElement('span'); estado.className = 'agenda__paso-estado';
                        estado.textContent = ' Completado'; etiqueta.append(estado);
                    }
                    return etiqueta;
                },
                selection: 'single', onNodeSelect: ({ node }) => {
                    if (!node.responsable || !node.idPaso) return;
                    this.dispatchEvent(new CustomEvent('galeno-navegar', { bubbles: true, composed: true,
                        detail: { ruta: `/atencion/${encodeURIComponent(c.idConsulta)}/paso/${encodeURIComponent(node.idPaso)}` } }));
                }
            });
            this.arboles.push(arbol);
            const abrir = document.createElement('button'); abrir.type = 'button';
            abrir.slot = 'pie'; abrir.dataset.consulta = c.idConsulta; abrir.textContent = 'Abrir consulta';
            tarjeta.append(titulo, arbol, abrir); fragment.append(tarjeta);
        });
        lista.replaceChildren(fragment);
    }
    async cargarDocumento(tarjeta, linea, idPersona, documentos) {
        if (!idPersona) return;
        const version = this.version;
        const vigente = () => this.isConnected && version === this.version && this.contains(tarjeta) && tarjeta.isConnected;
        try {
            if (!documentos.has(idPersona)) documentos.set(idPersona, documentoDelPaciente(idPersona));
            const documento = await documentos.get(idPersona);
            if (!vigente()) return;
            if (documento) {
                linea.textContent = `${documento.idTipoDocumento?.nombre || 'Documento'}: ${documento.valor.trim()}`;
                linea.hidden = false;
            }
        } catch {
            if (vigente()) { linea.textContent = 'No se pudo cargar el documento'; linea.hidden = false; }
        }
    }

    async cargar() {
        const version = ++this.version;
        const boton = this.querySelector('[type="submit"]');
        boton.disabled = true;
        const estado = this.querySelector('[role="status"]');
        estado.textContent = 'Cargando agenda…';
        this.destruirArboles();
        this.querySelector('[data-lista]').replaceChildren();
        try {
            const consultas = await cargarAgenda(this.usuario, this.querySelector('[name="desde"]').value, this.querySelector('[name="hasta"]').value);
            if (!this.isConnected || version !== this.version) return;
            estado.textContent = consultas.length ? `${consultas.length} ${consultas.length === 1 ? 'consulta con pasos' : 'consultas con pasos'} de tu rol` : 'No hay consultas con pasos de tu rol en este rango';
            this.montarConsultas(consultas);
        } catch (e) { if (this.isConnected && version === this.version) estado.textContent = e.message || e.mensaje; }
        finally { if (this.isConnected && version === this.version) boton.disabled = false; }
    }
}
customElements.define('galeno-agenda', Agenda);
