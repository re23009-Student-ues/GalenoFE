/** Simula únicamente el contrato REST por conjuntos para las regresiones de UI. */
export function filtrarRelacionesFixture(raw, filas) {
    const url = new URL(raw), params = url.searchParams;
    if (!Array.isArray(filas)) return filas;
    const conjunto = nombre => new Set((params.get(nombre) ?? '').split(','));
    const recurso = url.pathname.split('/resources/v1/')[1];
    const criterios = {
        consulta_procedimiento: ['consultas', f => f.idConsulta?.idConsulta],
        consulta_procedimiento_paso: ['consultas', f => f.idConsultaProcedimiento?.idConsulta?.idConsulta],
        procedimiento_paso: ['procedimientos', f => f.idProcedimiento?.idProcedimiento],
        procedimiento_paso_examen: ['pasos', f => f.idProcedimientoPaso?.idProcedimientoPaso],
        orden_examen: ['consultas', f => f.idConsultaProcedimientoPaso?.idConsultaProcedimiento?.idConsulta?.idConsulta],
        examen_resultado: ['ordenes', f => f.idOrdenExamen?.idOrdenExamen]
    };
    if (recurso === 'procedimiento_paso_secuencia' && params.has('pasos')) {
        const ids = conjunto('pasos');
        return filas.filter(f => ids.has(f.idProcedimientoPaso?.idProcedimientoPaso) || ids.has(f.idProcedimientoPasoReferencia?.idProcedimientoPaso));
    }
    const criterio = criterios[recurso];
    if (!criterio || !params.has(criterio[0])) return filas;
    const ids = conjunto(criterio[0]);
    return filas.filter(f => ids.has(criterio[1](f)) && (!params.has('activo') || f.activo === (params.get('activo') === 'true')));
}
export function respuestaRelacionesFixture(raw, filas) {
    const datos = filtrarRelacionesFixture(raw, filas);
    const params = new URL(raw).searchParams;
    const first = Number(params.get('first') || 0), max = Number(params.get('max') || 50);
    return new Response(JSON.stringify(Array.isArray(datos) ? datos.slice(first, first + max) : datos),
        { headers: Array.isArray(datos) ? { 'Total-registros': String(datos.length) } : {} });
}

/** DTO de estados simulado, separado de los registros de ejecución. */
export function estadosFixture(raw, consultas, pasos = []) {
    const ids = new Set(new URL(raw).searchParams.get('consultas').split(','));
    const ahora = new Date();
    const filas = consultas.filter(c => ids.has(c.idConsulta)).map(c => {
        const propios = pasos.filter(p => p.idConsultaProcedimiento?.idConsulta?.idConsulta === c.idConsulta);
        const finalizados = propios.filter(p => ['COMPLETADO', 'FINALIZADO'].includes(String(p.estado).trim().toUpperCase())).length;
        return { idConsulta: c.idConsulta, totalPasos: propios.length, pasosFinalizados: finalizados,
            estado: propios.length && propios.length === finalizados ? 'Finalizada' : new Date(c.fechaInicio) > ahora ? 'Programada' : 'En curso', evaluadoEn: ahora.toISOString() };
    });
    return new Response(JSON.stringify(filas), { headers: { 'Total-registros': String(filas.length) } });
}
export function dashboardFixture(consultas = []) {
    const ahora = new Date(), anio = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/El_Salvador' }).format(ahora));
    const porMes = Array(12).fill(0); porMes[0] = consultas.length;
    return { anio, evaluadoEn: ahora.toISOString(), zona: 'America/El_Salvador', consultasAnio: consultas.length,
        consultasMes: consultas.length, consultasHoy: 0, pacientesAtendidos: 0, porMes,
        porHorario: { manana: consultas.length, tarde: 0, noche: 0 }, proximas: [], recientes: [] };
}
