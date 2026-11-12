import DefaultService from "./default_service.js";
import DefaultError from "../entity/default_error.js";
import { esPaciente } from "./roles.js";

const CLAVE_SESION = "sesionPersonaRol";
const CLAVE_PERSONA = "sesionPersona";

/** Recuerda quién inició sesión (se borra al cerrar la pestaña). */
export function guardarSesion(persona) {
    const { idPersona, nombres, apellidos } = persona;
    sessionStorage.setItem(CLAVE_PERSONA, JSON.stringify({ idPersona, nombres, apellidos }));
    sessionStorage.removeItem(CLAVE_SESION);
}

/** Contexto de clínica y rol elegido por el empleado (HU3). */
export function establecerContexto(personaRol) {
    sessionStorage.setItem(CLAVE_SESION, personaRol.idPersonaRol);
}

export function obtenerContexto() {
    return sessionStorage.getItem(CLAVE_SESION);
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

export async function cerrarSesion() {
    sessionStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_PERSONA);
    try { await globalThis.caches?.delete('galeno-api-v1'); } catch { /* El cierre local sigue siendo válido. */ }
}

function errorSesion(mensaje, error = null) {
    const salida = new DefaultError();
    salida.mensaje = mensaje;
    salida.error = error;
    return salida;
}

async function consultar(ruta, permitirNoEncontrado = false) {
    const url = `${new DefaultService().BASE_URL}${ruta}`;
    let respuesta;
    try {
        respuesta = await fetch(url, { method: 'GET' });
    } catch (error) {
        throw errorSesion(navigator.onLine === false
            ? 'Sin conexión y sin datos guardados para esta pantalla'
            : 'Error al acceder al repositorio', error);
    }
    if (permitirNoEncontrado && respuesta.status === 404) return null;
    if (respuesta.status !== 200) {
        throw errorSesion(`Error al obtener los datos: ${respuesta.status}`);
    }
    let datos;
    try {
        datos = await respuesta.json();
    } catch (error) {
        throw errorSesion('Error al procesar los datos de respuesta', error);
    }
    return datos;
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
