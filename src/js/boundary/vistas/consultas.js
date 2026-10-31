import { listarConsultas } from "../../control/resumen_service.js";
import { formatoFecha, estadoConsulta } from "../../control/fechas.js";
import { esc } from "../util_html.js";

/**
 * Vista "Agenda Médica": tarjetas con las consultas visibles para el usuario.
 * @param {HTMLElement} contenedor
 * @param {Object|null} usuario persona_rol de la sesión
 * @param {function(): boolean} esVigente false si el usuario ya cambió de pantalla
 */
export async function montarConsultas(contenedor, usuario, esVigente) {
    contenedor.innerHTML = `<p class="aviso">Cargando consultas…</p>`;

    let lista;
    try {
        lista = await listarConsultas(usuario);
    } catch (err) {
        console.error(err);
        if (!esVigente()) return;
        contenedor.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? 'No se pudieron cargar las consultas')}.</p>`;
        return;
    }
    if (!esVigente()) return;

    if (!lista.length) {
        contenedor.innerHTML = `<p class="aviso">Aún no hay consultas registradas</p>`;
        return;
    }

    contenedor.innerHTML = `<div class="lista-consultas">${lista.map(c => {
        const estado = estadoConsulta(c);
        const p = c.idPersonaRol?.idPersona;
        return `
            <article class="tarjeta-consulta">
                <header>
                    <strong>${esc(formatoFecha(c.fechaInicio))}</strong>
                    <span class="estado estado--${estado.toLowerCase().replace(' ', '-')}">${esc(estado)}</span>
                </header>
                <p>Paciente: ${esc(`${p?.nombres ?? ''} ${p?.apellidos ?? ''}`.trim() || 'Sin nombre')}</p>
                <p class="obs">${esc(c.observaciones || 'Sin observaciones')}</p>
            </article>`;
    }).join('')}</div>`;
}