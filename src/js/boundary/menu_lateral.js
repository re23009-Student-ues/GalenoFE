import { esPaciente } from "../control/roles.js";

/**
 * Barra lateral: menú hamburguesa en móvil, clics de navegación y ítem activo.
 * @param {Object} opciones
 * @param {function(string): void} opciones.onNavegar se llama con la ruta (data-route) del enlace pulsado
 * @returns {{marcarActiva: function(string): void, cerrar: function(): void, configurarUsuario: function(Object): void}}
 */
export function iniciarMenu({ onNavegar }) {
    const sidebar = document.querySelector('.sidebar');
    const btnMenu = document.getElementById('btn-menu-movil');
    const menuLateral = document.getElementById('menu-lateral');

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
        document.querySelectorAll('#menu-lateral a').forEach(a =>
            a.classList.toggle('activo', a.getAttribute('data-route') === ruta));
    };

    // Menú móvil (hamburguesa)
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation(); // evita que el document lo cierre al instante
            sidebar.classList.toggle('abierta');
        });

        // Cerrar al tocar fuera del sidebar
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('abierta') && !sidebar.contains(e.target)) {
                cerrar();
            }
        });
    }

    // Clics en los enlaces del menú
    if (menuLateral) {
        menuLateral.addEventListener('click', (e) => {
            if (e.target.tagName !== 'A' || e.target.hidden) return;
            e.preventDefault();

            const ruta = e.target.getAttribute('data-route');
            marcarActiva(ruta);
            if (window.innerWidth <= 768) cerrar();
            onNavegar(ruta);
        });
    }

    return { marcarActiva, cerrar, configurarUsuario };
}