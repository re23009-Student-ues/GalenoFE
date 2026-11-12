import PersonaRolService from "./personaRol_service.js";
import DefaultService from "./default_service.js";
import DefaultError from "../entity/default_error.js";
import { esPaciente } from "./roles.js";

const CLAVE_SESION = "sesionPersonaRol";
const CLAVE_PERSONA = "sesionPersona";

/** Todos los persona_rol (clínica + rol + persona) para armar el login. */
export function listarPersonaRoles() {
    return new PersonaRolService().findAll();
}

/** Recuerda quién inició sesión (se borra al cerrar la pestaña). */
export function guardarSesion(persona) {
    // Compatibilidad con el login actual hasta integrar HU2.
    if (typeof persona === 'string') {
        sessionStorage.removeItem(CLAVE_PERSONA);
        sessionStorage.setItem(CLAVE_SESION, persona);
        return;
    }
    const { idPersona, nombres, apellidos } = persona;
    sessionStorage.setItem(CLAVE_PERSONA, JSON.stringify({ idPersona, nombres, apellidos }));
    sessionStorage.removeItem(CLAVE_SESION);
}

/** Persona de HU2, sin roles ni clínica persistidos. */
export function obtenerSesion() {
    const guardado = sessionStorage.getItem(CLAVE_PERSONA);
    if (!guardado) return null;
    try {
        const { idPersona, nombres, apellidos } = JSON.parse(guardado);
        return { idPersona, nombres, apellidos };
    } catch {
        return null;
    }
}

export function cerrarSesion() {
    sessionStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_PERSONA);
}

function errorSesion(mensaje, error = null) {
    const salida = new DefaultError();
    salida.mensaje = mensaje;
    salida.error = error;
    return salida;
}

async function consultar(ruta, permitirNoEncontrado = false) {
    let respuesta;
    try {
        respuesta = await fetch(`${new DefaultService().BASE_URL}${ruta}`, { method: 'GET' });
    } catch (error) {
        throw errorSesion('Error al acceder al repositorio', error);
    }
    if (permitirNoEncontrado && respuesta.status === 404) return null;
    if (respuesta.status !== 200) {
        throw errorSesion(`Error al obtener los datos: ${respuesta.status}`);
    }
    try {
        return await respuesta.json();
    } catch (error) {
        throw errorSesion('Error al procesar los datos de respuesta', error);
    }
}

export function buscarDocumento(idTipoDocumento, valor) {
    const parametros = new URLSearchParams({ tipo: idTipoDocumento, valor });
    return consultar(`documento/buscar?${parametros}`, true);
}

export function rolesDePersona(idPersona) {
    return consultar(`persona_rol/persona/${encodeURIComponent(idPersona)}`);
}

/** Valida el documento y devuelve únicamente los roles del personal. No guarda sesión. */
export async function autenticarEmpleado(tipoDocumento, valor) {
    if (typeof tipoDocumento?.expresionRegular !== 'string' || !tipoDocumento.expresionRegular) {
        throw errorSesion('El tipo de documento no tiene una expresión regular válida');
    }
    let formato;
    try {
        formato = new RegExp(`^(?:${tipoDocumento.expresionRegular})$`);
    } catch (error) {
        throw errorSesion('La expresión regular del tipo de documento no es válida', error);
    }
    if (typeof valor !== 'string' || !valor || !formato.test(valor)) {
        throw errorSesion('El formato del documento no es válido');
    }
    const documento = await buscarDocumento(tipoDocumento.idTipoDocumento, valor);
    if (!documento) throw errorSesion('Documento no registrado');
    const persona = documento.idPersona;
    const personaRoles = (await rolesDePersona(persona.idPersona)).filter(rol => !esPaciente(rol));
    if (!personaRoles.length) throw errorSesion('Solo el personal puede ingresar');
    return { persona, personaRoles };
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
