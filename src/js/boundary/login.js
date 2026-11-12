import { autenticarEmpleado, guardarSesion } from "../control/sesion_service.js";
import TipoDocumentoService from "../control/tipoDocumento_service.js";

const PLANTILLA = `
    <form class="login-caja" id="login-form">
        <img class="login-logo" src="Recursos/imagenes/logo.png" alt="GalenoSV · Tu salud, nuestra prioridad" />
        <p class="login-sub">Ingresa con tu documento</p>

        <label>Tipo de documento
            <select id="login-tipo-documento" aria-describedby="login-indicaciones" disabled></select>
        </label>
        <p class="login-aviso" id="login-indicaciones"></p>
        <label>Número de documento
            <input id="login-documento" type="text" autocomplete="off" aria-describedby="login-indicaciones" />
        </label>

        <p class="login-aviso" id="login-aviso">Cargando…</p>
        <button type="button" id="login-reintentar" class="login-reintentar" hidden>Reintentar</button>
        <button type="submit" id="login-entrar" disabled>Entrar</button>
    </form>`;

class LoginFormulario extends HTMLElement {
    connectedCallback() {
        this.innerHTML = PLANTILLA;
    }
}
customElements.define('login-formulario', LoginFormulario);

/** Llena un <select> con opciones (se usa Option: el texto nunca se interpreta como HTML). */
function llenar(select, opciones, textoInicial) {
    select.innerHTML = "";
    select.add(new Option(textoInicial, ""));
    opciones.forEach(o => select.add(new Option(o.texto, o.valor)));
    select.disabled = opciones.length === 0;
    if (opciones.length === 1) {   // una sola opción: se elige sola
        select.value = opciones[0].valor;
    }
}

/**
 * Autentica al personal por documento, sin elegir clínica ni rol.
 * @returns {Promise<{persona: Object, personaRoles: Array}>}
 */
export async function mostrarLogin() {
    const pantalla = document.getElementById("pantalla-login");
    pantalla.replaceChildren(document.createElement('login-formulario'));
    pantalla.hidden = false;

    const form = pantalla.querySelector("#login-form");
    const selTipo = pantalla.querySelector("#login-tipo-documento");
    const documento = pantalla.querySelector("#login-documento");
    const indicaciones = pantalla.querySelector("#login-indicaciones");
    const aviso = pantalla.querySelector("#login-aviso");
    const btnEntrar = pantalla.querySelector("#login-entrar");
    const btnReintentar = pantalla.querySelector("#login-reintentar");

    // 1. Traer los datos (con reintento si el servidor no responde)
    let lista;
    while (true) {
        aviso.textContent = "Cargando…";
        btnReintentar.hidden = true;
        try {
            lista = (await new TipoDocumentoService().findAll()).filter(tipo => tipo.activo === true);
            break;
        } catch (err) {
            console.error(err);
            aviso.textContent = `${err.mensaje ?? "No se pudo conectar"}. Revisa que el servidor esté en marcha.`;
            btnReintentar.hidden = false;
            await new Promise(r => btnReintentar.addEventListener("click", r, { once: true }));
        }
    }

    if (!lista.length) {
        aviso.textContent = "No hay tipos de documento activos.";
    } else {
        aviso.textContent = "";
    }

    let consultando = false;
    const actualizar = () => {
        const tipo = lista.find(tipo => String(tipo.idTipoDocumento) === selTipo.value);
        indicaciones.textContent = tipo?.indicaciones ?? '';
        btnEntrar.disabled = consultando || !tipo || !documento.value.trim();
    };
    selTipo.addEventListener('change', actualizar);
    documento.addEventListener('input', actualizar);
    llenar(selTipo, lista.map(tipo => ({ valor: tipo.idTipoDocumento, texto: tipo.nombre })), 'Elige un tipo');
    actualizar();

    // 3. Esperar a que la persona entre
    return new Promise(resolve => {
        form.addEventListener("submit", async e => {
            e.preventDefault();
            if (consultando || btnEntrar.disabled) return;
            const tipo = lista.find(tipo => String(tipo.idTipoDocumento) === selTipo.value);
            consultando = true;
            actualizar();
            aviso.textContent = 'Consultando…';
            try {
                const resultado = await autenticarEmpleado(tipo, documento.value.trim());
                const { idPersona, nombres, apellidos } = resultado.persona;
                guardarSesion({ idPersona, nombres, apellidos });
                pantalla.hidden = true;
                pantalla.innerHTML = "";
                resolve(resultado);
            } catch (err) {
                aviso.textContent = err.mensaje ?? 'No se pudo iniciar sesión';
            } finally {
                consultando = false;
                actualizar();
            }
        });
    });
}
