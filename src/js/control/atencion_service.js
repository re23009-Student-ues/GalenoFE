import DefaultService from './default_service.js';
import { leer, filtrarConsultasPorRol, listarPorConjunto, procedimientosParaConsultas, definicionesParaProcedimientos, secuenciasParaPasos, resultadosParaOrdenes } from './agenda_service.js';

export async function documentoDelPaciente(idPersona) {
    if (!idPersona) return null;
    const normalizar = id => String(id ?? '').trim().toLowerCase();
    const paginas = new Set();
    let first = 0;
    let elegido = null;
    while (true) {
        const respuesta = await leer(`documento?persona=${encodeURIComponent(idPersona)}&first=${first}&max=50`);
        const documentos = await respuesta.json();
        if (!Array.isArray(documentos)) throw new Error('El servidor no devolvió una lista de documentos válida.');
        for (const documento of documentos) {
            if (normalizar(typeof documento?.idPersona === 'object' ? documento.idPersona?.idPersona : documento?.idPersona) !== normalizar(idPersona)) {
                throw new Error('El servidor devolvió documentos de otra persona.');
            }
            if (!documento.idDocumento) throw new Error('El documento no contiene un identificador válido.');
            // Conserva la selección anterior por UUID, aunque la consulta JPA ordene por tipo.
            if (typeof documento.valor === 'string' && documento.valor.trim() &&
                    (!elegido || normalizar(documento.idDocumento) < normalizar(elegido.idDocumento))) elegido = documento;
        }
        const firma = JSON.stringify(documentos);
        if (documentos.length && paginas.has(firma)) throw new Error('El servidor repitió una página de documentos.');
        paginas.add(firma);
        const cabecera = respuesta.headers.get('Total-registros');
        const total = cabecera !== null && cabecera.trim() !== '' && Number.isSafeInteger(Number(cabecera)) && Number(cabecera) >= 0 ? Number(cabecera) : null;
        first += documentos.length;
        if (total !== null && first >= total || total === null && documentos.length < 50) return elegido;
        if (!documentos.length) throw new Error('No se pudo completar la búsqueda de documentos.');
    }
}

export function pasoDelRol(paso, contexto) {
    return !!contexto?.idRol?.idRol && paso?.idProcedimientoPaso?.idRol?.idRol === contexto.idRol.idRol;
}

/** Carga solo relaciones de la consulta y las definiciones de sus procedimientos. */
export async function cargarDetalleAtencion(idConsulta) {
    const [procedimientos, ordenes] = await Promise.all([
        procedimientosParaConsultas([idConsulta]),
        listarPorConjunto('orden_examen', 'idOrdenExamen', 'consultas', [idConsulta],
            (fila, bloque) => bloque.has(fila.idConsultaProcedimientoPaso?.idConsultaProcedimiento?.idConsulta?.idConsulta))
    ]);
    const pasosDefinidos = await definicionesParaProcedimientos(procedimientos.map(p => p.idProcedimiento?.idProcedimiento));
    const definiciones = new Map([...new Set(procedimientos.map(p => p.idProcedimiento.idProcedimiento))]
        .map(id => [id, pasosDefinidos.filter(d => d.idProcedimiento.idProcedimiento === id)]));
    const idsPasos = pasosDefinidos.map(p => p.idProcedimientoPaso);
    const [configuraciones, secuencias, resultados] = await Promise.all([
        listarPorConjunto('procedimiento_paso_examen', 'idProcedimientoPasoExamen', 'pasos', idsPasos,
            (fila, bloque) => bloque.has(fila.idProcedimientoPaso?.idProcedimientoPaso) && fila.activo === true, { activo: 'true' }),
        secuenciasParaPasos(idsPasos), resultadosParaOrdenes(ordenes.map(o => o.idOrdenExamen))
    ]);
    return { procedimientos, pasosDefinidos, definiciones, secuencias,
        examenes: configuraciones.filter(c => c.idExamen?.activo === true), ordenes, resultados };
}

const estadoPaso = paso => String(paso?.estado ?? '').trim().toUpperCase().replace(/\s+/g, '_');

