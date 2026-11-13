import { obtenerSesion, rolesDePersona, establecerContexto, obtenerContexto, cerrarSesion } from "./control/sesion_service.js";
import { esPaciente } from "./control/roles.js";
import { crearRouter } from "./router.js";
import { ConfirmDialog } from "./boundary/componentes/overlays/index.js";
import "./boundary/galeno_app.js";

export function iniciarAplicacion(app = document.querySelector('galeno-app')) {
    let usuario = null;   // persona_rol de la sesión actual
    let detenido = false;
    let versionContexto = 0;
    let saliendo = false;
    let confirmacionSalida = null;

    const router = crearRouter({
        contenedor: app.outlet,
        tituloEl: app.tituloEl,
        obtenerUsuario: () => usuario,
        alRequerirLogin: () => app.mostrarLogin()
    });
    const alNavegar = evento => router.navegarA(evento.detail.ruta);
    const marcarActiva = () => app.marcarActiva(window.location.hash.slice(1));
    app.addEventListener('galeno-navegar', alNavegar);
    window.addEventListener('hashchange', marcarActiva);

    function alLoginExitoso(evento) {
        versionContexto++;
        const { personaRoles } = evento.detail;
        usuario = personaRoles[0];
        establecerContexto(usuario);
        app.usuario = usuario;
        router.navegarA(router.tomarPendiente('/dashboard'));
        marcarActiva();
    }
    app.addEventListener('galeno-login-exitoso', alLoginExitoso);

    // La selección es una propuesta: la inscripción se vuelve a verificar en REST.
    const alContexto = async evento => {
        if (detenido || saliendo || !usuario) return;
        const version = ++versionContexto;
        const rutaOrigen = window.location.hash;
        const persona = obtenerSesion();
        const id = evento.detail?.personaRol?.idPersonaRol;
        if (!persona || !id) return;
        try {
            const roles = await rolesDePersona(persona.idPersona);
            if (detenido || saliendo || version !== versionContexto || window.location.hash !== rutaOrigen || obtenerSesion()?.idPersona !== persona.idPersona) return;
            const contexto = roles.find(r => r.idPersonaRol === id && r.idPersona?.idPersona === persona.idPersona && !esPaciente(r) && r.idClinica?.idClinica && r.idRol?.idRol);
            if (!contexto) throw new Error('El contexto no pertenece al empleado');
            establecerContexto(contexto);
            usuario = contexto;
            app.usuario = contexto;
            router.navegarA('/dashboard');
            marcarActiva();
        } catch (error) {
            if (detenido || saliendo || version !== versionContexto || window.location.hash !== rutaOrigen) return;
            const selector = app.querySelector('galeno-selector-contexto');
            if (selector && usuario) {
                selector.querySelector('[name="clinica"]').value = usuario.idClinica.idClinica;
                if (selector.contextos) selector.roles();
            }
            const aviso = selector?.querySelector('[role="status"]');
            if (aviso) aviso.textContent = error.message || error.mensaje || 'No se pudo cambiar de contexto';
        }
    };
    app.addEventListener('galeno-contexto-seleccionado', alContexto);

    // Cerrar sesión: vuelve al acceso público
    const alCerrarSesion = async () => {
        if (detenido || saliendo || !usuario) return;
        saliendo = true;
        versionContexto++;
        const selector = app.querySelector('galeno-selector-contexto');
        if (selector?.contextos) {
            selector.querySelector('[name="clinica"]').value = usuario.idClinica.idClinica;
            selector.roles();
        }
        try {
            confirmacionSalida = new ConfirmDialog({
                title: 'Cerrar sesión',
                message: '¿Deseas cerrar tu sesión y volver al acceso público?',
                type: 'warning',
                confirmText: 'Cerrar sesión',
                cancelText: 'Permanecer',
                errorMessage: 'No fue posible cerrar la sesión. Intenta nuevamente.',
                onConfirm: () => cerrarSesion()
            });
            confirmacionSalida.open();
            const confirmado = await confirmacionSalida.result;
            if (!confirmado || detenido) return;
            usuario = null;
            app.usuario = null;
            router.navegarA('/citas');
            await entrar();
        } finally {
            confirmacionSalida?.destroy();
            confirmacionSalida = null;
            saliendo = false;
        }
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
            await cerrarSesion();
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
        versionContexto++;
        app.removeEventListener('galeno-contexto-seleccionado', alContexto);
        confirmacionSalida?.destroy();
        router.detener();
        app.removeEventListener('galeno-navegar', alNavegar);
        app.removeEventListener('galeno-cerrar-sesion', alCerrarSesion);
        app.removeEventListener('galeno-login-exitoso', alLoginExitoso);
        window.removeEventListener('hashchange', marcarActiva);
        app.removeEventListener('galeno-desconectar', detener);
    }
    app.addEventListener('galeno-desconectar', detener);
    return { router, listo: entrar(), detener };
}

document.addEventListener("DOMContentLoaded", () => {
    const app = document.querySelector('galeno-app');
    if (app) iniciarAplicacion(app);
});
