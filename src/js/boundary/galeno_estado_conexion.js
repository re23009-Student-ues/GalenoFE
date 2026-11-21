import { leer } from '../control/agenda_service.js';
import { sinConexionAlServidor } from '../control/transporte_rest.js';

class GalenoEstadoConexion extends HTMLElement {
    connectedCallback() {
        if (!this.boton) {
            const icono = document.createElement('span');
            icono.className = 'conexion-icono';
            icono.setAttribute('aria-hidden', 'true');
            icono.textContent = '!';
            this.mensaje = document.createElement('p');
            this.mensaje.setAttribute('role', 'status');
            this.boton = document.createElement('button');
            this.boton.type = 'button';
            this.boton.textContent = 'Reintentar';
            this.boton.addEventListener('click', this.reintentar);
            this.append(icono, this.mensaje, this.boton);
        }
        this.actualizar();
        window.addEventListener('online', this.actualizar);
        window.addEventListener('offline', this.actualizar);
        window.addEventListener('galeno-conexion-rest', this.actualizar);
    }

    disconnectedCallback() {
        window.removeEventListener('online', this.actualizar);
        window.removeEventListener('offline', this.actualizar);
        window.removeEventListener('galeno-conexion-rest', this.actualizar);
    }

    get reintentoCatalogo() { return this._reintentoCatalogo; }

    set reintentoCatalogo(reintento) {
        this._reintentoCatalogo = reintento;
        if (this.boton) this.actualizar();
    }

    reintentar = async () => {
        if (this.boton.disabled) return;
        this.boton.disabled = true;
        this.actualizar();
        try {
            if (this.reintentoCatalogo) {
                await this.reintentoCatalogo();
            } else {
                const respuesta = await leer('tipo_documento?activo=true&first=0&max=1');
                await respuesta.json();
            }
        } catch {
            // El transporte actualiza el estado de conexión cuando falla la red.
        } finally {
            this.boton.disabled = false;
            this.actualizar();
        }
    };

    actualizar = () => {
        const sinInternet = navigator.onLine === false;
        this.hidden = !this.boton.disabled && !sinInternet && !sinConexionAlServidor() && !this.reintentoCatalogo;
        this.mensaje.textContent = this.hidden ? '' : this.boton.disabled
            ? 'Comprobando la conexión…'
            : sinInternet ? 'No hay conexión a internet.'
            : sinConexionAlServidor() ? 'No hay conexión con el servidor.'
            : 'No se pudieron cargar los tipos de documento.';
    };
}
customElements.define('galeno-estado-conexion', GalenoEstadoConexion);
