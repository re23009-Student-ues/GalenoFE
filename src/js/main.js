import { obtenerSesion, rolesDePersona, establecerContexto, obtenerContexto, cerrarSesion } from "./control/sesion_service.js";
import { esPaciente } from "./control/roles.js";
import { mostrarLogin } from "./boundary/login.js";
import { iniciarMenu } from "./boundary/menu_lateral.js";
import { pintarUsuario } from "./boundary/topbar.js";
import { crearRouter } from "./router.js";
import "./boundary/componentes/instalador_app.js";

export function iniciarAplicacion() {
    let usuario = null;   // persona_rol de la sesión actual
    let loginEnCurso = false;

    const router = crearRouter({
        contenedor: document.getElementById('app-root'),
        tituloEl: document.getElementById('titulo-pagina'),
        obtenerUsuario: () => usuario,
        alRequerirLogin: iniciarLogin
    });
    const menu = iniciarMenu({ onNavegar: router.navegarA });

    async function iniciarLogin() {
        if (loginEnCurso) return;
        loginEnCurso = true;
        try {
            const { personaRoles } = await mostrarLogin();
            usuario = personaRoles[0];
            establecerContexto(usuario);
            menu.configurarUsuario(usuario);
            pintarUsuario(usuario);
            router.navegarA(router.tomarPendiente('/dashboard'));
            menu.marcarActiva(window.location.hash.slice(1));
        } catch (err) {
            console.error(err);
        } finally {
            loginEnCurso = false;
        }
    }

    // Cerrar sesión: vuelve a la pantalla de ingreso
    document.getElementById('btn-salir')?.addEventListener('click', () => {
        cerrarSesion();
        router.navegarA('/login');
        entrar();
    });

    // Usa la sesión guardada y conserva la ruta solicitada.
    async function entrar() {
        router.detener();   // cancela cualquier carga pendiente
        menu.cerrar();

        usuario = null;
        let falloSesion = false;
        try {
            const persona = obtenerSesion();
            if (persona) {
                const roles = (await rolesDePersona(persona.idPersona)).filter(rol => !esPaciente(rol));
                usuario = roles.find(rol => String(rol.idPersonaRol) === obtenerContexto()) ?? null;
                if (!usuario) throw new Error('El contexto de la sesión ya no está disponible');
            }
        } catch (err) {
            console.error(err);
            cerrarSesion();
            falloSesion = true;
        }
        router.iniciar();
        if (falloSesion) router.navegarA('/login');
        if (usuario && window.location.hash === '#/login') {
            router.navegarA('/dashboard');
        }

        menu.configurarUsuario(usuario);
        if (usuario) pintarUsuario(usuario);
        menu.marcarActiva(window.location.hash.slice(1));
    }

    return { router, listo: entrar() };
}

document.addEventListener("DOMContentLoaded", iniciarAplicacion);
