import tarjetaConsulta from './tarjeta_simple.js';
import consulta from '../../entity/consulta.js';
import { formatoFecha, estadoConsulta } from "../../control/fechas.js";
class TarjetaConsulta extends HTMLElement {
    constructor() {
    super();
    this.tarjeta = new tarjetaConsulta();
    this.consulta = new consulta();
    this.root = this.attachShadow({ mode: "open" });
}

    connectedCallback() {
        //<p slot="titulo"></p>
        let titulo=document.createElement("p");
        titulo.setAttribute("slot","titulo");
        //remplazar el idConsulta por informacion importante
        titulo.textContent = formatoFecha(this.consulta.fechaInicio);
        
        let contenido=document.createElement("p");
        contenido.setAttribute("slot","contenido");
       contenido.textContent = `${this.consulta.idPersonaRol?.idClinica?.nombre ?? ""} · ${estadoConsulta(this.consulta)}`;

        //TODO: footer

        this.tarjeta.appendChild(titulo);
        this.tarjeta.appendChild(contenido);


        this.root.appendChild(this.tarjeta);
    }

}

export default TarjetaConsulta;
customElements.define("tarjeta-consulta", TarjetaConsulta);
