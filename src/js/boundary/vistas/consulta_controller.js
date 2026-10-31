import TarjetaConsulta from "../componentes/tarjeta_consulta.js";
import { listarConsultas } from "../../control/resumen_service.js";
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
        try {
            lista = await listarConsultas(this.usuario);
        } catch (err) {
            console.error(err);
            if (!this.isConnected) return;
            this.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? 'No se pudieron cargar las consultas')}.</p>`;
            return;
        }
        if (!this.isConnected) return;   // el usuario ya cambió de pantalla

        if (!lista.length) {
            this.innerHTML = `<p class="aviso">Aún no hay consultas registradas</p>`;
            return;
        }

        const tarjetas = document.createElement("div");
        tarjetas.className = "lista-consultas";
        lista.forEach(consulta => {
            const tarjeta = new TarjetaConsulta();
            tarjeta.consulta = consulta;
            tarjetas.appendChild(tarjeta);
        });
        this.replaceChildren(tarjetas);
    }
}

customElements.define("consulta-controller", ConsultaController);
export default ConsultaController;