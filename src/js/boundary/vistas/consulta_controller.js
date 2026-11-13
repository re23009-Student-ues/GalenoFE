import TarjetaConsulta from "../componentes/tarjeta_consulta.js";
import { listarConsultas } from "../../control/resumen_service.js";
import ConsultaProcedimientoPasoService from '../../control/consultaProcedimientoPaso_service.js';
import { leer } from "../../control/agenda_service.js";
import { esc } from "../util_html.js";

/**
 * Pantalla "Agenda Médica": una <tarjeta-consulta> por cada consulta visible
 * para el usuario (las de su clínica; si es paciente, solo las suyas).
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
                lista = [consulta];
            } else lista = await listarConsultas(this.usuario);
            if (!this.isConnected) return;
            pasos = await new ConsultaProcedimientoPasoService().listarParaConsultas(lista.map(consulta => consulta.idConsulta));
        } catch (err) {
            console.error(err);
            if (!this.isConnected) return;
            this.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? err.message ?? 'No se pudieron cargar las consultas')}.</p>`;
            return;
        }
        if (!this.isConnected) return;   // el usuario ya cambió de pantalla

        if (!lista.length) {
            this.innerHTML = `<p class="aviso">Aún no hay consultas registradas</p>`;
            return;
        }

        const tarjetas = document.createElement("div");
        tarjetas.className = "lista-consultas";
        const porConsulta = new Map(lista.map(consulta => [consulta.idConsulta, []]));
        for (const paso of pasos) {
            porConsulta.get(paso.idConsultaProcedimiento?.idConsulta?.idConsulta)?.push(paso);
        }
        lista.forEach(consulta => {
            const tarjeta = new TarjetaConsulta();
            tarjeta.consulta = consulta;
            tarjeta.pasos = porConsulta.get(consulta.idConsulta);
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
