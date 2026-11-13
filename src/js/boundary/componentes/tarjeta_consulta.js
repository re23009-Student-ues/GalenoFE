import TarjetaSimple from './tarjeta_simple.js';
import Consulta from '../../entity/consulta.js';
import { formatoFecha, estadoConsulta } from "../../control/fechas.js";

/**
 * Tarjeta de una consulta, construida sobre <tarjeta-simple>.
 * Uso: const t = new TarjetaConsulta(); t.consulta = unaConsulta; contenedor.appendChild(t);
 *   - titulo:    fecha de inicio
 *   - contenido: paciente y observaciones
 *   - pie:       clínica y estado
 */
class TarjetaConsulta extends HTMLElement {
    constructor() {
        super();
        this.tarjeta = new TarjetaSimple();
        this.consulta = new Consulta();
        this.pasos = []; // Pasos reales de esta consulta, asignados antes de conectar.
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        const c = this.consulta;
        const persona = c.idPersonaRol?.idPersona;
        const nombre = `${persona?.nombres ?? ""} ${persona?.apellidos ?? ""}`.trim();
        const estado = estadoConsulta(c, new Date(), this.pasos);

        const titulo = this.crearElemento("p", "titulo", formatoFecha(c.fechaInicio));
        const paciente = this.crearElemento("p", "contenido", `Paciente: ${nombre || "Sin nombre"}`);
        const observaciones = this.crearElemento("p", "contenido", c.observaciones || "Sin observaciones");
        observaciones.className = "obs";
        const clinica = this.crearElemento("span", "pie", c.idPersonaRol?.idClinica?.nombre ?? "");
        const insignia = this.crearElemento("span", "pie", estado);
        insignia.className = `estado estado--${estado.toLowerCase().replace(" ", "-")}`;

        // replaceChildren evita duplicados si el elemento se reconecta
        this.tarjeta.replaceChildren(titulo, paciente, observaciones, clinica, insignia);
        this.root.replaceChildren(this.tarjeta);
    }

    /** Crea un elemento con texto seguro (textContent) y lo asigna a un slot. */
    crearElemento(etiqueta, slot, texto) {
        const el = document.createElement(etiqueta);
        el.setAttribute("slot", slot);
        el.textContent = texto;
        return el;
    }
}

customElements.define("tarjeta-consulta", TarjetaConsulta);
export default TarjetaConsulta;
