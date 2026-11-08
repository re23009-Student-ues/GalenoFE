import { estadoConsulta } from './fechas.js';
import { esMedico } from './roles.js';
import { cargarResumen } from './resumen_service.js';
import ConsultaProcedimientoPasoService from './consultaProcedimientoPaso_service.js';

/** Carga los pasos relacionados sin depender de las listas hijas omitidas por JSON-B. */
export async function cargarInicioPaciente(usuario) {
    const resumen = await cargarResumen(usuario);
    const pasos = await new ConsultaProcedimientoPasoService().listarParaConsultas(resumen.consultas.map(consulta => consulta.idConsulta));
    return { ...resumen, eventos: citasParaCalendario(resumen.consultas, pasos) };
}

function responsableDe(personaRol) {
    const persona = personaRol?.idPersona;
    const nombre = [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ').trim();
    return {
        responsable: nombre || (personaRol ? 'Nombre no disponible' : 'Sin responsable asignado'),
        rolResponsable: personaRol?.idRol?.nombre?.trim() || '',
        esMedico: esMedico(personaRol)
    };
}

function fechaCita(value) {
    const fecha = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value ?? '');
    if (!fecha) throw new TypeError('Una cita no contiene una fecha reconocible.');
    return { date: fecha[1], time: fecha[2] || '' };
}

function estadoPaso(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    const estados = {
        PENDIENTE: ['pending', 'Pendiente'], CONFIRMADO: ['confirmed', 'Confirmada'],
        EN_CURSO: ['ongoing', 'En curso'], FINALIZADO: ['completed', 'Finalizada'],
        COMPLETADO: ['completed', 'Completada'], CANCELADO: ['cancelled', 'Cancelada']
    };
    const match = estados[text.toLocaleUpperCase('es').replace(/\s+/g, '_')];
    return match ? { status: match[0], estado: match[1] } : { status: 'default', estado: text || 'Sin estado' };
}

/** Un evento por paso real. Las consultas sin pasos conservan su cita sin inventar asignaciones. */
export function citasParaCalendario(consultas, pasos = []) {
    const porConsulta = new Map(consultas.map(consulta => [consulta.idConsulta, []]));
    const vistos = new Set();
    pasos.forEach(paso => {
        const idConsulta = paso.idConsultaProcedimiento?.idConsulta?.idConsulta;
        if (!porConsulta.has(idConsulta) || vistos.has(paso.idConsultaProcedimientoPaso)) return;
        vistos.add(paso.idConsultaProcedimientoPaso);
        porConsulta.get(idConsulta).push(paso);
    });
    return consultas.flatMap(consulta => {
        const asociados = porConsulta.get(consulta.idConsulta);
        if (!asociados.length) {
            const estado = estadoConsulta(consulta);
            return [{
                id: `consulta:${consulta.idConsulta}`, idConsulta: consulta.idConsulta,
                title: 'Consulta', ...fechaCita(consulta.fechaInicio),
                status: { Programada: 'scheduled', Finalizada: 'completed', 'En curso': 'ongoing' }[estado],
                estado, paso: 'Sin pasos registrados', ...responsableDe(null)
            }];
        }
        return asociados.map(paso => {
            const nombre = paso.idProcedimientoPaso?.nombre || 'Paso sin información';
            return {
                id: `paso:${paso.idConsultaProcedimientoPaso}`, idConsulta: consulta.idConsulta,
                idConsultaProcedimientoPaso: paso.idConsultaProcedimientoPaso,
                title: nombre, paso: nombre,
                procedimiento: paso.idConsultaProcedimiento?.idProcedimiento?.nombre || '',
                ...fechaCita(paso.fechaInicio || paso.idConsultaProcedimiento?.fechaInicio || consulta.fechaInicio),
                ...estadoPaso(paso.estado), ...responsableDe(paso.idPersonaRol)
            };
        });
    });
}
