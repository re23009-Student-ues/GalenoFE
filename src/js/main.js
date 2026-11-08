import { obtenerUsuario, cerrarSesion } from "./control/sesion_service.js";
import { mostrarLogin } from "./boundary/login.js";
import { iniciarMenu } from "./boundary/menu_lateral.js";
import { pintarUsuario } from "./boundary/topbar.js";
import { crearRouter } from "./router.js";

document.addEventListener("DOMContentLoaded", () => {
    let usuario = null;   // persona_rol de la sesión actual

    const router = crearRouter({
        contenedor: document.getElementById('app-root'),
        tituloEl: document.getElementById('titulo-pagina'),
        obtenerUsuario: () => usuario
    });
    const menu = iniciarMenu({ onNavegar: router.navegarA });

    // Cerrar sesión: vuelve a la pantalla de ingreso
    document.getElementById('btn-salir')?.addEventListener('click', () => {
        cerrarSesion();
        entrar();
    });

    // Usa la sesión guardada o muestra el login; luego abre el Resumen
    async function entrar() {
        router.detener();   // cancela cualquier carga pendiente
        menu.cerrar();

        usuario = await obtenerUsuario().catch(err => {
            console.error(err);
            return null;
        });
        if (!usuario) usuario = await mostrarLogin();

        menu.configurarUsuario(usuario);
        pintarUsuario(usuario);
        menu.marcarActiva('/inicio');
        router.manejarRuta('/inicio');
    }

    entrar();
});