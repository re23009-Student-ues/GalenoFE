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

export function esResponsableDelPaso(paso, contexto) {
    return !!contexto?.idPersonaRol && paso?.idPersonaRol?.idPersonaRol === contexto.idPersonaRol && pasoDelRol(paso, contexto) &&
        !!contexto.idClinica?.idClinica && paso.idConsultaProcedimiento?.idConsulta?.idPersonaRol?.idClinica?.idClinica === contexto.idClinica.idClinica;
}

/** Convención temporal mientras orden_examen no referencia el examen del catálogo. */
export function prefijoOrdenExamen(paso, examen) {
    const nombres = [paso?.idProcedimientoPaso?.nombre, examen?.idExamen?.nombre];
    if (nombres.some(n => typeof n !== 'string' || !n.trim() || /[\r\n]/.test(n))) {
        throw new Error('El paso y el examen deben tener nombres válidos para identificar la orden.');
    }
    return nombres.map(n => `[${n.trim()}]`).join(' ');
}

export function indicacionesOrdenExamen(paso, examen, texto = '') {
    if (typeof texto !== 'string') throw new Error('Las indicaciones deben ser texto.');
    return prefijoOrdenExamen(paso, examen) + (texto ? ` ${texto}` : '');
}

export function textoOrdenExamen(paso, examen, orden) {
    if (!paso?.idConsultaProcedimientoPaso || orden?.idConsultaProcedimientoPaso?.idConsultaProcedimientoPaso !== paso.idConsultaProcedimientoPaso ||
            examen?.idProcedimientoPaso?.idProcedimientoPaso !== paso.idProcedimientoPaso?.idProcedimientoPaso || typeof orden.indicaciones !== 'string') return null;
    let prefijo;
    try { prefijo = prefijoOrdenExamen(paso, examen); } catch { return null; }
    const literal = prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const coincidencia = new RegExp(`^${literal}(?: ([\\s\\S]*))?$`).exec(orden.indicaciones);
    return coincidencia ? coincidencia[1] ?? '' : null;
}

/** Solo coincidencias únicas del mismo paso; nunca asigna órdenes históricas por posición. */
export function ordenesDeExamenes(paso, examenes, ordenes) {
    const asociaciones = new Map();
    for (const examen of examenes) {
        let prefijo;
        try { prefijo = prefijoOrdenExamen(paso, examen); } catch { continue; }
        if (examenes.filter(e => {
            try { return prefijoOrdenExamen(paso, e) === prefijo; } catch { return false; }
        }).length !== 1) continue;
        const candidatas = ordenes.filter(o => textoOrdenExamen(paso, examen, o) !== null);
        if (candidatas.length === 1) asociaciones.set(examen.idProcedimientoPasoExamen, candidatas[0]);
    }
    return asociaciones;
}

