import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { listarPorConjunto, procedimientosParaConsultas, ejecucionesParaConsultas, definicionesParaProcedimientos,
    secuenciasParaPasos, resultadosParaOrdenes, buscarCitas, cargarAgenda } from '../../../src/js/control/agenda_service.js';
import { cargarDetalleAtencion } from '../../../src/js/control/atencion_service.js';
import ConsultaProcedimientoPasoService from '../../../src/js/control/consultaProcedimientoPaso_service.js';
mocha.setup('tdd');
suite('Paso 4: relaciones por conjuntos', () => {
    let sandbox, fetchStub;
    const response = (rows, total = rows.length) => new Response(JSON.stringify(rows), { headers: { 'Total-registros': String(total) } });
    const c = { idConsulta: 'consulta' };
    const cp = { idConsultaProcedimiento: 'cp', idConsulta: c, idProcedimiento: { idProcedimiento: 'proc' } };
    const def = { idProcedimientoPaso: 'paso', idProcedimiento: cp.idProcedimiento, idRol: { idRol: 'doctor' } };
    const ejecucion = { idConsultaProcedimientoPaso: 'ejecucion', idConsultaProcedimiento: cp, idProcedimientoPaso: def };
    setup(() => { sandbox = sinon.createSandbox(); fetchStub = sandbox.stub(window, 'fetch'); });
    teardown(() => sandbox.restore());
    async function rejects(fn, texto) { let error; try { await fn(); } catch (e) { error = e; } assert.instanceOf(error, Error); assert.include(error.message, texto); }
    test('123 relaciones de una consulta completan páginas 0/50/100 con total filtrado', async () => {
        const rows = Array.from({ length: 123 }, (_, i) => ({ ...cp, idConsultaProcedimiento: String(i) }));
        fetchStub.callsFake(async raw => {
            const url = new URL(raw); assert.equal(url.searchParams.get('consultas'), 'consulta');
            const first = Number(url.searchParams.get('first')); return response(rows.slice(first, first + 50), 123);
        });
        assert.deepEqual(await procedimientosParaConsultas(['consulta']), rows);
        assert.deepEqual(fetchStub.getCalls().map(call => new URL(call.args[0]).searchParams.get('first')), ['0', '50', '100']);
    });
    test('123 consultas se dividen en conjuntos 50/50/23 sin repetir UUID', async () => {
        const ids = Array.from({ length: 123 }, (_, i) => 'consulta-' + i);
        fetchStub.callsFake(async raw => {
            const bloque = new URL(raw).searchParams.get('consultas').split(','); assert.isAtMost(bloque.length, 50);
            return response(bloque.map(id => ({ idConsultaProcedimiento: 'cp-' + id, idConsulta: { idConsulta: id } })));
        });
        assert.lengthOf(await procedimientosParaConsultas([...ids, ids[0]]), 123);
        assert.deepEqual(fetchStub.getCalls().map(call => new URL(call.args[0]).searchParams.get('consultas').split(',').length), [50, 50, 23]);
    });
    test('conjuntos vacíos no hacen peticiones', async () => {
        for (const cargar of [procedimientosParaConsultas, ejecucionesParaConsultas, definicionesParaProcedimientos, secuenciasParaPasos, resultadosParaOrdenes]) assert.deepEqual(await cargar([]), []);
        assert.deepEqual(await new ConsultaProcedimientoPasoService().listarParaConsultas([]), []); sinon.assert.notCalled(fetchStub);
    });
    test('ejecuciones usan consultas y el consumidor de tarjetas conserva el contrato', async () => {
        fetchStub.callsFake(async raw => { assert.equal(new URL(raw).searchParams.get('consultas'), 'consulta'); return response([ejecucion]); });
        assert.deepEqual(await new ConsultaProcedimientoPasoService().listarParaConsultas(['consulta']), [ejecucion]);
    });
    test('definiciones y resultados se filtran por sus propietarios', async () => {
        fetchStub.onFirstCall().resolves(response([def])); fetchStub.onSecondCall().resolves(response([{ idExamenResultado: 'r', idOrdenExamen: { idOrdenExamen: 'orden' } }]));
        assert.deepEqual(await definicionesParaProcedimientos(['proc']), [def]); await resultadosParaOrdenes(['orden']);
        assert.equal(new URL(fetchStub.firstCall.args[0]).searchParams.get('procedimientos'), 'proc');
        assert.equal(new URL(fetchStub.secondCall.args[0]).searchParams.get('ordenes'), 'orden');
    });
    test('secuencias conservan enlaces externos entrantes y deduplican entre bloques', async () => {
        const ids = Array.from({ length: 51 }, (_, i) => 'paso-' + i);
        const enlace = { idProcedimientoPasoSecuencia: 's', idProcedimientoPaso: { idProcedimientoPaso: ids[0] }, idProcedimientoPasoReferencia: { idProcedimientoPaso: ids[50] } };
        fetchStub.callsFake(async () => response([enlace])); assert.deepEqual(await secuenciasParaPasos(ids), [enlace]); assert.equal(fetchStub.callCount, 2);
        fetchStub.resolves(response([{ ...enlace, idProcedimientoPaso: { idProcedimientoPaso: 'externo' } }]));
        assert.lengthOf(await secuenciasParaPasos([ids[50]]), 1);
    });
    test('ningún recurso acepta relaciones ajenas del servidor', async () => {
        for (const cargar of [procedimientosParaConsultas, ejecucionesParaConsultas, definicionesParaProcedimientos, secuenciasParaPasos, resultadosParaOrdenes]) {
            fetchStub.resolves(response([{ idConsultaProcedimiento: 'id', idConsultaProcedimientoPaso: 'id', idProcedimientoPaso: 'id', idProcedimientoPasoSecuencia: 'id', idExamenResultado: 'id' }]));
            await rejects(() => cargar(['permitido']), 'ajenas');
        }
    });
    test('página parcial, duplicada, total cambiante o ausente rechazan toda la carga', async () => {
        const rows = Array.from({ length: 50 }, (_, i) => ({ ...cp, idConsultaProcedimiento: String(i) }));
        const scenarios = [[response(rows, 51), response([], 51)], [response(rows, 100), response(rows, 100)],
            [response(rows, 51), response([{ ...cp, idConsultaProcedimiento: 'nuevo' }], 52)], [new Response('[]')], [response([cp], 0)]];
        for (const responses of scenarios) {
            fetchStub.reset(); responses.forEach((r, i) => fetchStub.onCall(i).resolves(r));
            await rejects(() => procedimientosParaConsultas(['consulta']), '');
        }
    });
    test('HTTP 500 no produce una lista vacía', async () => {
        fetchStub.resolves(new Response('', { status: 500 })); await rejects(() => procedimientosParaConsultas(['consulta']), '500');
    });
    test('identificador ausente impide una descarga global', async () => {
        await rejects(() => definicionesParaProcedimientos([undefined]), 'identificador'); sinon.assert.notCalled(fetchStub);
    });
    test('atención carga relaciones encadenadas y solo configuraciones activas', async () => {
        const orden = { idOrdenExamen: 'orden', idConsultaProcedimientoPaso: ejecucion };
        const config = { idProcedimientoPasoExamen: 'config', idProcedimientoPaso: def, activo: true, idExamen: { activo: true } };
        const result = { idExamenResultado: 'resultado', idOrdenExamen: orden };
        fetchStub.callsFake(async raw => {
            const url = new URL(raw), recurso = url.pathname.split('/').pop();
            const rows = { consulta_procedimiento: [cp], procedimiento_paso: [def], orden_examen: [orden], procedimiento_paso_examen: [config], procedimiento_paso_secuencia: [], examen_resultado: [result] };
            assert.property(rows, recurso); assert.isFalse(url.searchParams.has('first') && url.searchParams.size === 2);
            if (recurso === 'procedimiento_paso_examen') { assert.equal(url.searchParams.get('activo'), 'true'); assert.equal(url.searchParams.get('pasos'), 'paso'); }
            return response(rows[recurso]);
        });
        const detalle = await cargarDetalleAtencion('consulta'); assert.deepEqual(detalle.examenes, [config]); assert.deepEqual(detalle.resultados, [result]);
        assert.deepEqual(detalle.definiciones.get('proc'), [def]);
    });
    test('sin procedimientos ni órdenes no descarga catálogos, configuraciones ni resultados', async () => {
        fetchStub.callsFake(async () => response([])); const detalle = await cargarDetalleAtencion('consulta');
        assert.isEmpty(detalle.pasosDefinidos); assert.equal(fetchStub.callCount, 2);
    });
    test('agenda mantiene definiciones del rol sin ejecución y usa relaciones filtradas', async () => {
        const contexto = { idPersonaRol: 'empleado', idClinica: { idClinica: 'clinica' }, idRol: { idRol: 'doctor', nombre: 'Doctor' } };
        const consulta = { ...c, idPersonaRol: { idClinica: contexto.idClinica } };
        fetchStub.callsFake(async raw => {
            const url = new URL(raw), recurso = url.pathname.split('/').pop();
            const rows = { consulta: [consulta], consulta_procedimiento: [cp], consulta_procedimiento_paso: [], procedimiento_paso: [def], procedimiento_paso_secuencia: [] };
            assert.property(rows, recurso); if (recurso !== 'consulta') assert.isTrue(['consultas', 'procedimientos', 'pasos'].some(p => url.searchParams.has(p)));
            return response(rows[recurso]);
        });
        const agenda = await cargarAgenda(contexto, '2026-01-01', '2026-01-01');
        assert.deepEqual(agenda[0].procedimientos[0].pasosDelRol[0].registros, []);
    });
});
mocha.run();
