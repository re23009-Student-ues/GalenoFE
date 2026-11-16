import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { retrocederPasoAtencion } from '../../../src/js/control/atencion_service.js';

export function pruebasRetrocesoAtencion() {
    suite('HU4: retroceso confirmado y responsable del paso anterior', () => {
        let sandbox, fetchStub, origen, destino, confirmado;
        const usuario = { idPersonaRol: 'empleado', idClinica: { idClinica: 'clinica' }, idRol: { idRol: 'doctor' } };
        setup(() => {
            const procedimiento = { idConsultaProcedimiento: 'cp', idConsulta: { idConsulta: 'consulta', idPersonaRol: { idClinica: usuario.idClinica } } };
            origen = { idConsultaProcedimientoPaso: 'actual', idConsultaProcedimiento: procedimiento, idProcedimientoPaso: { idProcedimientoPaso: 'def-actual', idRol: usuario.idRol }, estado: 'PENDIENTE', idPersonaRol: usuario };
            destino = { idConsultaProcedimientoPaso: 'anterior', idConsultaProcedimiento: procedimiento, idProcedimientoPaso: { idProcedimientoPaso: 'def-anterior', idRol: { idRol: 'enfermeria' } },
                estado: 'COMPLETADO', valor: 'Atención previa', fechaFin: '2026-11-15T10:00:00Z', idPersonaRol: { idPersonaRol: 'responsable-previo' } };
            confirmado = { destino: { ...destino, estado: 'PENDIENTE', fechaFin: null,
                idPersonaRol: { idPersonaRol: 'sorteado', idClinica: usuario.idClinica, idRol: destino.idProcedimientoPaso.idRol } },
                origen: { ...origen, idPersonaRol: { ...usuario, idPersonaRol: 'otro-responsable-actual' } } };
            sandbox = sinon.createSandbox(); fetchStub = sandbox.stub(window, 'fetch').callsFake(async () => new Response(JSON.stringify(confirmado)));
        });
        teardown(() => sandbox.restore());
        const retroceder = () => retrocederPasoAtencion(origen, destino, usuario, 'consulta');
        async function rechaza(fn, texto) {
            let error; try { await fn(); } catch (e) { error = e; }
            assert.instanceOf(error, Error); if (texto) assert.include(error.message, texto);
        }
        test('envía origen y originales sin inventar estado ni responsable en cliente', async () => {
            const datos = await retroceder(); const [url, opciones] = fetchStub.firstCall.args;
            assert.isTrue(url.endsWith('/consulta_procedimiento_paso/anterior/retroceder')); assert.equal(opciones.method, 'PUT');
            assert.deepEqual(JSON.parse(opciones.body), { contexto: 'empleado', consulta: 'consulta', desde: 'actual',
                originales: { valor: 'Atención previa', estado: 'COMPLETADO', responsable: 'responsable-previo', fechaFin: '2026-11-15T10:00:00Z' },
                originalesOrigen: { valor: null, estado: 'PENDIENTE', responsable: 'empleado', fechaFin: null } });
            assert.equal(datos.destino.idPersonaRol.idPersonaRol, 'sorteado'); assert.equal(datos.origen.idPersonaRol.idPersonaRol, 'otro-responsable-actual');
            assert.equal(destino.estado, 'COMPLETADO'); assert.equal(origen.idPersonaRol.idPersonaRol, 'empleado');
        });
        test('impide destinos iguales, procedimientos ajenos y roles sin participación', async () => {
            await rechaza(() => retrocederPasoAtencion(origen, origen, usuario, 'consulta'));
            await rechaza(() => retrocederPasoAtencion(origen, { ...destino, idConsultaProcedimiento: { ...destino.idConsultaProcedimiento, idConsultaProcedimiento: 'otro' } }, usuario, 'consulta'));
            await rechaza(() => retrocederPasoAtencion(origen, destino, { ...usuario, idRol: { idRol: 'otro' } }, 'consulta'));
            sinon.assert.notCalled(fetchStub);
        });
        test('exige responsable del origen y clínica activa aunque otro empleado tenga el mismo rol', async () => {
            await rechaza(() => retrocederPasoAtencion(origen, destino, { ...usuario, idRol: destino.idProcedimientoPaso.idRol }, 'consulta'));
            await rechaza(() => retrocederPasoAtencion(origen, destino, { ...usuario, idPersonaRol: 'otro-empleado' }, 'consulta'));
            await rechaza(() => retrocederPasoAtencion(origen, destino, { ...usuario, idClinica: { idClinica: 'otra' } }, 'consulta'), 'clínica');
            sinon.assert.notCalled(fetchStub);
        });
        test('rechaza estados, atención o responsables que no correspondan al destino', async () => {
            const base = confirmado.destino;
            for (const cambios of [{ estado: 'COMPLETADO' }, { valor: 'Atención cambiada' }, { fechaFin: destino.fechaFin },
                { idPersonaRol: { ...base.idPersonaRol, idRol: usuario.idRol } }, { idPersonaRol: { ...base.idPersonaRol, idClinica: { idClinica: 'otra' } } },
                { idConsultaProcedimientoPaso: 'otro' }]) {
                confirmado = { ...confirmado, destino: { ...base, ...cambios } }; await rechaza(retroceder, 'confirmación');
            }
        });
        test('rechaza una respuesta que reasigne el origen con rol, estado o contenido incorrectos', async () => {
            const base = confirmado.origen;
            for (const cambios of [{ estado: 'COMPLETADO' }, { valor: 'Contenido ajeno' }, { idPersonaRol: { ...base.idPersonaRol, idRol: destino.idProcedimientoPaso.idRol } }, { fechaFin: '2026-11-15T10:00:00Z' }]) {
                confirmado = { ...confirmado, origen: { ...base, ...cambios } }; await rechaza(retroceder, 'confirmación');
            }
        });
        test('403 indica que ya no es responsable y no cambia los registros locales', async () => {
            fetchStub.resolves(new Response('', { status: 403 })); await rechaza(retroceder, 'Solo el responsable');
            assert.equal(origen.idPersonaRol.idPersonaRol, 'empleado'); assert.equal(destino.estado, 'COMPLETADO');
        });
        test('un origen completado no puede retroceder ni reasignar el paso anterior', async () => {
            for (const estado of ['COMPLETADO', 'FINALIZADO']) {
                origen.estado = estado;
                await rechaza(retroceder, 'Solo el responsable del siguiente paso');
            }
            sinon.assert.notCalled(fetchStub);
        });
        test('conflicto o red caída conserva la solicitud para un reintento', async () => {
            fetchStub.resolves(new Response('', { status: 409 })); await rechaza(retroceder, 'Recarga');
            fetchStub.rejects(new Error('Respuesta perdida')); await rechaza(retroceder);
            fetchStub.callsFake(async () => new Response(JSON.stringify(confirmado))); await retroceder();
            assert.equal(new Set(fetchStub.getCalls().map(c => c.args[1].body)).size, 1); assert.equal(destino.estado, 'COMPLETADO');
        });
    });
}
