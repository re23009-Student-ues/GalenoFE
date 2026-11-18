import { autenticarEmpleado, guardarSesion } from "../control/sesion_service.js";
import { ejemploDocumento } from "../control/documento_formato.js";
import TipoDocumentoService from "../control/tipoDocumento_service.js";

function etiqueta(texto, campo) {
    const nodo = document.createElement('label');
    nodo.htmlFor = campo.id;
    nodo.textContent = texto;
    nodo.append(campo);
    return nodo;
}

function boton(id, texto, tipo = 'button') {
    const nodo = document.createElement('button');
    nodo.id = id;
    nodo.type = tipo;
    nodo.textContent = texto;
    return nodo;
}

function opcion(texto, valor) {
    const nodo = document.createElement('option');
    nodo.textContent = String(texto ?? '');
    nodo.value = String(valor ?? '');
    return nodo;
}

function llenar(select, opciones, textoInicial) {
    select.replaceChildren(opcion(textoInicial, ''), ...opciones.map(({ texto, valor }) => opcion(texto, valor)));
    select.disabled = opciones.length === 0;
    if (opciones.length === 1) select.value = opciones[0].valor;
}

/** Formulario autónomo: autentica y comunica el resultado al shell. */
class GalenoLogin extends HTMLElement {
    connectedCallback() { this.iniciar(); }
    disconnectedCallback() { this.escuchas?.abort(); }

    montarFormulario() {
        const form = document.createElement('form');
        form.className = 'login-caja';
        form.id = 'login-form';
        const logo = document.createElement('img');
        logo.className = 'login-logo';
        logo.src = 'Recursos/imagenes/logo.png';
        logo.alt = 'GalenoSV · Tu salud, nuestra prioridad';
        const subtitulo = document.createElement('p');
        subtitulo.className = 'login-sub';
        subtitulo.textContent = 'Ingresa con tu documento';

        const indicaciones = document.createElement('p');
        indicaciones.id = 'login-indicaciones';
        indicaciones.className = 'login-aviso';
        const selTipo = document.createElement('select');
        selTipo.id = 'login-tipo-documento';
        selTipo.disabled = true;
        selTipo.setAttribute('aria-describedby', indicaciones.id);
        const documento = document.createElement('input');
        documento.id = 'login-documento';
        documento.type = 'text';
        documento.autocomplete = 'off';
        documento.setAttribute('aria-describedby', indicaciones.id);

        const aviso = document.createElement('p');
        aviso.id = 'login-aviso';
        aviso.className = 'login-aviso';
        aviso.setAttribute('role', 'alert');
        aviso.setAttribute('aria-live', 'assertive');
        aviso.setAttribute('aria-atomic', 'true');
        aviso.textContent = 'Cargando…';

        const btnReintentar = boton('login-reintentar', 'Reintentar');
        btnReintentar.className = 'login-reintentar';
        btnReintentar.hidden = true;
        const btnEntrar = boton('login-entrar', 'Entrar', 'submit');
        btnEntrar.disabled = true;
        const btnVolver = boton('login-volver', 'Volver a mis citas');
        btnVolver.className = 'login-reintentar';

        form.append(logo, subtitulo, etiqueta('Tipo de documento', selTipo), indicaciones,
            etiqueta('Número de documento', documento), aviso, btnReintentar, btnEntrar, btnVolver);
        this.replaceChildren(form);
        return { form, selTipo, documento, indicaciones, aviso, btnEntrar, btnReintentar, btnVolver };
    }

    async iniciar() {
        this.escuchas?.abort();
        const escuchas = this.escuchas = new AbortController();
        const { signal } = escuchas;
        const vigente = () => this.isConnected && !signal.aborted;
        const { form, selTipo, documento, indicaciones, aviso, btnEntrar, btnReintentar, btnVolver } = this.montarFormulario();

        btnVolver.addEventListener('click', () => {
            escuchas.abort(); // Descarta también un ingreso que aún esté pendiente.
            this.dispatchEvent(new CustomEvent('galeno-login-cancelado', { bubbles: true, composed: true }));
        }, { signal });

        // 1. Traer los datos (con reintento si el servidor no responde)
        let lista;
        while (true) {
            aviso.textContent = "Cargando…";
            btnReintentar.hidden = true;
            try {
                lista = (await new TipoDocumentoService({ activo: true }).findAll()).filter(tipo => tipo.activo === true);
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
            const ejemplo = ejemploDocumento(tipo);
            documento.placeholder = ejemplo ? `Ej.: ${ejemplo}` : '';
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
