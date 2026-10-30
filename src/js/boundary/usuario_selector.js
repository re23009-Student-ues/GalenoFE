import PersonaRolService from "../control/personaRol_service.js";

class UsuarioSelector extends HTMLElement {
    constructor() {
        super();
        this.service = new PersonaRolService();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        const actual = sessionStorage.getItem("idPersonaRol")
            ?? "2ffb465a-859c-4416-ae4c-db2234b86fdf";
        const select = document.createElement("select");

        this.service.findRange(0, 10).then(resp => {
            resp.datos
                .filter(pr => pr.idRol?.nombre === "Paciente")
                .forEach(pr => {
                    const op = document.createElement("option");
                    op.value = pr.idPersonaRol;
                    op.textContent = `${pr.idPersona?.nombres} ${pr.idPersona?.apellidos}`;
                    op.selected = pr.idPersonaRol === actual;
                    select.appendChild(op);
                });
        }).catch(err => console.error(err));

        select.addEventListener("change", () => {
            sessionStorage.setItem("idPersonaRol", select.value);
            location.reload();
        });

        this.root.appendChild(select);
    }
}
export default UsuarioSelector;
customElements.define("usuario-selector", UsuarioSelector);