const enviosOrdenes = new WeakMap();
export async function registrarOrdenAtencion(paso, examen, texto, contexto, idConsulta) {
    const indicaciones = indicacionesOrdenExamen(paso, examen, texto);
    if (!contexto?.idPersonaRol || !idConsulta || !paso?.idConsultaProcedimientoPaso || !examen?.idProcedimientoPasoExamen || examen.activo !== true || examen.idExamen?.activo !== true ||
            examen.idProcedimientoPaso?.idProcedimientoPaso !== paso.idProcedimientoPaso?.idProcedimientoPaso) {
        throw new Error('El examen no está disponible para este paso.');
    }
    const actual = await (await leer(`consulta_procedimiento_paso/${encodeURIComponent(paso.idConsultaProcedimientoPaso)}`)).json();
    await validarRegistro('consulta_procedimiento_paso', actual, contexto, idConsulta);
    if (!estadoEditableAtencion(actual) || actual.idConsultaProcedimiento?.fechaFin ||
            actual.idProcedimientoPaso?.idProcedimientoPaso !== paso.idProcedimientoPaso?.idProcedimientoPaso ||
            prefijoOrdenExamen(actual, examen) !== prefijoOrdenExamen(paso, examen)) throw new Error('El paso cambió o no permite registrar órdenes.');
    const ordenes = await listarPorConjunto('orden_examen', 'idOrdenExamen', 'consultas', [idConsulta],
        (fila, bloque) => bloque.has(fila.idConsultaProcedimientoPaso?.idConsultaProcedimiento?.idConsulta?.idConsulta));
    const existentes = ordenes.filter(o => textoOrdenExamen(paso, examen, o) !== null);
    if (existentes.length > 1) throw new Error('Hay varias órdenes con el mismo paso y examen. Revisa las órdenes antes de guardar.');
    if (existentes.length === 1) return existentes[0];
    let envios = enviosOrdenes.get(paso);
    if (!envios) { envios = new Set(); enviosOrdenes.set(paso, envios); }
    if (envios.has(examen.idProcedimientoPasoExamen)) {
        throw new Error('No se pudo confirmar la orden enviada. Revisa el registro antes de volver a crearla.');
    }
    envios.add(examen.idProcedimientoPasoExamen);
    let respuesta;
    try {
        respuesta = await leer('orden_examen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ indicaciones, idConsultaProcedimientoPaso: { idConsultaProcedimientoPaso: paso.idConsultaProcedimientoPaso } }) });
    } catch (error) {
        if (error.status >= 400 && error.status < 500) envios.delete(examen.idProcedimientoPasoExamen);
        throw error;
    }
    if (respuesta.status !== 201) throw new Error('El servidor no confirmó la creación de la orden.');
    const base = new URL('orden_examen/', new DefaultService().BASE_URL);
    const location = respuesta.headers.get('Location');
    const url = location ? new URL(location, base) : null;
    if (!url || url.origin !== base.origin || url.username || url.password || url.search || url.hash ||
            !url.pathname.startsWith(base.pathname) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.pathname.slice(base.pathname.length))) {
        throw new Error('Orden creada sin una referencia válida. Reintenta para recuperar el registro sin repetir el envío.');
    }
    const orden = await (await leer(`orden_examen/${url.pathname.slice(base.pathname.length)}`)).json();
    if (orden.idOrdenExamen !== url.pathname.slice(base.pathname.length) || orden.indicaciones !== indicaciones || textoOrdenExamen(paso, examen, orden) === null) {
        throw new Error('La orden recuperada no corresponde al paso y examen seleccionados.');
    }
    return orden;
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

export const esPasoInvalido = paso => String(paso?.estado ?? '').trim().toUpperCase() === 'INVALIDO';
const estadoPaso = paso => String(paso?.estado ?? '').trim().toUpperCase().replace(/\s+/g, '_');

/** Estados que permiten editar contenido, sin ejecutar transiciones. */
export function estadoEditableAtencion(paso) {
    return ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FINALIZADO'].includes(estadoPaso(paso));
}

/** Conserva la cadena secuencial y revela una bifurcación solo al elegir su destino. */
export function pasosDelCamino(flujo, elecciones = new Map()) {
    const visibles = new Set();
    const pendientes = [...flujo.anteriores].filter(([, anteriores]) => !anteriores.size).map(([id]) => id);
    while (pendientes.length) {
        const id = pendientes.pop();
        if (visibles.has(id)) continue;
        if (esPasoInvalido(flujo.porDefinicion?.get(id))) continue;
        visibles.add(id);
        const siguientes = new Set([...(flujo.siguientes.get(id) || [])].filter(destino => !esPasoInvalido(flujo.porDefinicion?.get(destino))));
        if (siguientes.size < 2) pendientes.push(...siguientes);
        else if (siguientes.has(elecciones.get(id))) pendientes.push(elecciones.get(id));
    }
    return visibles;
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
    const habilitado = paso => {
        const previos = [...(anteriores.get(paso.idProcedimientoPaso?.idProcedimientoPaso) || [])];
        if (!previos.every(id => ['COMPLETADO', 'INVALIDO'].includes(estadoPaso(porDefinicion.get(id))))) return false;
        const visitados = new Set();
        while (previos.length) {
            const id = previos.pop();
            if (visitados.has(id) || esPasoInvalido(porDefinicion.get(id))) continue;
            visitados.add(id);
            if ([...(siguientes.get(id) || [])].filter(destino => !esPasoInvalido(porDefinicion.get(destino))).length > 1) return false;
            previos.push(...(anteriores.get(id) || []));
        }
        return true;
    };
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

/** Atención y transición se confirman juntas; los originales permiten detectar conflictos. */
export async function completarPasoAtencion(paso, valor, contexto, idConsulta, camino = null) {
    if (!paso?.idConsultaProcedimientoPaso || !contexto?.idPersonaRol || !idConsulta || typeof valor !== 'string' || !valor.trim()) {
        throw new Error('Registra la atención brindada para completar el paso.');
    }
    await validarRegistro('consulta_procedimiento_paso', paso, contexto, idConsulta);
    const solicitud = { contexto: contexto.idPersonaRol, consulta: idConsulta, valor,
        originales: { valor: paso.valor ?? null, estado: paso.estado ?? null } };
    if (camino) solicitud.siguiente = camino.siguiente;
    try {
        const respuesta = await leer(`consulta_procedimiento_paso/${encodeURIComponent(paso.idConsultaProcedimientoPaso)}/completar`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(solicitud)
        });
        if (respuesta.status !== 200) throw new Error('El servidor no confirmó que el paso esté completado.');
        const confirmacion = await respuesta.json();
        const datos = camino ? confirmacion.paso : confirmacion;
        if (!datos || datos.idConsultaProcedimientoPaso !== paso.idConsultaProcedimientoPaso || datos.valor !== valor ||
                !['COMPLETADO', 'FINALIZADO'].includes(estadoPaso(datos)) || datos.idPersonaRol?.idPersonaRol !== contexto.idPersonaRol ||
                !datos.fechaFin || !Number.isFinite(Date.parse(String(datos.fechaFin).replace(/\[.*\]$/, '')))) {
            throw new Error('El servidor no devolvió una confirmación válida del paso completado.');
        }
        await validarRegistro('consulta_procedimiento_paso', datos, contexto, idConsulta);
        if (camino) {
            const esperados = new Set(camino.pasos.map(p => p.idConsultaProcedimientoPaso));
            const confirmados = confirmacion.pasos;
            if (!Array.isArray(confirmados) || confirmados.length !== esperados.size ||
                    new Set(confirmados.map(p => p.idConsultaProcedimientoPaso)).size !== esperados.size ||
                    confirmados.some(p => !esperados.has(p.idConsultaProcedimientoPaso) || p.idConsultaProcedimiento?.idConsultaProcedimiento !== paso.idConsultaProcedimiento?.idConsultaProcedimiento ||
                        p.idConsultaProcedimiento?.idConsulta?.idConsulta !== idConsulta) ||
                    !confirmados.some(p => p.idConsultaProcedimientoPaso === camino.siguiente && !esPasoInvalido(p))) {
                throw new Error('El servidor no confirmó todos los pasos del camino. Recarga la atención.');
            }
            return { ...datos, _pasosConfirmados: confirmados };
        }
        return datos;
    } catch (error) {
        if (error.status === 409) error.message = 'El paso cambió o ya no permite completarse. Recarga la atención antes de continuar.';
        throw error;
    }
}

/** El responsable actual solicita reabrir el predecesor y reasignar ambos pasos. */
export async function retrocederPasoAtencion(origen, destino, contexto, idConsulta) {
    const procedimiento = destino?.idConsultaProcedimiento;
    const rol = contexto?.idRol?.idRol, clinica = contexto?.idClinica?.idClinica;
    if (!contexto?.idPersonaRol || !rol || !clinica || !idConsulta || !origen?.idConsultaProcedimientoPaso || !destino?.idConsultaProcedimientoPaso ||
            origen.idConsultaProcedimientoPaso === destino.idConsultaProcedimientoPaso || !procedimiento?.idConsultaProcedimiento ||
            origen.idConsultaProcedimiento?.idConsultaProcedimiento !== procedimiento.idConsultaProcedimiento ||
            origen.idConsultaProcedimiento?.idConsulta?.idConsulta !== idConsulta || procedimiento.idConsulta?.idConsulta !== idConsulta ||
            procedimiento.idConsulta.idPersonaRol?.idClinica?.idClinica !== clinica ||
            !esResponsableDelPaso(origen, contexto)) {
        throw new Error('El retroceso no corresponde al procedimiento, rol o clínica activos.');
    }
    if (['COMPLETADO', 'FINALIZADO'].includes(estadoPaso(origen))) {
        throw new Error('El paso actual ya está completado. Solo el responsable del siguiente paso puede solicitar su reapertura.');
    }
    const originales = paso => ({ valor: paso.valor ?? null, estado: paso.estado ?? null,
        responsable: paso.idPersonaRol?.idPersonaRol ?? null, fechaFin: paso.fechaFin ?? null });
    const solicitud = { contexto: contexto.idPersonaRol, consulta: idConsulta, desde: origen.idConsultaProcedimientoPaso,
        originales: originales(destino), originalesOrigen: originales(origen) };
    try {
        const respuesta = await leer(`consulta_procedimiento_paso/${encodeURIComponent(destino.idConsultaProcedimientoPaso)}/retroceder`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(solicitud)
        });
        if (respuesta.status !== 200) throw new Error('El servidor no confirmó la reapertura del paso anterior.');
        const datos = await respuesta.json();
        const corresponde = (actual, esperado) => actual?.idConsultaProcedimientoPaso === esperado.idConsultaProcedimientoPaso &&
            (actual.valor ?? null) === (esperado.valor ?? null) && actual.idConsultaProcedimiento?.idConsultaProcedimiento === procedimiento.idConsultaProcedimiento &&
            actual.idConsultaProcedimiento?.idConsulta?.idConsulta === idConsulta && actual.idConsultaProcedimiento?.idConsulta?.idPersonaRol?.idClinica?.idClinica === clinica &&
            actual.idProcedimientoPaso?.idProcedimientoPaso === esperado.idProcedimientoPaso?.idProcedimientoPaso &&
            !!actual.idPersonaRol?.idPersonaRol && actual.idPersonaRol.idClinica?.idClinica === clinica && actual.idPersonaRol.idRol?.idRol === esperado.idProcedimientoPaso?.idRol?.idRol;
        const fecha = valor => valor == null ? null : Date.parse(String(valor).replace(/\[.*\]$/, ''));
        if (!corresponde(datos?.destino, destino) || !corresponde(datos?.origen, origen) || estadoPaso(datos.destino) !== 'PENDIENTE' || datos.destino.fechaFin != null ||
                datos.origen.estado !== origen.estado || fecha(datos.origen.fechaFin) !== fecha(origen.fechaFin)) {
            throw new Error('El servidor no devolvió una confirmación válida de ambos pasos y sus responsables.');
        }
        return datos;
    } catch (error) {
        if (error.status === 403) error.message = 'Solo el responsable asignado al paso actual puede regresar. Recarga la atención para revisar la asignación.';
        if (error.status === 409) error.message = 'El paso anterior cambió o no permite reabrirse. Recarga la atención antes de regresar.';
        throw error;
    }
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
    if (recurso !== 'consulta' && !esResponsableDelPaso(paso, contexto)) {
        throw new Error('Solo el responsable asignado puede trabajar este paso.');
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
