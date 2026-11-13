import DefaultService from './default_service.js';
import { buscarDocumento, rolesDePersona } from './sesion_service.js';
import { esPaciente } from './roles.js';

// Misma zona usada por las vistas JSF de GalenoSV; el formato JSON de fechas queda por verificar.
export const ZONA_AGENDA = 'America/El_Salvador';
// ConsultaResource aún no publica /consulta/{id}/ticket. Activar al integrar ese contrato.
export const TICKET_PDF_DISPONIBLE = false;
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
    try { respuesta = await fetch(new DefaultService().BASE_URL + ruta, { method: 'GET', ...opciones }); }
    catch { throw new Error(navigator.onLine === false ? 'Sin conexión y sin datos guardados para esta pantalla' : 'No se pudo conectar con el servidor'); }
    if (!respuesta.ok) throw new Error(respuesta.status === 404 ? 'Recurso no disponible en el servidor (404)' : `Error del servidor (${respuesta.status})`);
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
export async function validarPaciente(tipo, numero) {
    let expresion;
    try {
        if (!tipo?.expresionRegular) throw new Error();
        expresion = new RegExp(`^(?:${tipo.expresionRegular})$`);
    } catch { throw new Error('El tipo de documento no tiene un formato válido configurado'); }
    if (!numero || !expresion.test(numero)) throw new Error(tipo.indicaciones || 'El formato del documento no es válido');
    const documento = await buscarDocumento(tipo.idTipoDocumento, numero);
    if (!documento) throw new Error('Documento no registrado');
    const persona = documento.idPersona;
    if (!persona?.idPersona) throw new Error('Documento sin persona asociada');
    const contextos = (await rolesDePersona(persona.idPersona)).filter(c => esPaciente(c) && c.idPersona?.idPersona === persona.idPersona);
    if (!contextos.length) throw new Error('Esta persona no tiene inscripciones como paciente');
    return { persona, contextos };
}
export async function buscarCitas(contextos, idClinica, desde, hasta) {
    validarRango(desde, hasta);
    const permitidos = new Set(contextos.filter(c => esPaciente(c) && c.idClinica?.idClinica === idClinica).map(c => c.idPersonaRol));
    if (!permitidos.size) throw new Error('Selecciona una clínica donde estés inscrito como paciente');
    const consultas = (await listarCompleto('consulta', 'idConsulta')).filter(c => permitidos.has(c.idPersonaRol?.idPersonaRol) && c.idPersonaRol?.idClinica?.idClinica === idClinica).filter(c => c.fechaInicio != null).filter(c => { const dia = diaAgenda(c.fechaInicio); return dia >= desde && dia <= hasta; });
    if (!consultas.length) return [];
    const procedimientos = await listarCompleto('consulta_procedimiento', 'idConsultaProcedimiento');
    return consultas.sort((a,b) => new Date(a.fechaInicio.replace(/\[.*\]$/, '')) - new Date(b.fechaInicio.replace(/\[.*\]$/, ''))).map(c => ({ ...c, procedimientos: procedimientos.filter(p => p.idConsulta?.idConsulta === c.idConsulta) }));
}
export async function ticketPDF(idConsulta) {
    const respuesta = await leer(`consulta/${encodeURIComponent(idConsulta)}/ticket`, { headers: { Accept: 'application/pdf' } });
    if (respuesta.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') throw new Error('El servidor no devolvió un ticket PDF');
    const blob = await respuesta.blob();
    if (!blob.size) throw new Error('El ticket PDF está vacío');
    return blob;
}
/** Solo lectura: el rol permite localizar pasos; su elegibilidad no se infiere de estados sin contrato. */
export async function cargarAgenda(contexto, desde, hasta) {
    validarRango(desde, hasta);
    if (!contexto?.idPersonaRol || !contexto.idClinica?.idClinica || !contexto.idRol?.idRol || esPaciente(contexto)) throw new Error('Selecciona un contexto laboral válido');
    const consultas = (await listarCompleto('consulta', 'idConsulta')).filter(c => c.idPersonaRol?.idClinica?.idClinica === contexto.idClinica.idClinica).filter(c => c.fechaInicio != null).filter(c => { const dia = diaAgenda(c.fechaInicio); return dia >= desde && dia <= hasta; });
    if (!consultas.length) return [];
    const [procedimientos, ejecuciones, secuencias] = await Promise.all([
        listarCompleto('consulta_procedimiento', 'idConsultaProcedimiento'),
        listarCompleto('consulta_procedimiento_paso', 'idConsultaProcedimientoPaso'),
        listarCompleto('procedimiento_paso_secuencia', 'idProcedimientoPasoSecuencia')
    ]);
    const ids = new Set(consultas.map(c => c.idConsulta));
    const relacionados = procedimientos.filter(p => ids.has(p.idConsulta?.idConsulta));
    const catalogos = new Map();
    for (const p of relacionados) {
        const id = p.idProcedimiento?.idProcedimiento;
        if (!id) throw new Error('Procedimiento sin identificador');
        if (!catalogos.has(id)) catalogos.set(id, await listarCompleto(`procedimiento_paso/procedimiento/${encodeURIComponent(id)}`, 'idProcedimientoPaso'));
    }
    return consultas.map(c => ({ ...c, procedimientos: relacionados.filter(p => p.idConsulta.idConsulta === c.idConsulta).map(p => {
        const definiciones = catalogos.get(p.idProcedimiento.idProcedimiento);
        // El backend crea registros PENDIENTE antes de que se atiendan; fechaInicio no implica avance.
        const registros = ejecuciones.filter(e => e.idConsultaProcedimiento?.idConsultaProcedimiento === p.idConsultaProcedimiento);
        const delRol = definiciones.filter(d => d.idRol?.idRol === contexto.idRol.idRol).map(d => ({
            ...d, registros: registros.filter(e => e.idProcedimientoPaso?.idProcedimientoPaso === d.idProcedimientoPaso)
        }));
        const previos = new Set();
        const recorrer = id => {
            for (const s of secuencias.filter(s => s.idProcedimientoPasoReferencia?.idProcedimientoPaso === id)) {
                const origen = s.idProcedimientoPaso?.idProcedimientoPaso;
                if (origen && !previos.has(origen)) { previos.add(origen); recorrer(origen); }
            }
        };
        delRol.forEach(d => recorrer(d.idProcedimientoPaso));
        return { ...p, pasosDelRol: delRol, pasosPrevios: registros.filter(e => previos.has(e.idProcedimientoPaso?.idProcedimientoPaso)), secuencias: secuencias.filter(s => definiciones.some(d => d.idProcedimientoPaso === s.idProcedimientoPaso?.idProcedimientoPaso)) };
    }).filter(p => p.pasosDelRol.length) })).filter(c => c.procedimientos.length);
}
