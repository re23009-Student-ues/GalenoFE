class InstaladorApp extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.eventoInstalacion = null;   // aquí se guarda el evento pospuesto
        this.boton = null;
    }

    connectedCallback() {
        this.boton = document.createElement("button");
        this.boton.type = "button";
        this.boton.textContent = "Instalar app";
        this.boton.hidden = true;        // oculto hasta que llegue el evento
        this.boton.addEventListener("click", () => this.instalar());
        this.root.appendChild(this.boton);

        window.addEventListener("beforeinstallprompt", this.alOfrecerInstalacion);
        window.addEventListener("appinstalled", this.alInstalar);
    }

    disconnectedCallback() {
        window.removeEventListener("beforeinstallprompt", this.alOfrecerInstalacion);
        window.removeEventListener("appinstalled", this.alInstalar);
    }

    alOfrecerInstalacion = (evento) => {
        evento.preventDefault();         // evita el aviso automático
        this.eventoInstalacion = evento; // lo guardamos para usarlo después
        this.boton.hidden = false;
    };

    alInstalar = () => {
        this.eventoInstalacion = null;
        this.boton.hidden = true;
    };

    async instalar() {
        if (!this.eventoInstalacion) return;
        this.eventoInstalacion.prompt();
        await this.eventoInstalacion.userChoice;   // { outcome: "accepted" | "dismissed" }
        this.eventoInstalacion = null;             // el evento solo sirve una vez
        this.boton.hidden = true;
    }
}
customElements.define("instalador-app", InstaladorApp);
export default InstaladorApp;