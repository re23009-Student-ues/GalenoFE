class GalenoEstadoConexion extends HTMLElement {
    connectedCallback() {
        this.setAttribute('role', 'status');
        this.setAttribute('aria-live', 'polite');
        this.actualizar();
        window.addEventListener('online', this.actualizar);
        window.addEventListener('offline', this.actualizar);
    }

    disconnectedCallback() {
        window.removeEventListener('online', this.actualizar);
        window.removeEventListener('offline', this.actualizar);
    }

    actualizar = () => {
        this.hidden = navigator.onLine !== false;
        this.textContent = this.hidden ? '' : 'Sin conexión: los datos visibles pueden estar desactualizados.';
    };
}
customElements.define('galeno-estado-conexion', GalenoEstadoConexion);
