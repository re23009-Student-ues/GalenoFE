import { leer, listarCompleto, filtrarConsultasPorRol } from './agenda_service.js';
import ConsultaProcedimientoPasoService from './consultaProcedimientoPaso_service.js';

export async function documentoDelPaciente(idPersona) {
    if (!idPersona) return null;
    const normalizar = id => String(id ?? '').trim().toLowerCase();
    const paginas = new Set();
    let first = 0;
    while (true) {
        const respuesta = await leer(`documento?first=${first}&max=50`);
        const documentos = await respuesta.json();
        if (!Array.isArray(documentos)) throw new Error('El servidor no devolvió una lista de documentos válida.');
        const encontrado = documentos.find(d => d &&
            normalizar(typeof d.idPersona === 'object' ? d.idPersona?.idPersona : d.idPersona) === normalizar(idPersona) &&
            typeof d.valor === 'string' && d.valor.trim());
        if (encontrado) return encontrado;
        const firma = JSON.stringify(documentos);
        if (documentos.length && paginas.has(firma)) throw new Error('El servidor repitió una página de documentos.');
        paginas.add(firma);
        const cabecera = respuesta.headers.get('Total-registros');
        const total = cabecera !== null && cabecera.trim() !== '' && Number.isSafeInteger(Number(cabecera)) && Number(cabecera) >= 0 ? Number(cabecera) : null;
        first += documentos.length;
        if (total !== null && first >= total || total === null && documentos.length < 50) return null;
        if (!documentos.length) throw new Error('No se pudo completar la búsqueda de documentos.');
    }
}

export function pasoDelRol(paso, contexto) {
    return !!contexto?.idRol?.idRol && paso?.idProcedimientoPaso?.idRol?.idRol === contexto.idRol.idRol;
}

/** Los recursos no ofrecen filtros por consulta; se pagina antes de cruzar relaciones. */
export async function cargarDetalleAtencion(idConsulta) {
    const [todos, configuraciones, ordenes, resultados] = await Promise.all([
        listarCompleto('consulta_procedimiento', 'idConsultaProcedimiento'),
        listarCompleto('procedimiento_paso_examen', 'idProcedimientoPasoExamen'),
        listarCompleto('orden_examen', 'idOrdenExamen'),
        listarCompleto('examen_resultado', 'idExamenResultado')
    ]);
    const procedimientos = todos.filter(p => p.idConsulta?.idConsulta === idConsulta);
    const definiciones = new Map();
    for (const p of procedimientos) {
        const id = p.idProcedimiento?.idProcedimiento;
        if (!id) throw new Error('Procedimiento sin identificador.');
        if (!definiciones.has(id)) definiciones.set(id,
            await listarCompleto(`procedimiento_paso/procedimiento/${encodeURIComponent(id)}`, 'idProcedimientoPaso'));
    }
    const pasosDefinidos = [...definiciones.values()].flat();
    const idsPasos = new Set(pasosDefinidos.map(p => p.idProcedimientoPaso));
    const deConsulta = ordenes.filter(o => o.idConsultaProcedimientoPaso?.idConsultaProcedimiento?.idConsulta?.idConsulta === idConsulta);
    const idsOrdenes = new Set(deConsulta.map(o => o.idOrdenExamen));
    return { procedimientos, pasosDefinidos,
        examenes: configuraciones.filter(c => c.activo === true && c.idExamen?.activo === true && idsPasos.has(c.idProcedimientoPaso?.idProcedimientoPaso)),
        ordenes: deConsulta, resultados: resultados.filter(r => idsOrdenes.has(r.idOrdenExamen?.idOrdenExamen)) };
}

const contratos = {
    consulta: { id: 'idConsulta', campos: ['observaciones', 'fechaFin'] },
    consulta_procedimiento_paso: { id: 'idConsultaProcedimientoPaso', campos: ['valor'] },
    orden_examen: { id: 'idOrdenExamen', campos: ['indicaciones'] },
    examen_resultado: { id: 'idExamenResultado', campos: ['resultado', 'interpretacion'] }
};

