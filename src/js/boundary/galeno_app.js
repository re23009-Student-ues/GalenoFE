import './menu_lateral.js';
import './topbar.js';
import './galeno_outlet.js';
import './galeno_estado_conexion.js';
import './login.js';
import { obtenerSesion } from '../control/sesion_service.js';

class GalenoApp extends HTMLElement {
    connectedCallback() {
        this.toggleAttribute('restaurando', Boolean(obtenerSesion()));
        if (!this.outlet) {
            this.montarShell();
            this.addEventListener('galeno-alternar-menu', () => this.menu?.alternar());
            this.addEventListener('galeno-login-exitoso', () => this.ocultarLogin());
        }
        this.usuario = this._usuario ?? null;
    }

    montarShell() {
        const contenedor = document.createElement('div');
        contenedor.className = 'contenedor-app';
        const principal = document.createElement('main');
        principal.className = 'contenido-principal';
        const topbar = document.createElement('galeno-topbar');
        const conexion = document.createElement('galeno-estado-conexion');
        const outlet = document.createElement('galeno-outlet');
        outlet.id = 'app-root';
        const pie = document.createElement('footer');
        pie.className = 'pie';
        pie.textContent = 'Galenos · Gestión clínica';
        principal.append(topbar, conexion, outlet, pie);
        contenedor.append(principal);

        const pantalla = document.createElement('div');
        pantalla.id = 'pantalla-login';
        pantalla.className = 'pantalla-login';
        pantalla.hidden = true;
        this.replaceChildren(contenedor, pantalla);
    }

    get outlet() { return this.querySelector('galeno-outlet'); }
    disconnectedCallback() { this.dispatchEvent(new CustomEvent('galeno-desconectar')); }
    get topbar() { return this.querySelector('galeno-topbar'); }
    get instalador() { return this.topbar?.querySelector('instalador-app'); }
    get tituloEl() { return this.topbar?.tituloEl; }
    get menu() { return this.querySelector('galeno-menu'); }
    get usuario() { return this._usuario; }
    set restaurando(valor) { this.toggleAttribute('restaurando', Boolean(valor)); }
    set usuario(valor) {
        this._usuario = valor;
        if (!this.outlet) return;
        this.setAttribute('modo', valor ? 'personal' : 'publico');
        if (valor) {
            if (!this.menu) this.querySelector('.contenedor-app').prepend(document.createElement('galeno-menu'));
            this.marcarActiva(window.location.hash.slice(1));
        } else {
            this.menu?.remove();
        }
        this.topbar.usuario = valor;
    }

    marcarActiva(ruta) { this.menu?.setAttribute('ruta', ruta); }
    cerrarMenu() { this.menu?.cerrar(); }

    ocultarLogin() {
        const pantalla = this.querySelector('#pantalla-login');
        pantalla.hidden = true;
        pantalla.replaceChildren();
    }

    mostrarLogin() {
        const pantalla = this.querySelector('#pantalla-login');
        pantalla.hidden = false;
        if (!pantalla.querySelector('galeno-login')) {
            pantalla.replaceChildren(document.createElement('galeno-login'));
        }
    }
}
customElements.define('galeno-app', GalenoApp);
