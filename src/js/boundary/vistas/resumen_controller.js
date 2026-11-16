import "../componentes/selector_contexto.js";
import "../componentes/agenda.js";
/**
 * Inicio del personal: contexto laboral y consultas por rol.
 * Uso: <resumen-controller>, con la propiedad `usuario` asignada antes de conectarlo.
 */
class ResumenController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;   // persona_rol de la sesión
    }

    connectedCallback() {
        this.cargar();
    }

    cargar() {
        this.montarAgenda();
    }
    montarAgenda() {
        const selector = document.createElement('galeno-selector-contexto');
        selector.usuario = this.usuario;
        const agenda = document.createElement('galeno-agenda');
        agenda.usuario = this.usuario;
        this.replaceChildren(selector, agenda);
    }
}

customElements.define("resumen-controller", ResumenController);
export default ResumenController;