/** Estados que permiten editar contenido, sin ejecutar transiciones. */
export function estadoEditableAtencion(paso) {
    return ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FINALIZADO'].includes(estadoPaso(paso));
}

/** Orden topológico y relaciones del procedimiento. No fabrica ejecuciones faltantes. */
export function flujoDelProcedimiento(detalle, procedimiento, ejecuciones) {
    const definiciones = detalle.definiciones.get(procedimiento.idProcedimiento?.idProcedimiento) || [];
    const ids = new Set(definiciones.map(d => d.idProcedimientoPaso));
    if (ids.size !== definiciones.length) throw new Error('El procedimiento tiene definiciones duplicadas.');
    const anteriores = new Map(definiciones.map(d => [d.idProcedimientoPaso, new Set()]));
    const siguientes = new Map(definiciones.map(d => [d.idProcedimientoPaso, new Set()]));
    for (const s of detalle.secuencias) {
        const origen = s.idProcedimientoPaso?.idProcedimientoPaso, destino = s.idProcedimientoPasoReferencia?.idProcedimientoPaso;
        if (!ids.has(origen) && !ids.has(destino)) continue;
        if (!ids.has(origen) || !ids.has(destino)) throw new Error('El procedimiento tiene dependencias incompletas.');
        anteriores.get(destino).add(origen); siguientes.get(origen).add(destino);
    }
    const orden = [], visitados = new Set();
    while (true) {
        const disponibles = definiciones.filter(d => !visitados.has(d.idProcedimientoPaso) &&
            [...anteriores.get(d.idProcedimientoPaso)].every(id => visitados.has(id)));
        if (!disponibles.length) break;
        disponibles.forEach(d => { visitados.add(d.idProcedimientoPaso); orden.push(d); });
    }
    if (visitados.size !== ids.size) throw new Error('El procedimiento tiene un ciclo de dependencias.');
    const propios = ejecuciones.filter(p => p.idConsultaProcedimiento?.idConsultaProcedimiento === procedimiento.idConsultaProcedimiento &&
        p.idConsultaProcedimiento?.idConsulta?.idConsulta === procedimiento.idConsulta?.idConsulta);
    if (propios.some(p => !ids.has(p.idProcedimientoPaso?.idProcedimientoPaso))) throw new Error('Hay ejecuciones sin una definición del procedimiento.');
    const porDefinicion = new Map();
    propios.forEach(p => {
        const id = p.idProcedimientoPaso?.idProcedimientoPaso;
        if (porDefinicion.has(id)) throw new Error('Hay ejecuciones duplicadas para un paso del procedimiento.');
        porDefinicion.set(id, p);
    });
    const pasos = orden.flatMap(d => porDefinicion.has(d.idProcedimientoPaso) ? [porDefinicion.get(d.idProcedimientoPaso)] : []);
    const habilitado = paso => [...(anteriores.get(paso.idProcedimientoPaso?.idProcedimientoPaso) || [])]
        .every(id => estadoPaso(porDefinicion.get(id)) === 'COMPLETADO');
    return { pasos, anteriores, siguientes, porDefinicion, habilitado,
        faltantes: orden.filter(d => !porDefinicion.has(d.idProcedimientoPaso)),
        completo: paso => ['COMPLETADO', 'FINALIZADO'].includes(estadoPaso(paso)) };
}

