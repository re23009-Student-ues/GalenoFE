import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { guardarCamposAtencion, registrarResultadoAtencion, completarPasoAtencion } from '../../../src/js/control/atencion_service.js';
mocha.setup('tdd');
suite('Paso 7: contrato transaccional de atención', () => {
    let sandbox, fetchStub, paso, orden, resultado;
    const usuario = { idPersonaRol: 'empleado', idClinica: { idClinica: 'clinica' }, idRol: { idRol: 'doctor' } };
    const response = dato => new Response(JSON.stringify(dato));
    setup(() => {
        sandbox = sinon.createSandbox(); fetchStub = sandbox.stub(window, 'fetch');
        paso = { idConsultaProcedimientoPaso: 'paso', valor: 'Original', idPersonaRol: usuario, estado: 'PENDIENTE', fechaInicio: '2026-01-01',
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
    for (const [recurso, campo] of [['consulta_procedimiento_paso', 'valor'], ['orden_examen', 'indicaciones'], ['examen_resultado', 'resultado']]) {
        test(`${recurso} conserva la defensa local ante responsable distinto o ausente`, async () => {
            const actual = recurso === 'consulta_procedimiento_paso' ? paso : recurso === 'orden_examen' ? orden : resultado;
            for (const responsable of [{ ...usuario, idPersonaRol: 'otro-empleado' }, null]) {
                paso.idPersonaRol = responsable;fetchStub.callsFake(async () => response(actual));
                await rejects(() => guardarCamposAtencion(recurso, actual, { [campo]: 'Borrador' }, usuario, 'consulta'), 'responsable asignado');
            }
            assert.isTrue(fetchStub.getCalls().every(c => c.args[1].method === 'GET'));
            assert.equal(paso.valor, 'Original');assert.equal(paso.estado, 'PENDIENTE');
        });
        test(`${recurso} un 403 entre lectura y escritura conserva el borrador y no reintenta`, async () => {
            const actual = recurso === 'consulta_procedimiento_paso' ? paso : recurso === 'orden_examen' ? orden : resultado;
            const original = JSON.stringify(actual);
            fetchStub.onFirstCall().resolves(response(actual));fetchStub.onSecondCall().resolves(new Response('', { status: 403 }));
            await rejects(() => guardarCamposAtencion(recurso, actual, { [campo]: 'Borrador' }, usuario, 'consulta'), '403');
            assert.equal(fetchStub.callCount, 2);assert.equal(JSON.stringify(actual), original);
        });
    }
    test('completar conserva la comprobación local de asignación aunque el rol coincida', async () => {
        for (const responsable of [{ ...usuario, idPersonaRol: 'otro-empleado' }, null]) {
            paso.idPersonaRol = responsable;
            await rejects(() => completarPasoAtencion(paso, 'Borrador', usuario, 'consulta'), 'responsable asignado');
        }
        sinon.assert.notCalled(fetchStub);assert.equal(paso.estado, 'PENDIENTE');assert.equal(paso.valor, 'Original');
    });
    test('403 al completar no muta el paso ni repite la solicitud', async () => {
        const original = JSON.stringify(paso);fetchStub.resolves(new Response('', { status: 403 }));
        await rejects(() => completarPasoAtencion(paso, 'Borrador', usuario, 'consulta'), '403');
        sinon.assert.calledOnce(fetchStub);assert.equal(JSON.stringify(paso), original);
    });
    const confirmado = (paso, valor = 'Atención nueva') => ({ ...paso, valor, estado: 'COMPLETADO', idPersonaRol: usuario, fechaFin: '2026-11-15T10:00:00Z' });
    test('completar envía atención y originales al endpoint específico, sin mutar el borrador', async () => {
        fetchStub.callsFake(async (url, opciones) => {
            assert.isTrue(new URL(url).pathname.endsWith('/consulta_procedimiento_paso/paso/completar'));
            assert.equal(opciones.method, 'PUT');
            assert.deepEqual(JSON.parse(opciones.body), { contexto: 'empleado', consulta: 'consulta', valor: 'Atención nueva', originales: { valor: 'Original', estado: 'PENDIENTE' } });
            return response(confirmado(paso));
        });
        const datos = await completarPasoAtencion(paso, 'Atención nueva', usuario, 'consulta');
        assert.equal(datos.estado, 'COMPLETADO'); assert.equal(paso.estado, 'PENDIENTE'); assert.equal(paso.valor, 'Original');
    });
    test('completar exige atención y pertenencia antes de enviar', async () => {
        await rejects(() => completarPasoAtencion(paso, ' ', usuario, 'consulta'), 'atención');
        await rejects(() => completarPasoAtencion(paso, 'Texto', { ...usuario, idRol: { idRol: 'otro' } }, 'consulta'), 'rol');
        await rejects(() => completarPasoAtencion(paso, 'Texto', { ...usuario, idPersonaRol: null }, 'consulta'));
        sinon.assert.notCalled(fetchStub);
    });
    test('completar rechaza confirmaciones con estado, valor, responsable o fecha incorrectos', async () => {
        for (const cambios of [{ estado: 'PENDIENTE' }, { valor: 'Ajeno' }, { idPersonaRol: { idPersonaRol: 'otro' } }, { fechaFin: null }, { idConsultaProcedimientoPaso: 'otro' }]) {
            fetchStub.callsFake(async () => response({ ...confirmado(paso), ...cambios }));
            await rejects(() => completarPasoAtencion(paso, 'Atención nueva', usuario, 'consulta'), 'confirmación');
        }
        assert.equal(paso.estado, 'PENDIENTE');
    });
    test('completar con 409 o red caída conserva originales para reintentar', async () => {
        fetchStub.resolves(new Response('', { status: 409 }));
        await rejects(() => completarPasoAtencion(paso, 'Atención nueva', usuario, 'consulta'), 'Recarga');
        fetchStub.rejects(new Error('Respuesta perdida'));
        await rejects(() => completarPasoAtencion(paso, 'Atención nueva', usuario, 'consulta'));
        fetchStub.callsFake(async () => response(confirmado(paso)));
        await completarPasoAtencion(paso, 'Atención nueva', usuario, 'consulta');
        const cuerpos = fetchStub.getCalls().map(c => c.args[1].body);
        assert.equal(new Set(cuerpos).size, 1); assert.equal(paso.estado, 'PENDIENTE');
    });
});
mocha.run();
