import { obtenerUsuario, cerrarSesion } from "./control/sesion_service.js";
import { mostrarLogin } from "./boundary/login.js";
import { iniciarMenu } from "./boundary/menu_lateral.js";
import { pintarUsuario } from "./boundary/topbar.js";
import { crearRouter } from "./router.js";
import "./boundary/componentes/instalador_app.js";

document.addEventListener("DOMContentLoaded", () => {
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
            usuario = await mostrarLogin();
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
        entrar();
    });

    // Usa la sesión guardada y conserva la ruta solicitada.
    async function entrar() {
        router.detener();   // cancela cualquier carga pendiente
        menu.cerrar();

        usuario = await obtenerUsuario().catch(err => {
            console.error(err);
            return null;
        });
        router.iniciar();
        if (usuario && window.location.hash === '#/login') {
            router.navegarA('/dashboard');
        }

        menu.configurarUsuario(usuario);
        if (usuario) pintarUsuario(usuario);
        menu.marcarActiva(window.location.hash.slice(1));
    }

    entrar();
});