/** El orden proviene del grafo de secuencias, nunca de fechas o del orden del JSON. */
export function procedimientosDelRol(detalle, ejecuciones, contexto) {
    if (!contexto?.idRol?.idRol || !contexto.idClinica?.idClinica) return [];
    return detalle.procedimientos.flatMap(procedimiento => {
        if (procedimiento.idConsulta?.idPersonaRol?.idClinica?.idClinica !== contexto.idClinica.idClinica) return [];
        const definiciones = detalle.definiciones.get(procedimiento.idProcedimiento?.idProcedimiento) || [];
        const propios = definiciones.filter(d => d.idRol?.idRol === contexto.idRol.idRol);
        if (!propios.length) return [];
        const ids = new Set(definiciones.map(d => d.idProcedimientoPaso));
        const anteriores = new Map(definiciones.map(d => [d.idProcedimientoPaso, new Set()]));
        const invalidos = new Set();
        for (const secuencia of detalle.secuencias) {
            const origen = secuencia.idProcedimientoPaso?.idProcedimientoPaso;
            const destino = secuencia.idProcedimientoPasoReferencia?.idProcedimientoPaso;
            if (!ids.has(origen) && !ids.has(destino)) continue;
            if (!ids.has(origen) || !ids.has(destino)) {
                if (ids.has(origen)) invalidos.add(origen);
                if (ids.has(destino)) invalidos.add(destino);
            } else anteriores.get(destino).add(origen);
        }
        // Solo los nodos alcanzables desde un inicio y sin ciclos pueden habilitarse.
        const orden = [], visitados = new Set();
        while (true) {
            const nuevos = definiciones.filter(d => !visitados.has(d.idProcedimientoPaso) && !invalidos.has(d.idProcedimientoPaso) &&
                [...anteriores.get(d.idProcedimientoPaso)].every(id => visitados.has(id)));
            if (!nuevos.length) break;
            nuevos.forEach(d => { visitados.add(d.idProcedimientoPaso); orden.push(d); });
        }
        const pasos = ejecuciones.filter(e => e.idConsultaProcedimiento?.idConsultaProcedimiento === procedimiento.idConsultaProcedimiento &&
            e.idConsultaProcedimiento?.idConsulta?.idConsulta === procedimiento.idConsulta?.idConsulta);
        const disponibles = orden.filter(d => d.idRol?.idRol === contexto.idRol.idRol).flatMap(d => {
            const registros = pasos.filter(e => e.idProcedimientoPaso?.idProcedimientoPaso === d.idProcedimientoPaso);
            if (registros.length !== 1 || !pasoDelRol(registros[0], contexto) || !['PENDIENTE', 'EN_PROCESO', 'EN_CURSO'].includes(estadoPaso(registros[0]))) return [];
            const habilitado = [...anteriores.get(d.idProcedimientoPaso)].every(id => {
                const previos = pasos.filter(e => e.idProcedimientoPaso?.idProcedimientoPaso === id);
                return previos.length === 1 && estadoPaso(previos[0]) === 'COMPLETADO';
            });
            return habilitado ? [registros[0]] : [];
        });
        return [{ procedimiento, pasos, paso: disponibles[0] ?? null,
            mensaje: disponibles.length ? `Paso disponible: ${disponibles[0].idProcedimientoPaso?.nombre || 'Sin nombre'}` :
                'No hay pasos disponibles para tu rol: requieren ejecución y predecesores COMPLETADO; no se reabren pasos finalizados.' }];
    });
}

/** El CRUD existente no valida transiciones clínicas de forma transaccional. */
export async function iniciarPasoProcedimiento() {
    throw new Error('Iniciar el paso requiere una operación validada por el backend.');
}

const contratos = {
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

/** Contrato de escalares: el backend valida contexto y originales bajo bloqueo. */
export async function guardarCamposAtencion(recurso, original, cambios, contexto, idConsulta) {
    if (recurso === 'consulta') {
        throw new Error('Guardar observaciones requiere una operación del backend que conserve los procedimientos y sus pasos; el PUT genérico de consulta está bloqueado.');
    }
    const contrato = contratos[recurso];
    if (!contexto?.idPersonaRol || !idConsulta || !contrato || !original?.[contrato.id] || !Object.keys(cambios).length ||
        Object.keys(cambios).some(k => !contrato.campos.includes(k) || typeof cambios[k] !== 'string')) {
        throw new Error('Los campos a guardar no son válidos.');
    }
    const ruta = `${recurso}/${encodeURIComponent(original[contrato.id])}`;
    const actual = await (await leer(ruta)).json();
    await validarRegistro(recurso, actual, contexto, idConsulta);
    if (Object.keys(cambios).some(k => (actual[k] ?? '') !== (original[k] ?? '') && actual[k] !== cambios[k])) {
        throw new Error('El registro cambió en el servidor. Recarga la atención antes de guardar.');
    }
    const solicitud = { contexto: contexto.idPersonaRol, consulta: idConsulta, cambios,
        originales: Object.fromEntries(Object.keys(cambios).map(k => [k, original[k] ?? null])) };
    try {
        return await (await leer(`${ruta}/atencion`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(solicitud) })).json();
    } catch (error) {
        if (error.status === 409) error.message = 'El registro cambió o ya no permite editar. Recarga la atención antes de guardar.';
        throw error;
    }
}

