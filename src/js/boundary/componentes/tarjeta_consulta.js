import './tarjeta_simple.js';
import Consulta from '../../entity/consulta.js';
import { formatoFecha, estadoConsulta, estadoConsultaResponsable } from "../../control/fechas.js";

function contenidoDeSlot(etiqueta, slot, texto) {
    const elemento = document.createElement(etiqueta);
    elemento.slot = slot;
    elemento.textContent = texto;
    return elemento;
}

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
        this.tarjeta = document.createElement("tarjeta-simple");
        this.consulta = new Consulta();
        this.responsable = null; // Contexto laboral para el estado de sus asignaciones.
        this.pasos = []; // Pasos reales de esta consulta, asignados antes de conectar.
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        const c = this.consulta;
        const persona = c.idPersonaRol?.idPersona;
        const nombre = `${persona?.nombres ?? ""} ${persona?.apellidos ?? ""}`.trim();
        const estado = this.responsable ? estadoConsultaResponsable(c, this.responsable, this.pasos) :
            estadoConsulta(c, new Date(), this.pasos);

        const observaciones = contenidoDeSlot("p", "contenido", c.observaciones || "Sin observaciones");
        observaciones.className = "obs";
        const insignia = contenidoDeSlot("span", "pie", estado);
        insignia.className = `estado estado--${estado.toLowerCase().replace(" ", "-")}`;

        this.tarjeta.replaceChildren(
            contenidoDeSlot("p", "titulo", formatoFecha(c.fechaInicio)),
            contenidoDeSlot("p", "contenido", `Paciente: ${nombre || "Sin nombre"}`),
            observaciones,
            contenidoDeSlot("span", "pie", c.idPersonaRol?.idClinica?.nombre ?? ""),
            insignia
        );
        if (this.tarjeta.parentNode !== this.root) this.root.replaceChildren(this.tarjeta);
    }
}

customElements.define("tarjeta-consulta", TarjetaConsulta);
export default TarjetaConsulta;
