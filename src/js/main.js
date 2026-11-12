import { obtenerSesion, rolesDePersona, establecerContexto, obtenerContexto, cerrarSesion } from "./control/sesion_service.js";
import { esPaciente } from "./control/roles.js";
import { mostrarLogin } from "./boundary/login.js";
import { crearRouter } from "./router.js";
import "./boundary/galeno_app.js";

export function iniciarAplicacion(app = document.querySelector('galeno-app')) {
    let usuario = null;   // persona_rol de la sesión actual
    let loginEnCurso = false;
    let detenido = false;

    const router = crearRouter({
        contenedor: app.outlet,
        tituloEl: app.tituloEl,
        obtenerUsuario: () => usuario,
        alRequerirLogin: iniciarLogin
    });
    const alNavegar = evento => router.navegarA(evento.detail.ruta);
    const marcarActiva = () => app.marcarActiva(window.location.hash.slice(1));
    app.addEventListener('galeno-navegar', alNavegar);
    window.addEventListener('hashchange', marcarActiva);

    async function iniciarLogin() {
        if (loginEnCurso) return;
        loginEnCurso = true;
        try {
            const { personaRoles } = await mostrarLogin();
            if (detenido) return;
            usuario = personaRoles[0];
            establecerContexto(usuario);
            app.usuario = usuario;
            router.navegarA(router.tomarPendiente('/dashboard'));
            marcarActiva();
        } catch (err) {
            console.error(err);
        } finally {
            loginEnCurso = false;
        }
    }

    // Cerrar sesión: vuelve al acceso público
    const alCerrarSesion = () => {
        cerrarSesion();
        router.navegarA('/citas');
        entrar();
    };
    app.addEventListener('galeno-cerrar-sesion', alCerrarSesion);

    // Usa la sesión guardada y conserva la ruta solicitada.
    async function entrar() {
        router.detener();   // cancela cualquier carga pendiente
        app.cerrarMenu();

        usuario = null;
        let falloSesion = false;
        try {
            const persona = obtenerSesion();
            app.restaurando = Boolean(persona);
            if (persona) {
                const roles = (await rolesDePersona(persona.idPersona)).filter(rol => !esPaciente(rol));
                if (detenido) return;
                usuario = roles.find(rol => String(rol.idPersonaRol) === obtenerContexto()) ?? null;
                if (!usuario) throw new Error('El contexto de la sesión ya no está disponible');
            }
        } catch (err) {
            console.error(err);
            cerrarSesion();
            falloSesion = true;
        } finally {
            app.usuario = usuario;
            app.restaurando = false;
        }
        if (falloSesion) router.navegarA('/login');
        // Sin hash, el router elige citas o dashboard según la sesión restaurada.
        router.iniciar();
        if (usuario && window.location.hash === '#/login') {
            router.navegarA('/dashboard');
        }

        marcarActiva();
    }

    function detener() {
        detenido = true;
        router.detener();
        app.removeEventListener('galeno-navegar', alNavegar);
        app.removeEventListener('galeno-cerrar-sesion', alCerrarSesion);
        window.removeEventListener('hashchange', marcarActiva);
        app.removeEventListener('galeno-desconectar', detener);
    }
    app.addEventListener('galeno-desconectar', detener);
    return { router, listo: entrar(), detener };
}

document.addEventListener("DOMContentLoaded", () => iniciarAplicacion());
