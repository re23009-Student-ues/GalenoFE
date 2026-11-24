import TarjetaConsulta from "../componentes/tarjeta_consulta.js";
import ConsultaProcedimientoPasoService from '../../control/consultaProcedimientoPaso_service.js';
import { leer, listarCompleto, filtrarConsultasPorRol, listarConsultasDelRol } from "../../control/agenda_service.js";
import { buscarDocumento } from '../../control/sesion_service.js';
import { crearPaginacionConsultas } from '../componentes/paginacion_consultas.js';
import { esc } from "../util_html.js";

/**
 * Pantalla "Agenda Médica": una <tarjeta-consulta> por cada consulta visible
 * con pasos asignados al contexto activo dentro de su clínica.
 * Uso: <consulta-controller>, con la propiedad `usuario` asignada antes de conectarlo.
 */
class ConsultaController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;   // persona_rol de la sesión
    }

    connectedCallback() {
        this.cargar();
    }

    disconnectedCallback() {
        this.version++;
    }

    async cargar() {
        const version = this.version = (this.version || 0) + 1;
        const vigente = () => this.isConnected && this.version === version;
        this.innerHTML = `<p class="aviso">Cargando consultas…</p>`;

        let lista;
        let pasos;
        try {
            const id = this.parametros?.idConsulta;
            if (id) {
                const consulta = await (await leer(`consulta/${encodeURIComponent(id)}`)).json();
                if (!this.usuario?.idClinica?.idClinica || consulta.idPersonaRol?.idClinica?.idClinica !== this.usuario.idClinica.idClinica) throw new Error('La consulta no pertenece a la clínica del contexto actual');
                lista = await filtrarConsultasPorRol([consulta], this.usuario);
            } else lista = await listarConsultasDelRol(this.usuario);
            if (!vigente()) return;
            pasos = await new ConsultaProcedimientoPasoService().listarParaConsultas(lista.map(consulta => consulta.idConsulta));
        } catch (err) {
            console.error(err);
            if (!vigente()) return;
            this.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? err.message ?? 'No se pudieron cargar las consultas')}.</p>`;
            return;
        }
        if (!vigente()) return;   // el usuario ya cambió de pantalla

        const asignadas = new Set(pasos.filter(paso => this.usuario?.idPersonaRol &&
            paso.idPersonaRol?.idPersonaRol === this.usuario.idPersonaRol &&
            String(paso.estado ?? '').trim().toUpperCase() !== 'INVALIDO')
            .map(paso => paso.idConsultaProcedimiento?.idConsulta?.idConsulta));
        lista = lista.filter(consulta => asignadas.has(consulta.idConsulta));

        const tarjetas = document.createElement('div');
        tarjetas.className = 'lista-consultas';
        const porConsulta = new Map(lista.map(consulta => [consulta.idConsulta, []]));
        pasos.forEach(paso => porConsulta.get(paso.idConsultaProcedimiento?.idConsulta?.idConsulta)?.push(paso));
        const paginacion = crearPaginacionConsultas(consultas => {
            tarjetas.replaceChildren(...consultas.map(consulta =>
                this.crearTarjeta(consulta, porConsulta.get(consulta.idConsulta))));
        });

        const estado = document.createElement('p');
        estado.className = 'aviso';
        estado.setAttribute('role', 'status');
        const mostrar = (consultas, vacio) => {
            estado.textContent = consultas.length ? '' : vacio;
            estado.hidden = Boolean(consultas.length);
            paginacion.mostrar(consultas);
        };
        this.replaceChildren(estado, tarjetas, paginacion.nav);
        const mostrarTodas = () => mostrar(lista, 'No hay consultas con pasos asignados a tu contexto activo en esta clínica');
        if (!this.parametros?.idConsulta && lista.length) {
            this.prepend(this.filtroDocumento(mostrarTodas, async (tipo, valor, vigente) => {
                const documento = await buscarDocumento(tipo, valor);
                if (!vigente()) return;
                const idPersona = documento?.idPersona?.idPersona;
                mostrar(idPersona ? lista.filter(c => c.idPersonaRol?.idPersona?.idPersona === idPersona) : [],
                    'No hay consultas asignadas que coincidan con el documento');
            }, estado, paginacion));
        }
        mostrarTodas();
    }

    filtroDocumento(mostrarTodas, buscar, estado, paginacion) {
        const formulario = document.createElement('form');
        formulario.className = 'agenda-panel agenda-form';
        const etiquetaTipo = document.createElement('label');
        etiquetaTipo.textContent = 'Tipo de documento';
        const tipo = document.createElement('select');
        tipo.name = 'tipo';
        tipo.required = true;
        tipo.disabled = true;
        tipo.append(new Option('Cargando…', ''));
        etiquetaTipo.append(tipo);
        const etiqueta = document.createElement('label');
        etiqueta.textContent = 'Buscar por documento';
        const documento = document.createElement('input');
        documento.type = 'search';
        documento.name = 'documento';
        documento.autocomplete = 'off';
        documento.required = true;
        documento.disabled = true;
        etiqueta.append(documento);
        const boton = document.createElement('button');
        boton.type = 'submit';
        boton.textContent = 'Buscar';
        boton.disabled = true;
        const limpiar = document.createElement('button');
        limpiar.type = 'reset';
        limpiar.textContent = 'Nueva búsqueda';
        limpiar.hidden = true;
        formulario.append(etiquetaTipo, etiqueta, boton, limpiar);
        let solicitud = 0;
        let catalogoDisponible = false;

        const cargarTipos = async () => {
            limpiar.hidden = true;
            tipo.replaceChildren(new Option('Cargando…', ''));
            try {
                const tipos = (await listarCompleto('tipo_documento?activo=true', 'idTipoDocumento'))
                    .filter(t => t.activo === true);
                if (!formulario.isConnected) return;
                tipo.replaceChildren(new Option(tipos.length ? 'Selecciona un tipo' : 'No hay tipos activos', ''),
                    ...tipos.map(t => new Option(t.nombre, t.idTipoDocumento)));
                catalogoDisponible = tipos.length > 0;
                tipo.disabled = !catalogoDisponible;
            } catch {
                if (!formulario.isConnected) return;
                tipo.replaceChildren(new Option('No se pudieron cargar los tipos', ''));
                limpiar.hidden = false;
            }
        };
        tipo.addEventListener('change', () => {
            documento.disabled = !tipo.value;
            boton.disabled = !tipo.value;
        });
        formulario.addEventListener('reset', () => {
            solicitud++;
            tipo.disabled = !catalogoDisponible;
            documento.disabled = true;
            boton.disabled = true;
            limpiar.hidden = true;
            mostrarTodas();
            if (catalogoDisponible) tipo.focus();
            else void cargarTipos();
        });
        formulario.addEventListener('submit', async evento => {
            evento.preventDefault();
            const valor = documento.value.trim();
            if (boton.disabled || !tipo.value || !valor) return;
            const actual = ++solicitud;
            const vigente = () => formulario.isConnected && actual === solicitud;
            tipo.disabled = documento.disabled = boton.disabled = true;
            limpiar.hidden = false;
            estado.hidden = false;
            estado.textContent = 'Buscando consultas…';
            paginacion.mostrar([]);
            try {
                await buscar(tipo.value, valor, vigente);
            } catch (error) {
                if (vigente()) estado.textContent = error.message || error.mensaje;
            }
        });
        void cargarTipos();
        return formulario;
    }

    crearTarjeta(consulta, pasos) {
        const tarjeta = new TarjetaConsulta();
        tarjeta.consulta = consulta;
        tarjeta.pasos = pasos;
        tarjeta.responsable = this.usuario;
        const registro = document.createElement('button');
        registro.type = 'button';
        registro.className = 'consulta__seleccionar';
        registro.setAttribute('aria-label', `Abrir atención de ${[
            consulta.idPersonaRol?.idPersona?.nombres,
            consulta.idPersonaRol?.idPersona?.apellidos
        ].filter(Boolean).join(' ') || 'paciente'}: ${consulta.idConsulta}`);
        registro.append(tarjeta);
        registro.addEventListener('click', () => this.dispatchEvent(new CustomEvent('abrir-atencion', {
            bubbles: true, detail: { idConsulta: consulta.idConsulta }
        })));
        return registro;
    }
}

customElements.define("consulta-controller", ConsultaController);
export default ConsultaController;
