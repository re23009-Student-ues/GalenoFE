// Cada ruta apunta al controller (custom element) que dibuja esa pantalla.
// Una ruta sin `tag` todavía no tiene pantalla y muestra "en construcción".
import "./boundary/vistas/resumen_controller.js";
import "./boundary/vistas/consulta_controller.js";

const rutas = {
    '/inicio': { titulo: 'Resumen', tag: 'resumen-controller' },
    '/personas': { titulo: 'Gestión de Personas' },
    '/consultas': { titulo: 'Agenda Médica', tag: 'consulta-controller' },
    '/procedimientos': { titulo: 'Atención y Procedimientos' },
    '/laboratorio': { titulo: 'Laboratorio' },
    '/configuracion': { titulo: 'Configuración' }
};

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.contenedor donde se muestra la pantalla
 * @param {HTMLElement} opciones.tituloEl elemento con el título de la página
 * @param {function(): Object|null} opciones.obtenerUsuario usuario de la sesión actual
 */
export function crearRouter({ contenedor, tituloEl, obtenerUsuario }) {

    function manejarRuta(ruta) {
        const { titulo, tag } = rutas[ruta] ?? rutas['/inicio'];
        tituloEl.textContent = titulo;

        // replaceChildren desconecta el controller anterior (su disconnectedCallback limpia lo suyo)
        if (!tag) {
            const aviso = document.createElement('p');
            aviso.className = 'aviso';
            aviso.textContent = 'Esta pantalla está en construcción.';
            contenedor.replaceChildren(aviso);
            return;
        }

        const pantalla = document.createElement(tag);
        pantalla.usuario = obtenerUsuario();   // el controller lo lee al conectarse
        contenedor.replaceChildren(pantalla);
    }

    function navegarA(ruta) {
        window.history.pushState({}, '', ruta);
        manejarRuta(ruta);
    }

    /** Vacía la pantalla (p. ej. al cerrar sesión). */
    function detener() {
        contenedor.replaceChildren();
    }

    return { navegarA, manejarRuta, detener };
}