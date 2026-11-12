import { autenticarEmpleado, guardarSesion } from "../control/sesion_service.js";
import TipoDocumentoService from "../control/tipoDocumento_service.js";

const PLANTILLA = `
    <form class="login-caja" id="login-form">
        <img class="login-logo" src="Recursos/imagenes/logo.png" alt="GalenoSV · Tu salud, nuestra prioridad" />
        <p class="login-sub">Ingresa con tu documento</p>

        <label for="login-tipo-documento">Tipo de documento
            <select id="login-tipo-documento" aria-describedby="login-indicaciones" disabled></select>
        </label>
        <p class="login-aviso" id="login-indicaciones"></p>
        <label for="login-documento">Número de documento
            <input id="login-documento" type="text" autocomplete="off" aria-describedby="login-indicaciones" />
        </label>

        <p class="login-aviso" id="login-aviso" role="alert" aria-live="assertive" aria-atomic="true">Cargando…</p>
        <button type="button" id="login-reintentar" class="login-reintentar" hidden>Reintentar</button>
        <button type="submit" id="login-entrar" disabled>Entrar</button>
    </form>`;

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

/** Formulario autónomo: autentica y comunica el resultado al shell. */
class GalenoLogin extends HTMLElement {
    connectedCallback() { this.iniciar(); }
    disconnectedCallback() { this.escuchas?.abort(); }

    async iniciar() {
        this.escuchas?.abort();
        const escuchas = this.escuchas = new AbortController();
        const { signal } = escuchas;
        const vigente = () => this.isConnected && !signal.aborted;
        const pantalla = this;
        pantalla.innerHTML = PLANTILLA;

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
                if (!vigente()) return;
                break;
            } catch (err) {
                if (!vigente()) return;
                console.error(err);
                aviso.textContent = `${err.mensaje ?? "No se pudo conectar"}. Revisa que el servidor esté en marcha.`;
                btnReintentar.hidden = false;
                await new Promise(r => {
                    btnReintentar.addEventListener("click", r, { once: true, signal });
                    signal.addEventListener('abort', r, { once: true });
                });
                if (!vigente()) return;
            }
        }

        if (!lista.length) {
            aviso.textContent = "No hay tipos de documento activos.";
        } else {
            aviso.textContent = "";
        }

        let consultando = false;
        let autenticado = false;
        const actualizar = () => {
            const tipo = lista.find(tipo => String(tipo.idTipoDocumento) === selTipo.value);
            indicaciones.textContent = tipo?.indicaciones ?? '';
            btnEntrar.disabled = consultando || autenticado || !tipo || !documento.value.trim();
        };
        selTipo.addEventListener('change', actualizar, { signal });
        documento.addEventListener('input', actualizar, { signal });
        llenar(selTipo, lista.map(tipo => ({ valor: tipo.idTipoDocumento, texto: tipo.nombre })), 'Elige un tipo');
        actualizar();
        if (!selTipo.disabled) selTipo.focus();

        // 3. Esperar a que la persona entre
        form.addEventListener("submit", async e => {
            e.preventDefault();
            if (consultando || btnEntrar.disabled) return;
            const tipo = lista.find(tipo => String(tipo.idTipoDocumento) === selTipo.value);
            consultando = true;
            actualizar();
            aviso.textContent = 'Consultando…';
            try {
                const resultado = await autenticarEmpleado(tipo, documento.value.trim());
                if (!vigente()) return;
                const { idPersona, nombres, apellidos } = resultado.persona;
                guardarSesion({ idPersona, nombres, apellidos });
                autenticado = true;
                this.dispatchEvent(new CustomEvent('galeno-login-exitoso', {
                    detail: resultado, bubbles: true, composed: true
                }));
            } catch (err) {
                if (!vigente()) return;
                aviso.textContent = err.mensaje ?? 'No se pudo iniciar sesión';
            } finally {
                consultando = false;
                if (vigente()) actualizar();
            }
        }, { signal });
    }
}
customElements.define('galeno-login', GalenoLogin);
