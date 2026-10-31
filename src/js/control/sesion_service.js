import PersonaRolService from "./personaRol_service.js";

const CLAVE_SESION = "sesionPersonaRol";

/** Todos los persona_rol (clínica + rol + persona) para armar el login. */
export function listarPersonaRoles() {
    return new PersonaRolService().findAll();
}

/** Recuerda quién inició sesión (se borra al cerrar la pestaña). */
export function guardarSesion(idPersonaRol) {
    sessionStorage.setItem(CLAVE_SESION, idPersonaRol);
}

export function cerrarSesion() {
    sessionStorage.removeItem(CLAVE_SESION);
}

/**
 * persona_rol de la sesión guardada, o null si no hay sesión.
 * @returns {Promise<Object|null>}
 */
export async function obtenerUsuario() {
    const guardado = sessionStorage.getItem(CLAVE_SESION);
    if (!guardado) return null;
    const roles = await listarPersonaRoles();
    return roles.find(pr => pr.idPersonaRol === guardado) ?? null;
}