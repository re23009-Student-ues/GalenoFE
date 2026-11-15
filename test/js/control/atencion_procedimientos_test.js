import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { procedimientosDelRol, iniciarPasoProcedimiento, finalizarAtencion, flujoDelProcedimiento, guardarCamposAtencion } from '../../../src/js/control/atencion_service.js';

export function pruebasProcedimientos() {
    suite('Elegibilidad e inicio de procedimientos (REST simulado)', () => {
        test('Bloquea el PUT de consulta antes de acceder al REST para conservar procedimientos y pasos', async () => {
            for (const cambios of [{ observaciones: 'Nueva observación' }, { fechaFin: '2026-11-14' }]) {
                await rechaza(() => guardarCamposAtencion('consulta', { idConsulta: 'consulta' }, cambios, {}, 'consulta'), 'PUT genérico de consulta está bloqueado');
            }
            assert.isFalse(fetchStub.called);
        });
        let contexto, procedimiento, definiciones, pasos, secuencias, detalle, sandbox, fetchStub;
        setup(() => {
            contexto = { idPersonaRol: 'empleado', idRol: { idRol: 'medico' }, idClinica: { idClinica: 'clinica' } };
            procedimiento = { idConsultaProcedimiento: 'cp', idProcedimiento: { idProcedimiento: 'proc' },
                idConsulta: { idConsulta: 'consulta', idPersonaRol: { idClinica: contexto.idClinica } } };
            definiciones = [
                { idProcedimientoPaso: 'primero', nombre: 'Triaje', idRol: { idRol: 'enfermeria' } },
                { idProcedimientoPaso: 'segundo', nombre: 'Evaluación', idRol: contexto.idRol }
            ];
            pasos = definiciones.map((d, i) => ({ idConsultaProcedimientoPaso: `ejecucion-${i}`, idProcedimientoPaso: d,
                idConsultaProcedimiento: procedimiento, idPersonaRol: contexto, estado: 'PENDIENTE', valor: 'Valor registrado', fechaInicio: '2026-11-14T08:00:00Z' }));
            secuencias = [{ idProcedimientoPasoSecuencia: 'seq', idProcedimientoPaso: definiciones[0], idProcedimientoPasoReferencia: definiciones[1], tipoSecuencia: 'DEPENDIENTE' }];
            detalle = { procedimientos: [procedimiento], definiciones: new Map([['proc', definiciones]]), secuencias };
            sandbox = sinon.createSandbox();
            fetchStub = sandbox.stub(globalThis, 'fetch').callsFake(async (url, options) => {
                const ruta = new URL(url).pathname.split('/resources/v1/')[1];
                if (options.method === 'PUT') return new Response(JSON.stringify(JSON.parse(options.body)));
                const datos = { 'consulta_procedimiento/cp': procedimiento,
                    'consulta_procedimiento_paso/ejecucion-1': pasos[1], consulta_procedimiento_paso: pasos,
                    procedimiento_paso_secuencia: secuencias, 'procedimiento_paso/procedimiento/proc': definiciones };
                if (!(ruta in datos)) throw new Error('Recurso no simulado: ' + ruta);
                return new Response(JSON.stringify(datos[ruta]));
            });
        });
        teardown(() => sandbox.restore());
        const opcion = () => procedimientosDelRol(detalle, pasos, contexto)[0];
        const puts = () => fetchStub.getCalls().filter(c => c.args[1].method === 'PUT');
        async function rechaza(accion, mensaje) {
            let error;
            try { await accion(); } catch (e) { error = e; }
            assert.instanceOf(error, Error); assert.include(error.message, mensaje);
        }
        test('Muestra solo procedimientos de la clínica con un paso del rol activo', () => {
            detalle.procedimientos.push({ ...procedimiento, idConsultaProcedimiento: 'ajeno', idProcedimiento: { idProcedimiento: 'otro' } });
            detalle.definiciones.set('otro', [{ idProcedimientoPaso: 'otro-paso', idRol: { idRol: 'otro' } }]);
            assert.lengthOf(procedimientosDelRol(detalle, pasos, contexto), 1);
            assert.lengthOf(procedimientosDelRol(detalle, pasos, { ...contexto, idClinica: { idClinica: 'otra' } }), 0);
            assert.lengthOf(procedimientosDelRol(detalle, pasos, null), 0);
        });
        test('Un paso inicial del rol es seleccionable aunque las fechas estén ausentes', () => {
            definiciones[0].idRol = contexto.idRol; delete pasos[0].fechaInicio;
            assert.equal(opcion().paso.idConsultaProcedimientoPaso, 'ejecucion-0');
        });
        test('El anterior pendiente bloquea; únicamente COMPLETADO habilita', () => {
            assert.isNull(opcion().paso);
            for (const estado of ['EN_PROCESO', 'CANCELADO', 'FINALIZADO', '', undefined]) {
                pasos[0].estado = estado; assert.isNull(opcion().paso);
            }
            pasos[0].estado = ' completado '; assert.equal(opcion().paso.idConsultaProcedimientoPaso, 'ejecucion-1');
        });
        test('Un predecesor sin ejecución bloquea aunque el paso propio exista', () => {
            pasos.splice(0, 1); assert.isNull(opcion().paso);
        });
        test('Una dependencia de otro procedimiento no satisface la anterior', () => {
            pasos[0].estado = 'COMPLETADO'; pasos[0].idConsultaProcedimiento = { ...procedimiento, idConsultaProcedimiento: 'otra-asignacion' };
            assert.isNull(opcion().paso);
        });
        test('Las ramas requieren todos los predecesores completos', () => {
            const tercero = { idProcedimientoPaso: 'tercero', idRol: { idRol: 'otro' } };
            definiciones.push(tercero); secuencias.push({ idProcedimientoPaso: tercero, idProcedimientoPasoReferencia: definiciones[1] });
            pasos.push({ ...pasos[0], idConsultaProcedimientoPaso: 'ejecucion-2', idProcedimientoPaso: tercero });
            pasos[0].estado = 'COMPLETADO'; assert.isNull(opcion().paso);
            pasos[2].estado = 'COMPLETADO'; assert.equal(opcion().paso.idConsultaProcedimientoPaso, 'ejecucion-1');
        });
        test('No infiere el primero por orden del JSON y rechaza ciclos o referencias incompletas', () => {
            definiciones.reverse(); assert.isNull(opcion().paso);
            definiciones.reverse(); secuencias.push({ idProcedimientoPaso: definiciones[1], idProcedimientoPasoReferencia: definiciones[0] });
            pasos[0].estado = 'COMPLETADO'; assert.isNull(opcion().paso);
            secuencias.pop(); secuencias.push({ idProcedimientoPaso: { idProcedimientoPaso: 'desconocido' }, idProcedimientoPasoReferencia: definiciones[1] });
            assert.isNull(opcion().paso);
        });
        test('No reabre pasos completados ni escoge ejecuciones duplicadas', () => {
            pasos[0].estado = 'COMPLETADO'; pasos[1].estado = 'COMPLETADO'; assert.isNull(opcion().paso);
            pasos[1].estado = 'PENDIENTE'; pasos.push({ ...pasos[1], idConsultaProcedimientoPaso: 'duplicada' }); assert.isNull(opcion().paso);
        });
        test('Las transiciones sin operación de negocio permanecen bloqueadas sin PUT', async () => {
            await rechaza(() => iniciarPasoProcedimiento('consulta', 'cp', 'ejecucion-1', contexto), 'backend');
            await rechaza(() => finalizarAtencion(procedimiento.idConsulta, contexto), 'backend');
            assert.lengthOf(puts(), 0); assert.isFalse(fetchStub.called);
        });
        test('Ordena ejecuciones reales por dependencias aunque el REST esté invertido', () => {
            definiciones.reverse(); pasos.reverse();
            const flujo = flujoDelProcedimiento(detalle, procedimiento, pasos);
            assert.deepEqual(flujo.pasos.map(p => p.idProcedimientoPaso.idProcedimientoPaso), ['primero', 'segundo']);
            assert.isFalse(flujo.habilitado(flujo.pasos[1]));
            flujo.pasos[0].estado = 'COMPLETADO'; assert.isTrue(flujo.habilitado(flujo.pasos[1]));
        });
        test('Conserva ramas explícitas, sin asumir orden total por UUID', () => {
            const tercero = { idProcedimientoPaso: 'tercero', idRol: contexto.idRol };
            definiciones.push(tercero); pasos.push({ ...pasos[1], idConsultaProcedimientoPaso: 'ejecucion-2', idProcedimientoPaso: tercero });
            secuencias.push({ idProcedimientoPaso: definiciones[0], idProcedimientoPasoReferencia: tercero });
            const flujo = flujoDelProcedimiento(detalle, procedimiento, pasos);
            assert.deepEqual([...flujo.siguientes.get('primero')].sort(), ['segundo', 'tercero']);
            assert.lengthOf(flujo.pasos, 3);
        });
        test('No fabrica ejecuciones faltantes y rechaza duplicados, ciclos y referencias inválidas', () => {
            const flujo = flujoDelProcedimiento(detalle, procedimiento, pasos.slice(0, 1));
            assert.lengthOf(flujo.pasos, 1); assert.lengthOf(flujo.faltantes, 1);
            assert.throws(() => flujoDelProcedimiento(detalle, procedimiento, [...pasos, pasos[0]]), /duplicadas/);
            secuencias.push({ idProcedimientoPaso: definiciones[1], idProcedimientoPasoReferencia: definiciones[0] });
            assert.throws(() => flujoDelProcedimiento(detalle, procedimiento, pasos), /ciclo/);
            secuencias.pop(); secuencias.push({ idProcedimientoPaso: definiciones[1], idProcedimientoPasoReferencia: { idProcedimientoPaso: 'extra' } });
            assert.throws(() => flujoDelProcedimiento(detalle, procedimiento, pasos), /incompletas/);
        });
    });
}
