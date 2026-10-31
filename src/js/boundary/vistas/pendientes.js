/*
 * Pantallas que todavía no se desarrollan. Cuando una se implemente,
 * se mueve a su propio archivo en esta carpeta y se actualiza router.js.
 */

export function montarPersonas(contenedor) {
    contenedor.innerHTML = `<button id="btn-nuevo-paciente" type="button">Nueva Persona</button>
        <div id="lista-pacientes">Cargando...</div>`;
}

export function montarProcedimientos(contenedor) {
    contenedor.innerHTML = `<p>Flujos clínicos.</p>`;
}

export function montarLaboratorio(contenedor) {
    contenedor.innerHTML = `<p>Resultados.</p>`;
}

export function montarConfiguracion(contenedor) {
    contenedor.innerHTML = `<p>Ajustes.</p>`;
}