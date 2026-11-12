class InstaladorApp extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.eventoInstalacion = null;   // aquí se guarda el evento pospuesto
        this.boton = null;
        this.instalada = false;
        this.instalando = false;
    }

    connectedCallback() {
        if (!this.boton) {
            const estilo = document.createElement('link');
            estilo.rel = 'stylesheet';
            estilo.href = new URL('../../../Recursos/estilos/instalador.css', import.meta.url).href;
            this.boton = document.createElement("button");
            this.boton.type = "button";
            this.boton.textContent = "Instalar";
            this.boton.setAttribute('aria-label', 'Instalar GalenoSV');
            this.boton.addEventListener("click", () => this.instalar());
            this.root.append(estilo, this.boton);
        }
        this.modoStandalone = window.matchMedia('(display-mode: standalone)');
        this.modoStandalone.addEventListener('change', this.actualizar);
        this.actualizar();

        window.addEventListener("beforeinstallprompt", this.alOfrecerInstalacion);
        window.addEventListener("appinstalled", this.alInstalar);
    }

    disconnectedCallback() {
        window.removeEventListener("beforeinstallprompt", this.alOfrecerInstalacion);
        window.removeEventListener("appinstalled", this.alInstalar);
        this.modoStandalone?.removeEventListener('change', this.actualizar);
    }

    alOfrecerInstalacion = (evento) => {
        evento.preventDefault();         // evita el aviso automático
        if (this.instalada || this.modoStandalone.matches) return;
        this.eventoInstalacion = evento; // lo guardamos para usarlo después
        this.actualizar();
    };

    alInstalar = () => {
        this.instalada = true;
        this.eventoInstalacion = null;
        this.actualizar();
    };

    actualizar = () => {
        this.hidden = !this.eventoInstalacion || this.instalada || this.instalando || this.modoStandalone.matches;
        this.boton.hidden = this.hidden;
    };

    async instalar() {
        if (!this.eventoInstalacion || this.instalada || this.instalando || this.modoStandalone.matches) return;
        const evento = this.eventoInstalacion;
        this.instalando = true;
        this.actualizar();
        try {
            await evento.prompt();
            await evento.userChoice;   // { outcome: "accepted" | "dismissed" }
        } catch (error) {
            console.warn('No se pudo mostrar la instalación:', error);
        } finally {
            this.eventoInstalacion = null; // el evento solo sirve una vez
            this.instalando = false;
            this.actualizar();
        }
    }
}
customElements.define("instalador-app", InstaladorApp);
export default InstaladorApp;
