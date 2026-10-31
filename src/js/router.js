import { montarResumen } from "./boundary/vistas/resumen.js";
import { montarConsultas } from "./boundary/vistas/consultas.js";
import {
    montarPersonas,
    montarProcedimientos,
    montarLaboratorio,
    montarConfiguracion
} from "./boundary/vistas/pendientes.js";

/**
 * Cada ruta apunta a una vista. Una vista es una función
 * montar(contenedor, usuario, esVigente) que dibuja en el contenedor y,
 * si necesita limpiar algo al salir (una gráfica, un listener), devuelve
 * una función de limpieza. Puede ser async.
 */
const rutas = {
    '/inicio': { titulo: 'Resumen', montar: montarResumen },
    '/personas': { titulo: 'Gestión de Personas', montar: montarPersonas },
    '/consultas': { titulo: 'Agenda Médica', montar: montarConsultas },
    '/procedimientos': { titulo: 'Atención y Procedimientos', montar: montarProcedimientos },
    '/laboratorio': { titulo: 'Laboratorio', montar: montarLaboratorio },
    '/configuracion': { titulo: 'Configuración', montar: montarConfiguracion }
};

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.contenedor donde se dibujan las vistas
 * @param {HTMLElement} opciones.tituloEl elemento con el título de la página
 * @param {function(): Object|null} opciones.obtenerUsuario usuario de la sesión actual
 */
export function crearRouter({ contenedor, tituloEl, obtenerUsuario }) {
    let version = 0;      // cada cambio de vista la incrementa
    let limpiar = null;   // limpieza de la vista que está en pantalla

    function salirDeLaVistaActual() {
        if (limpiar) {
            limpiar();
            limpiar = null;
        }
    }

    async function manejarRuta(ruta) {
        const { titulo, montar } = rutas[ruta] ?? rutas['/inicio'];
        const miVersion = ++version;
        // Las vistas lo consultan después de cada await: si el usuario
        // ya cambió de pantalla, no deben escribir en el contenedor
        const esVigente = () => miVersion === version;

        salirDeLaVistaActual();
        tituloEl.textContent = titulo;
        contenedor.innerHTML = '';

        try {
            const limpieza = await montar(contenedor, obtenerUsuario(), esVigente);
            if (typeof limpieza !== 'function') return;
            if (esVigente()) limpiar = limpieza;
            else limpieza();   // la vista ya no está en pantalla
        } catch (err) {
            console.error(err);
            if (esVigente()) contenedor.textContent = 'No se pudo cargar esta pantalla.';
        }
    }

    function navegarA(ruta) {
        window.history.pushState({}, '', ruta);
        return manejarRuta(ruta);
    }

    /** Vacía la pantalla y descarta cualquier carga pendiente (p. ej. al cerrar sesión). */
    function detener() {
        version++;
        salirDeLaVistaActual();
        contenedor.innerHTML = '';
    }

    return { navegarA, manejarRuta, detener };
}