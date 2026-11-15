import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { guardarCamposAtencion, registrarResultadoAtencion } from '../../../src/js/control/atencion_service.js';
mocha.setup('tdd');
suite('Paso 7: contrato transaccional de atención', () => {
    let sandbox, fetchStub, paso, orden, resultado;
    const usuario = { idPersonaRol: 'empleado', idClinica: { idClinica: 'clinica' }, idRol: { idRol: 'doctor' } };
    const response = dato => new Response(JSON.stringify(dato));
    setup(() => {
        sandbox = sinon.createSandbox(); fetchStub = sandbox.stub(window, 'fetch');
        paso = { idConsultaProcedimientoPaso: 'paso', valor: 'Original', estado: 'PENDIENTE', fechaInicio: '2026-01-01',
            idProcedimientoPaso: { idRol: usuario.idRol }, idConsultaProcedimiento: { idConsulta: { idConsulta: 'consulta', idPersonaRol: { idClinica: usuario.idClinica } } } };
        orden = { idOrdenExamen: 'orden', idConsultaProcedimientoPaso: paso, indicaciones: 'Antes' };
        resultado = { idExamenResultado: 'resultado', idOrdenExamen: orden, resultado: 'Antes', interpretacion: 'Nota', rutaAtestado: 'https://it/adjunto' };
    });
    teardown(() => sandbox.restore());
    async function rejects(fn, texto = '') { let error; try { await fn(); } catch (e) { error = e; } assert.instanceOf(error, Error); assert.include(error.message, texto); }
    for (const [recurso, campo] of [['consulta_procedimiento_paso', 'valor'], ['orden_examen', 'indicaciones'], ['examen_resultado', 'resultado']]) {
        test(`${recurso} envía solo campos, originales y UUID de contexto/consulta`, async () => {
            const actual = recurso === 'consulta_procedimiento_paso' ? paso : recurso === 'orden_examen' ? orden : resultado;
            fetchStub.callsFake(async (raw, opciones) => {
                if (opciones.method === 'GET') return response(actual);
                assert.isTrue(new URL(raw).pathname.endsWith('/atencion'));
                const datos = JSON.parse(opciones.body);
                assert.deepEqual(Object.keys(datos).sort(), ['cambios', 'consulta', 'contexto', 'originales']);
                assert.deepEqual(datos.cambios, { [campo]: 'Nuevo' }); assert.deepEqual(datos.originales, { [campo]: actual[campo] });
                assert.equal(datos.contexto, 'empleado'); assert.equal(datos.consulta, 'consulta');
                assert.notProperty(datos, 'estado'); assert.notProperty(datos, 'idOrdenExamen'); assert.notProperty(datos, 'idConsultaProcedimiento');
                return response({ ...actual, ...datos.cambios, confirmadoPorServidor: true });
            });
            const recibido = await guardarCamposAtencion(recurso, actual, { [campo]: 'Nuevo' }, usuario, 'consulta');
            assert.isTrue(recibido.confirmadoPorServidor); assert.notEqual(actual[campo], 'Nuevo');
        });
    }
    test('original null se conserva explícito y no se normaliza a cadena vacía', async () => {
        paso.valor = null;
        fetchStub.callsFake(async (raw, opciones) => {
            if (opciones.method === 'GET') return response(paso);
            assert.isNull(JSON.parse(opciones.body).originales.valor); return response({ ...paso, valor: 'Texto' });
        });
        await guardarCamposAtencion('consulta_procedimiento_paso', paso, { valor: 'Texto' }, usuario, 'consulta');
    });
    test('campos de estado, relaciones o contexto ausente no se envían', async () => {
        for (const campos of [{ estado: 'COMPLETADO' }, { idConsultaProcedimiento: 'otro' }, { valor: null }]) await rejects(() => guardarCamposAtencion('consulta_procedimiento_paso', paso, campos, usuario, 'consulta'));
        await rejects(() => guardarCamposAtencion('consulta_procedimiento_paso', paso, { valor: 'Nuevo' }, { ...usuario, idPersonaRol: null }, 'consulta'));
        sinon.assert.notCalled(fetchStub);
    });
    test('un cambio observado antes del PUT conserva el borrador y no escribe', async () => {
        fetchStub.callsFake(async () => response({ ...paso, valor: 'Cambio ajeno' }));
        await rejects(() => guardarCamposAtencion('consulta_procedimiento_paso', paso, { valor: 'Mi texto' }, usuario, 'consulta'), 'cambió');
        sinon.assert.calledOnce(fetchStub); assert.equal(paso.valor, 'Original');
    });
    test('un cambio entre GET y PUT se resuelve con el conflicto del servidor', async () => {
        fetchStub.onFirstCall().resolves(response(paso)); fetchStub.onSecondCall().resolves(new Response('', { status: 409 }));
        await rejects(() => guardarCamposAtencion('consulta_procedimiento_paso', paso, { valor: 'Nuevo' }, usuario, 'consulta'), 'Recarga');
        assert.equal(paso.valor, 'Original'); assert.equal(fetchStub.callCount, 2);
    });
    test('respuesta PUT perdida permite reintentar el mismo contenido con originales intactos', async () => {
        const original = { ...paso }; let escrituras = 0;
        fetchStub.callsFake(async (raw, opciones) => {
            if (opciones.method === 'GET') return response(paso);
            const datos = JSON.parse(opciones.body); assert.equal(datos.originales.valor, 'Original');
            paso.valor = datos.cambios.valor;
            if (++escrituras === 1) throw new Error('Respuesta perdida');
            return response(paso);
        });
        await rejects(() => guardarCamposAtencion('consulta_procedimiento_paso', original, { valor: 'Nuevo' }, usuario, 'consulta'));
        assert.equal((await guardarCamposAtencion('consulta_procedimiento_paso', original, { valor: 'Nuevo' }, usuario, 'consulta')).valor, 'Nuevo');
        assert.equal(escrituras, 2); assert.equal(original.valor, 'Original');
    });
    test('POST conserva clave idempotente y envía solo identificadores del contexto', async () => {
        fetchStub.callsFake(async (raw, opciones) => {
            if (opciones.method === 'GET') return response(orden);
            assert.equal(opciones.headers['X-Contexto-Persona-Rol'], 'empleado'); assert.equal(opciones.headers['X-Consulta'], 'consulta');
            assert.isString(opciones.headers['Idempotency-Key']); assert.notProperty(JSON.parse(opciones.body), 'estado');
            return new Response(null, { status: 201 });
        });
        assert.isTrue((await registrarResultadoAtencion(orden, { resultado: 'Nuevo', interpretacion: '' }, usuario, 'consulta'))._registrado);
    });
});
mocha.run();
