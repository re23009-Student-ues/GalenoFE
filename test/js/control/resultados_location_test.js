import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { registrarResultadoAtencion } from '../../../src/js/control/atencion_service.js';
mocha.setup('tdd');
suite('Paso 6: Location y reintentos de resultados', () => {
    let sandbox, fetchStub, orden, guardado, posts;
    const contexto = { idPersonaRol: 'empleado', idRol: { idRol: 'doctor' }, idClinica: { idClinica: 'clinica' } };
    const valores = { resultado: 'Contenido explícito', interpretacion: 'Interpretación' };
    const response = datos => new Response(JSON.stringify(datos));
    const registrar = () => registrarResultadoAtencion(orden, valores, contexto, 'consulta');
    const created = (url, status = 201) => new Response(null, { status, headers: { Location: `${url.replace(/\/atencion$/, '')}/${guardado.idExamenResultado}` } });
    setup(() => {
        sandbox = sinon.createSandbox(); posts = [];
        orden = { idOrdenExamen: 'orden', idConsultaProcedimientoPaso: { idPersonaRol: contexto, idProcedimientoPaso: { idRol: contexto.idRol },
            idConsultaProcedimiento: { idConsulta: { idConsulta: 'consulta', idPersonaRol: { idClinica: contexto.idClinica } } } } };
        fetchStub = sandbox.stub(window, 'fetch').callsFake(async (raw, options) => {
            const url = new URL(raw);
            if (url.pathname.endsWith('/orden_examen/orden')) return response(orden);
            if (options.method === 'POST') {
                posts.push(options); guardado = { ...JSON.parse(options.body), idExamenResultado: options.headers['Idempotency-Key'], idOrdenExamen: orden };
                return created(raw);
            }
            assert.equal(url.pathname.split('/').pop(), guardado.idExamenResultado); return response(guardado);
        });
    });
    teardown(() => sandbox.restore());
    async function rejects(fn, mensaje = '') { let error; try { await fn(); } catch (e) { error = e; } assert.instanceOf(error, Error); assert.include(error.message, mensaje); }
    test('POST 201 recupera únicamente por Location y conserva el UUID editable', async () => {
        const resultado = await registrar(); assert.equal(resultado.idExamenResultado, guardado.idExamenResultado); assert.notProperty(resultado, '_registrado');
        assert.equal(posts.length, 1); assert.match(posts[0].headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
        const urls = fetchStub.getCalls().map(c => new URL(c.args[0])); assert.lengthOf(urls, 3);
        assert.isTrue(urls.every(u => !u.search)); assert.equal(fetchStub.lastCall.args[1].cache, 'no-store');
    });
    test('un segundo guardado confirmado no repite el POST', async () => {
        const primero = await registrar(); assert.strictEqual(await registrar(), primero); assert.equal(posts.length, 1);
    });
    test('respuesta POST perdida conserva clave y cuerpo y acepta replay 200', async () => {
        fetchStub.callsFake(async (raw, options) => {
            if (raw.includes('/orden_examen/')) return response(orden);
            if (options.method === 'POST') {
                posts.push(options); guardado = { ...JSON.parse(options.body), idExamenResultado: options.headers['Idempotency-Key'], idOrdenExamen: orden };
                if (posts.length === 1) throw new Error('Respuesta perdida después de persistir');
                return created(raw, 200);
            }
            return response(guardado);
        });
        await rejects(registrar, 'conectar'); const resultado = await registrar();
        assert.equal(posts.length, 2); assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
        assert.equal(posts[0].body, posts[1].body); assert.equal(resultado.idExamenResultado, guardado.idExamenResultado);
    });
    test('no reutiliza la clave pendiente con contenido cambiado', async () => {
        fetchStub.callsFake(async (raw, options) => { if (raw.includes('/orden_examen/')) return response(orden); posts.push(options); throw new Error('Sin respuesta'); });
        await rejects(registrar); await rejects(() => registrarResultadoAtencion(orden, { ...valores, resultado: 'Otro' }, contexto, 'consulta'), 'envío previo'); assert.equal(posts.length, 1);
    });
    test('Location ausente confirma guardado sin volver a enviar ni recorrer resultados', async () => {
        fetchStub.callsFake(async (raw, options) => { if (raw.includes('/orden_examen/')) return response(orden); assert.equal(options.method, 'POST'); posts.push(options); return new Response(null, { status: 201 }); });
        assert.isTrue((await registrar())._registrado); assert.isTrue((await registrar())._registrado); assert.equal(posts.length, 1);
    });
    test('GET de recuperación fallido no convierte el POST confirmado en un reintento de creación', async () => {
        fetchStub.callsFake(async (raw, options) => {
            if (raw.includes('/orden_examen/')) return response(orden);
            if (options.method === 'POST') { posts.push(options); guardado = { idExamenResultado: options.headers['Idempotency-Key'] }; return created(raw); }
            return new Response('', { status: 500 });
        });
        assert.isTrue((await registrar())._registrado); await registrar(); assert.equal(posts.length, 1);
    });
    test('Location externo, otro recurso, otro UUID o query no se siguen', async () => {
        for (const path of ['https://externo.test/examen_resultado/x', '/otro/x', '/GalenoSV-1.0-SNAPSHOT/resources/v1/examen_resultado/otro', '/GalenoSV-1.0-SNAPSHOT/resources/v1/examen_resultado/x?token=1']) {
            orden = { ...orden }; fetchStub.resetHistory();
            fetchStub.callsFake(async (raw, options) => raw.includes('/orden_examen/') ? response(orden) : new Response(null, { status: 201, headers: { Location: path } }));
            assert.isTrue((await registrar())._registrado); assert.equal(fetchStub.callCount, 2);
        }
    });
    test('un reintento de recuperación vuelve al UUID confirmado sin otro POST', async () => {
        let lecturas = 0;
        fetchStub.callsFake(async (raw, options) => {
            if (raw.includes('/orden_examen/')) return response(orden);
            if (options.method === 'POST') {
                posts.push(options); guardado = { ...valores, idExamenResultado: options.headers['Idempotency-Key'], idOrdenExamen: orden };
                return created(raw);
            }
            return ++lecturas === 1 ? new Response('', { status: 500 }) : response(guardado);
        });
        assert.isTrue((await registrar())._registrado);
        assert.equal((await registrar()).idExamenResultado, guardado.idExamenResultado);
        assert.equal(posts.length, 1); assert.equal(lecturas, 2);
    });
    test('UUID, orden o contenido recuperados que no corresponden no se editan', async () => {
        for (const cambio of [{ idExamenResultado: 'ajeno' }, { idOrdenExamen: { idOrdenExamen: 'otra' } }, { resultado: 'Otro contenido' }]) {
            orden = { ...orden }; fetchStub.callsFake(async (raw, options) => {
                if (raw.includes('/orden_examen/')) return response(orden);
                if (options.method === 'POST') { guardado = { ...valores, idExamenResultado: options.headers['Idempotency-Key'], idOrdenExamen: orden }; return created(raw); }
                return response({ ...guardado, ...cambio });
            }); assert.isTrue((await registrar())._registrado);
        }
    });
    test('el conflicto 409 conserva el error y nunca busca un resultado por contenido', async () => {
        fetchStub.callsFake(async raw => raw.includes('/orden_examen/') ? response(orden) : new Response('', { status: 409 }));
        await rejects(registrar, '409'); assert.equal(fetchStub.callCount, 2);
    });
    test('sin resultado explícito o contexto compatible no crea nada', async () => {
        await rejects(() => registrarResultadoAtencion(orden, { resultado: ' ', interpretacion: '' }, contexto, 'consulta'));
        assert.equal(fetchStub.callCount, 0);
        await rejects(() => registrarResultadoAtencion(orden, valores, { ...contexto, idRol: { idRol: 'otro' } }, 'consulta'), 'rol');
        assert.equal(posts.length, 0);
    });
    test('genera UUID estable también en HTTP sin crypto.randomUUID', async () => {
        sandbox.stub(crypto, 'randomUUID').value(undefined); await registrar();
        assert.match(posts[0].headers['Idempotency-Key'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
    test('Sin randomUUID utiliza una clave v4 y mantiene la recuperación por Location', async () => {
        sandbox.stub(crypto, 'randomUUID').value(undefined);
        const resultado = await registrar();
        const clave = posts[0].headers['Idempotency-Key'];
        assert.match(clave, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        assert.equal(resultado.idExamenResultado, clave);
        assert.strictEqual(await registrar(), resultado);
        assert.lengthOf(posts, 1);
    });

    test('Un 204 no confirma la creación y el siguiente intento conserva la misma clave', async () => {
        const post = fetchStub.withArgs(sinon.match('/examen_resultado/atencion'), sinon.match({ method: 'POST' }));
        post.onFirstCall().resolves(new Response(null, { status: 204 }));
        post.onSecondCall().callsFake(async (url, opciones) => {
            guardado = { ...JSON.parse(opciones.body), idExamenResultado: opciones.headers['Idempotency-Key'], idOrdenExamen: orden };
            return created(url);
        });
        await rejects(registrar, 'no confirmó');
        assert.equal((await registrar()).idExamenResultado, guardado.idExamenResultado);
        assert.equal(post.firstCall.args[1].headers['Idempotency-Key'], post.secondCall.args[1].headers['Idempotency-Key']);
        sinon.assert.calledTwice(post);
    });

});
mocha.run();
