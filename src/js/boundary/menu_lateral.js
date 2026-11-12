import { esPaciente } from "../control/roles.js";

/**
 * Barra lateral: menú hamburguesa en móvil, clics de navegación y ítem activo.
 * @param {Object} opciones
 * @param {function(string): void} opciones.onNavegar se llama con la ruta (data-route) del enlace pulsado
 * @returns {{marcarActiva: Function, cerrar: Function, configurarUsuario: Function, destruir: Function}}
 */
export function iniciarMenu({ onNavegar, raiz = document }) {
    const sidebar = raiz.querySelector('.sidebar');
    const btnMenu = raiz.querySelector('#btn-menu-movil');
    const menuLateral = raiz.querySelector('#menu-lateral');

    const enlaces = [...(menuLateral?.querySelectorAll('a[data-route]') ?? [])].map(enlace => ({ enlace, texto: enlace.textContent }));

    const configurarUsuario = usuario => {
        const paciente = esPaciente(usuario);
        const titulos = { '/dashboard': 'Mi inicio', '/consultas': 'Mis consultas' };
        enlaces.forEach(({ enlace, texto }) => {
            const titulo = titulos[enlace.dataset.route];
            enlace.hidden = paciente && !titulo;
            enlace.textContent = paciente && titulo ? titulo : texto;
        });
    };

    const cerrar = () => sidebar?.classList.remove('abierta');

    const marcarActiva = (ruta) => {
        raiz.querySelectorAll('#menu-lateral a').forEach(a =>
            a.classList.toggle('activo', a.getAttribute('data-route') === ruta));
    };

    const alternar = e => {
        e.stopPropagation();
        sidebar?.classList.toggle('abierta');
    };
    const alPulsarFuera = e => {
        if (sidebar?.classList.contains('abierta') && !sidebar.contains(e.target)) cerrar();
    };
    btnMenu?.addEventListener('click', alternar);
    document.addEventListener('click', alPulsarFuera);

    // Clics en los enlaces del menú
    const alNavegar = e => {
        if (e.target.tagName !== 'A' || e.target.hidden) return;
        e.preventDefault();

        const ruta = e.target.getAttribute('data-route');
        marcarActiva(ruta);
        if (window.innerWidth <= 768) cerrar();
        onNavegar(ruta);
    };
    menuLateral?.addEventListener('click', alNavegar);

    const destruir = () => {
        btnMenu?.removeEventListener('click', alternar);
        document.removeEventListener('click', alPulsarFuera);
        menuLateral?.removeEventListener('click', alNavegar);
    };
    return { marcarActiva, cerrar, configurarUsuario, destruir };
}

class GalenoMenu extends HTMLElement {
    static get observedAttributes() { return ['ruta']; }

    connectedCallback() {
        this.innerHTML = `<aside class="sidebar">
            <div class="sidebar-header"><img class="sidebar-logo" src="Recursos/imagenes/logo-menu-marino.png" alt="GalenoSV · Tu salud, nuestra prioridad" /></div>
            <nav id="menu-lateral">
                <a href="#/dashboard" data-route="/dashboard">Inicio</a>
                <a href="#/personas" data-route="/personas">Gestión de Personas</a>
                <a href="#/consultas" data-route="/consultas">Agenda Médica</a>
                <a href="#/procedimientos" data-route="/procedimientos">Atención y Procedimientos</a>
                <a href="#/laboratorio" data-route="/laboratorio">Laboratorio</a>
                <a href="#/configuracion" data-route="/configuracion" class="btn-config">Configuración</a>
            </nav></aside>`;
        this.controles = iniciarMenu({ raiz: this, onNavegar: ruta => {
            this.dispatchEvent(new CustomEvent('galeno-navegar', { detail: { ruta }, bubbles: true, composed: true }));
        } });
        this.controles.configurarUsuario(this.usuario);
        this.controles.marcarActiva(this.getAttribute('ruta'));
    }

    disconnectedCallback() { this.controles?.destruir(); }
    attributeChangedCallback() { this.controles?.marcarActiva(this.getAttribute('ruta')); }
    set usuario(valor) {
        this._usuario = valor;
        this.controles?.configurarUsuario(valor);
    }
    get usuario() { return this._usuario; }
    cerrar() { this.controles?.cerrar(); }
    alternar() { this.querySelector('.sidebar')?.classList.toggle('abierta'); }
}
customElements.define('galeno-menu', GalenoMenu);