// Conserva la identidad del envío mientras exista el borrador de esa orden.
const registrosPendientes = new WeakMap();
function claveResultado() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
        .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
}

export async function registrarResultadoAtencion(orden, valores, contexto, idConsulta) {
    if (!contexto?.idPersonaRol || !idConsulta || !orden?.idOrdenExamen || typeof valores.resultado !== 'string' || !valores.resultado.trim() || typeof valores.interpretacion !== 'string') {
        throw new Error('Escribe el resultado antes de registrarlo.');
    }
    const actual = await (await leer(`orden_examen/${encodeURIComponent(orden.idOrdenExamen)}`)).json();
    await validarRegistro('orden_examen', actual, contexto, idConsulta);
    let envio = registrosPendientes.get(orden);
    if (envio && (envio.datos.resultado !== valores.resultado || envio.datos.interpretacion !== valores.interpretacion)) {
        throw new Error('Hay un envío previo de esta orden. Recupera el contenido original para reintentar o recarga la atención antes de editarlo.');
    }
    if (!envio) {
        envio = { clave: claveResultado(), confirmado: false,
            datos: { resultado: valores.resultado, interpretacion: valores.interpretacion,
                rutaAtestado: null, idOrdenExamen: { idOrdenExamen: actual.idOrdenExamen } } };
        registrosPendientes.set(orden, envio);
    }
    if (envio.registro) return envio.registro;
    if (!envio.confirmado) {
        // Si se pierde la respuesta, el siguiente intento conserva clave y contenido.
        let respuesta;
        try {
            respuesta = await leer('examen_resultado/atencion', { method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Idempotency-Key': envio.clave,
                    'X-Contexto-Persona-Rol': contexto.idPersonaRol, 'X-Consulta': idConsulta }, body: JSON.stringify(envio.datos) });
        } catch (error) {
            if (error.status === 409) error.message = 'El registro del resultado entra en conflicto (409). Recarga la atención para revisar el resultado existente.';
            throw error;
        }
        if (![200, 201].includes(respuesta.status)) throw new Error('El servidor no confirmó el registro del resultado.');
        envio.confirmado = true;
        envio.location = respuesta.headers.get('Location');
    }
    try {
        if (!envio.location) throw new Error('Location ausente');
        // Solo seguir Location del recurso esperado y del mismo servidor REST.
        const base = new URL('examen_resultado', new DefaultService().BASE_URL);
        const url = new URL(envio.location, base);
        if (url.origin !== base.origin || url.username || url.password || url.search || url.hash ||
                url.pathname !== `${base.pathname}/${envio.clave}`) throw new Error('Location no válido');
        const ruta = `examen_resultado/${encodeURIComponent(envio.clave)}`;
        const registro = await (await leer(ruta, { cache: 'no-store' })).json();
        if (registro?.idExamenResultado !== envio.clave || registro.idOrdenExamen?.idOrdenExamen !== actual.idOrdenExamen ||
                registro.resultado !== envio.datos.resultado || registro.interpretacion !== envio.datos.interpretacion) {
            throw new Error('El resultado recuperado no corresponde al envío');
        }
        await validarRegistro('examen_resultado', registro, contexto, idConsulta);
        envio.registro = registro;
        return registro;
    } catch {
        // La confirmación ya llegó: conservar el éxito y bloquear otro POST sin inventar un UUID editable.
        return { ...envio.datos, _registrado: true };
    }
}

export async function finalizarAtencion() {
    throw new Error('La finalización de un procedimiento requiere una operación validada por el backend; no se cerrará toda la consulta.');
}
