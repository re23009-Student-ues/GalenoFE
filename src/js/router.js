// Cada ruta apunta al controller (custom element) que dibuja esa pantalla.
// Una ruta sin `tag` todavía no tiene pantalla y muestra "en construcción".
import "./boundary/vistas/resumen_controller.js";
import "./boundary/vistas/consulta_controller.js";
import "./boundary/vistas/paciente_controller.js";
import { esPaciente } from "./control/roles.js";

const rutas = {
    '/inicio': { titulo: 'Resumen', tag: 'resumen-controller' },
    '/personas': { titulo: 'Gestión de Personas' },
    '/consultas': { titulo: 'Agenda Médica', tag: 'consulta-controller' },
    '/procedimientos': { titulo: 'Atención y Procedimientos' },
    '/laboratorio': { titulo: 'Laboratorio' },
    '/configuracion': { titulo: 'Configuración' }
};

const rutasPaciente = {
    '/inicio': { titulo: 'Mi inicio', tag: 'paciente-controller', vista: 'inicio' },
    '/consultas': { titulo: 'Mis consultas', tag: 'paciente-controller', vista: 'consultas' }
};

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.contenedor donde se muestra la pantalla
 * @param {HTMLElement} opciones.tituloEl elemento con el título de la página
 * @param {function(): Object|null} opciones.obtenerUsuario usuario de la sesión actual
 */
export function crearRouter({ contenedor, tituloEl, obtenerUsuario }) {

    function manejarRuta(ruta) {
        const usuario = obtenerUsuario();
        const disponibles = esPaciente(usuario) ? rutasPaciente : rutas;
        const { titulo, tag, vista } = disponibles[ruta] ?? disponibles['/inicio'];
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
        pantalla.vista = vista;
        pantalla.usuario = usuario;   // el controller lo lee al conectarse
        contenedor.replaceChildren(pantalla);
    }

    function navegarA(ruta) {
        const disponibles = esPaciente(obtenerUsuario()) ? rutasPaciente : rutas;
        const destino = disponibles[ruta] ? ruta : '/inicio';
        window.history.pushState({}, '', destino);
        manejarRuta(destino);
    }

    /** Vacía la pantalla (p. ej. al cerrar sesión). */
    function detener() {
        contenedor.replaceChildren();
    }

    return { navegarA, manejarRuta, detener };
}