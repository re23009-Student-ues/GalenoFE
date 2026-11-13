// Cada ruta apunta al controller (custom element) que dibuja esa pantalla.
// Una ruta sin `tag` todavía no tiene pantalla y muestra "en construcción".
import "./boundary/vistas/resumen_controller.js";
import "./boundary/vistas/citas_controller.js";
import "./boundary/vistas/consulta_controller.js";
import "./boundary/vistas/atencion_controller.js";

const rutasPublicas = {
    '/login': { titulo: 'Iniciar sesión', publica: true },
    '/citas': { titulo: 'Búsqueda de citas', publica: true, tag: 'galeno-citas' }
};

const rutas = {
    '/dashboard': { publica: false, titulo: 'Resumen', tag: 'resumen-controller' },
    '/consulta/:idConsulta': { publica: false, titulo: 'Consulta', tag: 'consulta-controller' },
    '/consultas': { publica: false, titulo: 'Agenda Médica', tag: 'consulta-controller' },
    '/atencion': { publica: false, titulo: 'Atención y Procedimientos', tag: 'atencion-controller' },
    '/atencion/:idConsulta': { publica: false, titulo: 'Atención y Procedimientos', tag: 'atencion-controller' }
};

/**
 * @param {Object} opciones
 * @param {HTMLElement} opciones.contenedor donde se muestra la pantalla
 * @param {HTMLElement} opciones.tituloEl elemento con el título de la página
 * @param {function(): Object|null} opciones.obtenerUsuario usuario de la sesión actual
 * @param {function(): void} [opciones.alRequerirLogin] solicita mostrar el login sin sesión
 */
export function crearRouter({ contenedor, tituloEl, obtenerUsuario, alRequerirLogin }) {

    let activo = false;
    let pendiente = null;
    let loginNotificado = false;

    function resolver(ruta, usuario) {
        const disponibles = { ...rutasPublicas, ...rutas };
        for (const [patron, configuracion] of Object.entries(disponibles)) {
            const nombres = [];
            const expresion = patron.replace(/:([^/]+)/g, (_, nombre) => {
                nombres.push(nombre);
                return '([^/]+)';
            });
            const coincidencia = ruta.match(new RegExp(`^${expresion}$`));
            if (!coincidencia) continue;
            try {
                const parametros = Object.fromEntries(nombres.map((nombre, i) =>
                    [nombre, decodeURIComponent(coincidencia[i + 1])]));
                return { ...configuracion, parametros, ruta };
            } catch {
                break; // Un parámetro mal codificado se trata como ruta desconocida.
            }
        }
        const porDefecto = usuario ? '/dashboard' : '/citas';
        return { ...disponibles[porDefecto], parametros: {}, ruta: porDefecto };
    }

    function manejarRuta(ruta = window.location.hash.slice(1)) {
        const usuario = obtenerUsuario();
        const destino = resolver(ruta || (usuario ? '/dashboard' : '/citas'), usuario);
        if (!destino.publica && !usuario) {
            pendiente = destino.ruta;
            loginNotificado = false;
            window.location.hash = '/login';
            return manejarRuta('/login');
        }
        if (window.location.hash !== `#${destino.ruta}`) window.location.hash = destino.ruta;
        const { titulo, tag, parametros } = destino;
        tituloEl.textContent = titulo;

        if (destino.ruta === '/login') {
            contenedor.replaceChildren();
            if (!usuario && !loginNotificado) {
                loginNotificado = true;
                alRequerirLogin?.();
            }
            return;
        }
        loginNotificado = false;

        // replaceChildren desconecta el controller anterior (su disconnectedCallback limpia lo suyo)
        if (!tag) {
            const aviso = document.createElement('p');
            aviso.className = 'aviso';
            aviso.textContent = 'Esta pantalla está en construcción.';
            contenedor.replaceChildren(aviso);
            return;
        }

        const pantalla = document.createElement(tag);
        pantalla.parametros = parametros;
        pantalla.usuario = usuario;   // el controller lo lee al conectarse
        if (tag === 'atencion-controller') {
            pantalla.idConsulta = parametros.idConsulta;
            pantalla.addEventListener('volver-consultas', () => navegarA('/consultas'));
        }
        if (tag === 'consulta-controller') pantalla.addEventListener('abrir-atencion', evento => {
            const id = evento.detail?.idConsulta;
            if (id !== null && id !== undefined && String(id).trim()) navegarA(`/atencion/${encodeURIComponent(id)}`);
        });
        contenedor.replaceChildren(pantalla);
    }

    function navegarA(ruta) {
        if (window.location.hash === `#${ruta}`) manejarRuta(ruta);
        else window.location.hash = ruta;
    }

    function alCambiarHash() {
        manejarRuta();
    }

    /** Activa la navegación y respeta la dirección actual. */
    function iniciar() {
        if (!activo) window.addEventListener('hashchange', alCambiarHash);
        activo = true;
        manejarRuta();
    }

    /** Vacía la pantalla (p. ej. al cerrar sesión). */
    function detener() {
        window.removeEventListener('hashchange', alCambiarHash);
        activo = false;
        contenedor.replaceChildren();
        pendiente = null;
        loginNotificado = false;
    }

    /** Consume la ruta solicitada antes del login. */
    function tomarPendiente(porDefecto = '/dashboard') {
        const ruta = pendiente ?? porDefecto;
        pendiente = null;
        return ruta;
    }


    return { iniciar, navegarA, manejarRuta, detener, tomarPendiente };
}
