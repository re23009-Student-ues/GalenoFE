import { solicitarREST, mensajeTransporte } from './transporte_rest.js';
import DefaultService from './default_service.js';
import { buscarDocumento, rolesDePersona } from './sesion_service.js';
import { esPaciente } from './roles.js';

// Misma zona usada por las vistas JSF de GalenoSV; el formato JSON de fechas queda por verificar.
export const ZONA_AGENDA = 'America/El_Salvador';
// Resumen de consulta generado por GalenoSV con OpenPDF.
export function diaAgenda(fecha = new Date()) {
    const d = fecha instanceof Date ? fecha : new Date(String(fecha).replace(/\[.*\]$/, ''));
    if (!Number.isFinite(d.getTime())) throw new Error('Fecha REST no válida');
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_AGENDA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const valor = tipo => partes.find(p => p.type === tipo).value;
    return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
export function fechaAgenda(valor) {
    if (!valor) return 'Sin fecha';
    const fecha = new Date(String(valor).replace(/\[.*\]$/, ''));
    if (!Number.isFinite(fecha.getTime())) return 'Fecha no válida';
    return new Intl.DateTimeFormat('es-SV', { timeZone: ZONA_AGENDA, dateStyle: 'medium', timeStyle: 'short' }).format(fecha);
}
export function validarRango(desde, hasta) {
    for (const valor of [desde, hasta]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || !Number.isFinite(Date.parse(valor)) || new Date(valor).toISOString().slice(0, 10) !== valor) throw new Error('Selecciona fechas válidas');
    }
    if (desde > hasta) throw new Error('Desde debe ser anterior o igual a Hasta');
}
export async function leer(ruta, opciones = {}) {
    let respuesta;
    try { respuesta = await solicitarREST(new DefaultService().BASE_URL + ruta, { method: 'GET', ...opciones }); }
    catch (error) { throw new Error(mensajeTransporte(error, 'No se pudo conectar con el servidor')); }
    if (!respuesta.ok) {
        const error = new Error(respuesta.status === 404 ? 'Recurso no disponible en el servidor (404)' : `Error del servidor (${respuesta.status})`);
        error.status = respuesta.status;
        throw error;
    }
    return respuesta;
}
/** Sin tope silencioso; detecta páginas repetidas y totales incompletos. */
export async function listarCompleto(recurso, clave) {
    const datos = new Map();
    let first = 0;
    while (true) {
        const respuesta = await leer(`${recurso}${recurso.includes('?') ? '&' : '?'}first=${first}&max=50`);
        const filas = await respuesta.json();
        if (!Array.isArray(filas)) throw new Error('El servidor no devolvió una lista válida');
        const cabecera = respuesta.headers.get('Total-registros');
        const total = cabecera !== null && cabecera.trim() !== '' && Number.isSafeInteger(Number(cabecera)) && Number(cabecera) >= 0 ? Number(cabecera) : null;
        let nuevos = 0;
        for (const fila of filas) {
            if (!fila?.[clave]) throw new Error('Registro sin identificador');
            if (!datos.has(fila[clave])) nuevos++;
            datos.set(fila[clave], fila);
        }
        if (filas.length && !nuevos) throw new Error('El servidor repitió una página; no se pudo completar la búsqueda');
        first += filas.length;
        if (total !== null && first >= total) break;
        if (total === null && filas.length < 50) break;
        if (!filas.length) throw new Error('El servidor devolvió una lista incompleta');
    }
    return [...datos.values()];
}
/** Relaciones acotadas: cada bloque completa su paginación y rechaza filas ajenas. */
export async function listarPorConjunto(recurso, clave, parametro, ids, pertenece, filtros = {}) {
    const unicos = [...new Set(ids)];
    if (unicos.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Relación sin identificador');
    const encontrados = new Map();
    for (let inicio = 0; inicio < unicos.length; inicio += 50) {
        const bloque = new Set(unicos.slice(inicio, inicio + 50));
        const parametros = new URLSearchParams({ ...filtros, [parametro]: [...bloque].join(',') });
        const vistos = new Set();
        let first = 0, totalAnterior;
        while (true) {
            const respuesta = await leer(`${recurso}?${parametros}&first=${first}&max=50`);
            const filas = await respuesta.json();
            const header = respuesta.headers.get('Total-registros');
            const total = header !== null && header.trim() !== '' ? Number(header) : NaN;
            if (!Array.isArray(filas) || filas.length > 50 || !Number.isSafeInteger(total) || total < 0 ||
                    totalAnterior !== undefined && totalAnterior !== total || first + filas.length > total) {
                throw new Error('Paginación de relaciones inválida');
            }
            totalAnterior = total;
            for (const fila of filas) {
                const id = fila?.[clave];
                if (!id || vistos.has(id)) throw new Error('Relación sin identificador o página repetida');
                if (!pertenece(fila, bloque)) throw new Error('El servidor devolvió relaciones ajenas al conjunto');
                vistos.add(id);
                encontrados.set(id, fila);
            }
            first += filas.length;
            if (first === total) break;
            if (filas.length !== 50) throw new Error('El servidor devolvió una lista incompleta de relaciones');
        }
    }
    return [...encontrados.values()];
}

export function procedimientosParaConsultas(ids) {
    return listarPorConjunto('consulta_procedimiento', 'idConsultaProcedimiento', 'consultas', ids,
        (fila, bloque) => bloque.has(fila.idConsulta?.idConsulta));
}
export function ejecucionesParaConsultas(ids) {
    return listarPorConjunto('consulta_procedimiento_paso', 'idConsultaProcedimientoPaso', 'consultas', ids,
        (fila, bloque) => bloque.has(fila.idConsultaProcedimiento?.idConsulta?.idConsulta));
}
export function definicionesParaProcedimientos(ids) {
    return listarPorConjunto('procedimiento_paso', 'idProcedimientoPaso', 'procedimientos', ids,
        (fila, bloque) => bloque.has(fila.idProcedimiento?.idProcedimiento));
}
export function secuenciasParaPasos(ids) {
    return listarPorConjunto('procedimiento_paso_secuencia', 'idProcedimientoPasoSecuencia', 'pasos', ids,
        (fila, bloque) => bloque.has(fila.idProcedimientoPaso?.idProcedimientoPaso) || bloque.has(fila.idProcedimientoPasoReferencia?.idProcedimientoPaso));
}
export function resultadosParaOrdenes(ids) {
    return listarPorConjunto('examen_resultado', 'idExamenResultado', 'ordenes', ids,
        (fila, bloque) => bloque.has(fila.idOrdenExamen?.idOrdenExamen));
}

export function validarFormatoDocumento(tipo, numero) {
    let expresion;
    try {
        if (!tipo?.expresionRegular) throw new Error();
        expresion = new RegExp(`^(?:${tipo.expresionRegular})$`);
    } catch { throw new Error('El tipo de documento no tiene un formato válido configurado'); }
    if (!numero || !expresion.test(numero)) throw new Error(tipo.indicaciones || 'El formato del documento no es válido');
}
export async function validarPaciente(tipo, numero) {
    validarFormatoDocumento(tipo, numero);
    const documento = await buscarDocumento(tipo.idTipoDocumento, numero);
    if (!documento) throw new Error('Documento no registrado');
    const persona = documento.idPersona;
    if (!persona?.idPersona) throw new Error('Documento sin persona asociada');
    const contextos = (await rolesDePersona(persona.idPersona)).filter(c => esPaciente(c) && c.idPersona?.idPersona === persona.idPersona);
    if (!contextos.length) throw new Error('Esta persona no tiene inscripciones como paciente');
    return { persona, contextos };
}
/** Citas filtradas por persona y días opcionales en backend. */
export async function buscarCitas(contextos, desde = '', hasta = '') {
    if (desde || hasta) validarRango(desde || hasta, hasta || desde);
    const inscripciones = new Map(contextos
        .filter(c => esPaciente(c) && c.idPersonaRol && c.idClinica?.idClinica)
        .map(c => [c.idPersonaRol, c]));
    if (!inscripciones.size) throw new Error('No hay inscripciones de paciente con clínica disponible');
    const personas = new Set([...inscripciones.values()].map(c => c.idPersona?.idPersona));
    if (personas.size !== 1 || ![...personas][0]) throw new Error('Las inscripciones deben pertenecer a una misma persona');
    const filtros = new URLSearchParams({ persona: [...personas][0] });
    if (desde) filtros.set('desde', desde);
    if (hasta) filtros.set('hasta', hasta);
    const consultas = (await listarCompleto(`consulta?${filtros}`, 'idConsulta')).filter(c => {
        const paciente = c.idPersonaRol;
        return inscripciones.has(paciente?.idPersonaRol)
            && inscripciones.get(paciente.idPersonaRol).idClinica.idClinica === paciente.idClinica?.idClinica;
    });
    if (!consultas.length) return [];
    const procedimientos = await procedimientosParaConsultas(consultas.map(c => c.idConsulta));
    return consultas.map(c => ({
        ...c, procedimientos: procedimientos.filter(p => p.idConsulta?.idConsulta === c.idConsulta)
    }));
}
export async function ticketPDF(idConsulta) {
    const respuesta = await leer(`consulta/${encodeURIComponent(idConsulta)}/ticket`, { headers: { Accept: 'application/pdf' } });
    if (respuesta.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') throw new Error('El servidor no devolvió un ticket PDF');
    const blob = await respuesta.blob();
    if (!blob.size) throw new Error('El ticket PDF está vacío');
    return blob;
}
/** La elegibilidad se consulta en backend por definiciones, sin exigir ejecuciones. */
export async function listarConsultasDelRol(contexto, desde, hasta) {
    const clinica = contexto?.idClinica?.idClinica, rol = contexto?.idRol?.idRol;
    if (!clinica || !rol || esPaciente(contexto)) return [];
    if (desde !== undefined || hasta !== undefined) validarRango(desde, hasta);
    const filtros = new URLSearchParams({ clinica, rol });
    if (desde !== undefined) filtros.set('desde', desde);
    if (hasta !== undefined) filtros.set('hasta', hasta);
    return (await listarCompleto(`consulta?${filtros}`, 'idConsulta'))
        .filter(c => c.idPersonaRol?.idClinica?.idClinica === clinica);
}

export async function filtrarConsultasPorRol(consultas, contexto) {
    const candidatas = consultas.filter(c => c.idPersonaRol?.idClinica?.idClinica === contexto?.idClinica?.idClinica);
    if (!candidatas.length) return [];
    const permitidas = new Set((await listarConsultasDelRol(contexto)).map(c => c.idConsulta));
    return candidatas.filter(c => permitidas.has(c.idConsulta));
}

/** Solo lectura: el rol permite localizar pasos; su elegibilidad no se infiere de estados sin contrato. */
export async function cargarAgenda(contexto, desde, hasta) {
    validarRango(desde, hasta);
    if (!contexto?.idPersonaRol || !contexto.idClinica?.idClinica || !contexto.idRol?.idRol || esPaciente(contexto)) throw new Error('Selecciona un contexto laboral válido');
    const consultas = await listarConsultasDelRol(contexto, desde, hasta);
    if (!consultas.length) return [];
    const idsConsultas = consultas.map(c => c.idConsulta);
    const [relacionados, ejecuciones] = await Promise.all([
        procedimientosParaConsultas(idsConsultas), ejecucionesParaConsultas(idsConsultas)
    ]);
    const definiciones = await definicionesParaProcedimientos(relacionados.map(p => p.idProcedimiento?.idProcedimiento));
    const secuencias = await secuenciasParaPasos(definiciones.map(d => d.idProcedimientoPaso));
    const catalogos = new Map([...new Set(relacionados.map(p => p.idProcedimiento.idProcedimiento))]
        .map(id => [id, definiciones.filter(d => d.idProcedimiento.idProcedimiento === id)]));
    return consultas.map(c => ({ ...c, procedimientos: relacionados.filter(p => p.idConsulta.idConsulta === c.idConsulta).map(p => {
        const definiciones = catalogos.get(p.idProcedimiento.idProcedimiento);
        // El backend crea registros PENDIENTE antes de que se atiendan; fechaInicio no implica avance.
        const registros = ejecuciones.filter(e => e.idConsultaProcedimiento?.idConsultaProcedimiento === p.idConsultaProcedimiento);
        const pasos = definiciones.map(d => ({
            ...d, registros: registros.filter(e => e.idProcedimientoPaso?.idProcedimientoPaso === d.idProcedimientoPaso)
        }));
        const delRol = pasos.filter(d => d.idRol?.idRol === contexto.idRol.idRol);
        const previos = new Set();
        const recorrer = id => {
            for (const s of secuencias.filter(s => s.idProcedimientoPasoReferencia?.idProcedimientoPaso === id)) {
                const origen = s.idProcedimientoPaso?.idProcedimientoPaso;
                if (origen && !previos.has(origen)) { previos.add(origen); recorrer(origen); }
            }
        };
        delRol.forEach(d => recorrer(d.idProcedimientoPaso));
        return { ...p, pasos, pasosDelRol: delRol, pasosPrevios: registros.filter(e => previos.has(e.idProcedimientoPaso?.idProcedimientoPaso)), secuencias: secuencias.filter(s => definiciones.some(d => d.idProcedimientoPaso === s.idProcedimientoPaso?.idProcedimientoPaso)) };
    }).filter(p => p.pasosDelRol.length) })).filter(c => c.procedimientos.some(p => p.pasos.some(paso =>
        paso.registros.some(registro => registro.idPersonaRol?.idPersonaRol === contexto.idPersonaRol &&
            ['PENDIENTE', 'EN_PROCESO'].includes(String(registro.estado ?? '').trim().toUpperCase())))));
}
