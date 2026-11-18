import TarjetaConsulta from "../componentes/tarjeta_consulta.js";
import ConsultaProcedimientoPasoService from '../../control/consultaProcedimientoPaso_service.js';
import { leer, filtrarConsultasPorRol, listarConsultasDelRol } from "../../control/agenda_service.js";
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

    async cargar() {
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
            if (!this.isConnected) return;
            pasos = await new ConsultaProcedimientoPasoService().listarParaConsultas(lista.map(consulta => consulta.idConsulta));
        } catch (err) {
            console.error(err);
            if (!this.isConnected) return;
            this.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? err.message ?? 'No se pudieron cargar las consultas')}.</p>`;
            return;
        }
        if (!this.isConnected) return;   // el usuario ya cambió de pantalla

        const asignadas = new Set(pasos.filter(paso => this.usuario?.idPersonaRol &&
            paso.idPersonaRol?.idPersonaRol === this.usuario.idPersonaRol &&
            String(paso.estado ?? '').trim().toUpperCase() !== 'INVALIDO')
            .map(paso => paso.idConsultaProcedimiento?.idConsulta?.idConsulta));
        lista = lista.filter(consulta => asignadas.has(consulta.idConsulta));

        if (!lista.length) {
            this.innerHTML = `<p class="aviso">No hay consultas con pasos asignados a tu contexto activo en esta clínica</p>`;
            return;
        }

        const tarjetas = document.createElement("div");
        tarjetas.className = "lista-consultas";
        const porConsulta = new Map(lista.map(consulta => [consulta.idConsulta, []]));
        pasos.forEach(paso => porConsulta.get(paso.idConsultaProcedimiento?.idConsulta?.idConsulta)?.push(paso));
        lista.forEach(consulta => {
            const tarjeta = new TarjetaConsulta();
            tarjeta.consulta = consulta;
            tarjeta.pasos = porConsulta.get(consulta.idConsulta);
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
            tarjetas.appendChild(registro);
        });
        this.replaceChildren(tarjetas);
    }
}

customElements.define("consulta-controller", ConsultaController);
export default ConsultaController;
