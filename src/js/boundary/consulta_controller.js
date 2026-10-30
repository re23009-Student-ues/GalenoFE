import TarjetaConsulta from "./componentes/tarjeta_consulta.js";
import ConsultaService from "../control/consulta_service.js";
import { parseFecha } from "../control/fechas.js";
class ConsultaController extends HTMLElement{
    constructor() {
    super();
    this.registros = [];
    this.consultaService = new ConsultaService();
    this.root = this.attachShadow({ mode: "open" });
}

connectedCallback() {
    // Temporal: luego vendrá de la pantalla de ingreso
    const idPersonaRol = sessionStorage.getItem("idPersonaRol")
        ?? "2ffb465a-859c-4416-ae4c-db2234b86fdf";

    this.consultaService.findRange(0, 10).then(resp => {
        resp.datos
            .filter(c => c.idPersonaRol?.idPersonaRol === idPersonaRol)
            .sort((a, b) => parseFecha(b.fechaInicio) - parseFecha(a.fechaInicio))
            .forEach(consulta => {
                let tarjeta = new TarjetaConsulta();
                tarjeta.consulta = consulta;
                this.root.appendChild(tarjeta);
            });
    }).catch(err => console.error(err));
}
}
export default ConsultaController;
customElements.define("consulta-controller",ConsultaController);