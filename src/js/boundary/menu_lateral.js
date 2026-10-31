/**
 * Barra lateral: menú hamburguesa en móvil, clics de navegación y ítem activo.
 * @param {Object} opciones
 * @param {function(string): void} opciones.onNavegar se llama con la ruta (data-route) del enlace pulsado
 * @returns {{marcarActiva: function(string): void, cerrar: function(): void}}
 */
export function iniciarMenu({ onNavegar }) {
    const sidebar = document.querySelector('.sidebar');
    const btnMenu = document.getElementById('btn-menu-movil');
    const menuLateral = document.getElementById('menu-lateral');

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
            if (e.target.tagName !== 'A') return;
            e.preventDefault();

            const ruta = e.target.getAttribute('data-route');
            marcarActiva(ruta);
            if (window.innerWidth <= 768) cerrar();
            onNavegar(ruta);
        });
    }

    return { marcarActiva, cerrar };
}