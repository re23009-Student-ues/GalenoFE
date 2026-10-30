import { listarPersonaRoles, guardarSesion } from "../control/resumen_service.js";

const PLANTILLA = `
    <form class="login-caja" id="login-form">
        <img class="login-logo" src="Recursos/imagenes/logo.png" alt="GalenoSV · Tu salud, nuestra prioridad" />
        <p class="login-sub">Elige cómo quieres entrar</p>

        <label>Clínica
            <select id="login-clinica" disabled></select>
        </label>
        <label>Rol
            <select id="login-rol" disabled></select>
        </label>
        <label>Persona
            <select id="login-persona" disabled></select>
        </label>

        <p class="login-aviso" id="login-aviso">Cargando…</p>
        <button type="button" id="login-reintentar" class="login-reintentar" hidden>Reintentar</button>
        <button type="submit" id="login-entrar" disabled>Entrar</button>
    </form>`;

/** Opciones únicas [{valor, texto}] de una lista, ordenadas por texto. */
function unicos(lista, fnValor, fnTexto) {
    const mapa = new Map();
    lista.forEach(item => mapa.set(fnValor(item), fnTexto(item)));
    return [...mapa]
        .map(([valor, texto]) => ({ valor, texto }))
        .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
}

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
 * Muestra la pantalla de ingreso: clínica → rol → persona.
 * @returns {Promise<Object>} el persona_rol elegido (ya guardado como sesión)
 */
export async function mostrarLogin() {
    const pantalla = document.getElementById("pantalla-login");
    pantalla.innerHTML = PLANTILLA;
    pantalla.hidden = false;

    const form = pantalla.querySelector("#login-form");
    const selClinica = pantalla.querySelector("#login-clinica");
    const selRol = pantalla.querySelector("#login-rol");
    const selPersona = pantalla.querySelector("#login-persona");
    const aviso = pantalla.querySelector("#login-aviso");
    const btnEntrar = pantalla.querySelector("#login-entrar");
    const btnReintentar = pantalla.querySelector("#login-reintentar");

    // 1. Traer los datos (con reintento si el servidor no responde)
    let lista;
    while (true) {
        aviso.textContent = "Cargando…";
        btnReintentar.hidden = true;
        try {
            lista = (await listarPersonaRoles())
                .filter(pr => pr.idClinica && pr.idRol && pr.idPersona);
            break;
        } catch (err) {
            console.error(err);
            aviso.textContent = `${err.mensaje ?? "No se pudo conectar"}. Revisa que el servidor esté en marcha.`;
            btnReintentar.hidden = false;
            await new Promise(r => btnReintentar.addEventListener("click", r, { once: true }));
        }
    }

    if (!lista.length) {
        aviso.textContent = "No hay personas registradas en el sistema.";
    } else {
        aviso.textContent = "";
    }

    // 2. Selects encadenados
    const nombreCompleto = pr => `${pr.idPersona.nombres ?? ""} ${pr.idPersona.apellidos ?? ""}`.trim() || "Sin nombre";

    const alElegirClinica = () => {
        const roles = lista.filter(pr => pr.idClinica.idClinica === selClinica.value);
        llenar(selRol, unicos(roles, pr => pr.idRol.idRol, pr => pr.idRol.nombre ?? "Sin nombre"), "Elige un rol");
        alElegirRol();
    };

    const alElegirRol = () => {
        const personas = lista.filter(pr =>
            pr.idClinica.idClinica === selClinica.value && pr.idRol.idRol === selRol.value);
        llenar(selPersona, unicos(personas, pr => pr.idPersonaRol, nombreCompleto), "Elige una persona");
        alElegirPersona();
    };

    const alElegirPersona = () => {
        btnEntrar.disabled = !selPersona.value;
    };

    selClinica.addEventListener("change", alElegirClinica);
    selRol.addEventListener("change", alElegirRol);
    selPersona.addEventListener("change", alElegirPersona);

    llenar(selClinica,
        unicos(lista, pr => pr.idClinica.idClinica, pr => pr.idClinica.nombre ?? "Sin nombre"),
        "Elige una clínica");
    alElegirClinica();

    // 3. Esperar a que la persona entre
    return new Promise(resolve => {
        form.addEventListener("submit", e => {
            e.preventDefault();
            const elegido = lista.find(pr => pr.idPersonaRol === selPersona.value);
            if (!elegido) return;
            guardarSesion(elegido.idPersonaRol);
            pantalla.hidden = true;
            pantalla.innerHTML = "";
            resolve(elegido);
        });
    });
}