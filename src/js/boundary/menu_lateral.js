/**
 * Barra lateral: menú hamburguesa en móvil, clics de navegación y ítem activo.
 * @param {Object} opciones
 * @param {function(string): void} opciones.onNavegar se llama con la ruta (data-route) del enlace pulsado
 * @returns {{marcarActiva: Function, cerrar: Function, destruir: Function}}
 */
function iniciarMenu({ sidebar, menuLateral, onNavegar }) {
    const cerrar = () => sidebar?.classList.remove('abierta');

    const marcarActiva = (ruta) => {
        menuLateral.querySelectorAll('a').forEach(a =>
            a.classList.toggle('activo', a.getAttribute('data-route') === ruta));
    };

    const alPulsarFuera = e => {
        if (sidebar?.classList.contains('abierta') && !sidebar.contains(e.target)) cerrar();
    };
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
        document.removeEventListener('click', alPulsarFuera);
        menuLateral?.removeEventListener('click', alNavegar);
    };
    return { marcarActiva, cerrar, destruir };
}

class GalenoMenu extends HTMLElement {
    static get observedAttributes() { return ['ruta']; }

    connectedCallback() {
        const sidebar = document.createElement('aside');
        sidebar.className = 'sidebar';
        const encabezado = document.createElement('div');
        encabezado.className = 'sidebar-header';
        const logo = document.createElement('img');
        logo.className = 'sidebar-logo';
        logo.src = 'Recursos/imagenes/logo-menu-marino.png';
        logo.alt = 'GalenoSV · Tu salud, nuestra prioridad';
        encabezado.append(logo);

        const menuLateral = document.createElement('nav');
        menuLateral.id = 'menu-lateral';
        for (const [ruta, texto] of [['/dashboard', 'Inicio'], ['/consultas', 'Agenda Médica']]) {
            const enlace = document.createElement('a');
            enlace.setAttribute('href', `#${ruta}`);
            enlace.dataset.route = ruta;
            enlace.textContent = texto;
            menuLateral.append(enlace);
        }
        sidebar.append(encabezado, menuLateral);
        this.replaceChildren(sidebar);

        this.controles = iniciarMenu({ sidebar, menuLateral, onNavegar: ruta => {
            this.dispatchEvent(new CustomEvent('galeno-navegar', { detail: { ruta }, bubbles: true, composed: true }));
        } });
        this.controles.marcarActiva(this.getAttribute('ruta'));
    }

    disconnectedCallback() { this.controles?.destruir(); }
    attributeChangedCallback() { this.controles?.marcarActiva(this.getAttribute('ruta')); }
    cerrar() { this.controles?.cerrar(); }
    alternar() { this.querySelector('.sidebar')?.classList.toggle('abierta'); }
}
customElements.define('galeno-menu', GalenoMenu);
