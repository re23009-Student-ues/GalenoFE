import tarjetaConsulta from './tarjeta_simple.js';
import consulta from '../../entity/consulta.js';
class TarjetaConsulta extends HTMLElement {
    constructor() {
        super();
        this.tarjetaConsulta = new tarjetaConsulta();
        this.consulta = new consulta();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        //<p slot="titulo"></p>
        let titulo=document.createElement("p");
        titulo.setAttribute("slot","titulo");
        //remplazar el idConsulta por informacion importante
        titulo.innerText=this.consulta.idConsulta;
        
        let contenido=document.createElement("p");
        contenido.setAttribute("slot","contenido");
        contenido.innerText='paciente: ${this.consulta.idPersonalRol.identificadorPersona}, Clinica: ${this.Consulta.idPersonaRol.identificarClinica}';

        //TODO: footer

        this.tarjeta.appendChild(titulo);
        this.tarjeta.appendChild(contenido);


        this.root.appendChild(this.tarjeta);
    }

}

export default TarjetaConsulta;
customElements.define("tarjeta-consulta", TarjetaConsulta);