async function validarRegistro(recurso, actual, contexto, idConsulta) {
    const paso = recurso === 'consulta_procedimiento_paso' ? actual : recurso === 'orden_examen' ?
        actual.idConsultaProcedimientoPaso : actual.idOrdenExamen?.idConsultaProcedimientoPaso;
    const consulta = recurso === 'consulta' ? actual : paso?.idConsultaProcedimiento?.idConsulta;
    if (!contexto?.idClinica?.idClinica || consulta?.idConsulta !== idConsulta ||
        consulta.idPersonaRol?.idClinica?.idClinica !== contexto.idClinica.idClinica ||
        (recurso !== 'consulta' && !pasoDelRol(paso, contexto)) ||
        (recurso === 'consulta' && !(await filtrarConsultasPorRol([consulta], contexto)).length)) {
        throw new Error('El registro no corresponde al rol o a la clínica activa.');
    }
}

/** Relee antes del PUT, conserva el resto del registro y rechaza cambios concurrentes. */
export async function guardarCamposAtencion(recurso, original, cambios, contexto, idConsulta) {
    const contrato = contratos[recurso];
    if (!contrato || !original?.[contrato.id] || !Object.keys(cambios).length ||
        Object.keys(cambios).some(k => !contrato.campos.includes(k) || typeof cambios[k] !== 'string')) {
        throw new Error('Los campos a guardar no son válidos.');
    }
    const ruta = `${recurso}/${encodeURIComponent(original[contrato.id])}`;
    const actual = await (await leer(ruta)).json();
    await validarRegistro(recurso, actual, contexto, idConsulta);
    if (Object.keys(cambios).some(k => (actual[k] ?? '') !== (original[k] ?? ''))) {
        throw new Error('El registro cambió en el servidor. Recarga la atención antes de guardar.');
    }
    const datos = { ...actual, ...cambios };
    await leer(ruta, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    return datos;
}

export async function registrarResultadoAtencion(orden, valores, contexto, idConsulta) {
    if (!orden?.idOrdenExamen || typeof valores.resultado !== 'string' || !valores.resultado.trim() || typeof valores.interpretacion !== 'string') {
        throw new Error('Escribe el resultado antes de registrarlo.');
    }
    const actual = await (await leer(`orden_examen/${encodeURIComponent(orden.idOrdenExamen)}`)).json();
    await validarRegistro('orden_examen', actual, contexto, idConsulta);
    const anteriores = await listarCompleto('examen_resultado', 'idExamenResultado');
    if (anteriores.some(r => r.idOrdenExamen?.idOrdenExamen === actual.idOrdenExamen)) {
        throw new Error('La orden ya tiene resultados. Recarga la atención para editarlos.');
    }
    const datos = { fechaCreacion: new Date().toISOString(), resultado: valores.resultado, interpretacion: valores.interpretacion,
        rutaAtestado: null, idOrdenExamen: { idOrdenExamen: actual.idOrdenExamen } };
    await leer('examen_resultado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    // El POST actual devuelve 201 sin cuerpo; se recupera el registro desde el listado.
    // Si no puede recuperarse el UUID, no se ofrece repetir un POST ya confirmado.
    try {
        const nuevos = (await listarCompleto('examen_resultado', 'idExamenResultado')).filter(r =>
            r.idOrdenExamen?.idOrdenExamen === actual.idOrdenExamen && r.resultado === datos.resultado && r.interpretacion === datos.interpretacion);
        if (nuevos.length === 1) return nuevos[0];
    } catch { /* El resultado ya fue persistido; no presentar un fallo de creación. */ }
    return { ...datos, _registrado: true };
}

export async function finalizarAtencion(consulta, contexto) {
    const pasos = await new ConsultaProcedimientoPasoService().listarParaConsultas([consulta.idConsulta]);
    if (!pasos.length || pasos.some(p => !['COMPLETADO', 'FINALIZADO'].includes(String(p.estado ?? '').trim().toUpperCase()))) {
        throw new Error('Completa todos los pasos de atención antes de finalizar la consulta.');
    }
    if (consulta.fechaFin) throw new Error('La consulta ya tiene fecha de finalización.');
    return guardarCamposAtencion('consulta', consulta, { fechaFin: new Date().toISOString() }, contexto, consulta.idConsulta);
}
