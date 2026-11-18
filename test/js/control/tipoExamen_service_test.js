import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import TipoExamenService from '../../../src/js/control/tipoExamen_service.js';
import DefaultResponse from '../../../src/js/entity/default_response.js';
import DefaultError from '../../../src/js/entity/default_error.js';

mocha.setup('tdd');

suite('TipoExamenService y paginación de DefaultService', () => {
    let sandbox, fetchStub, servicio;

    const pagina = (datos, total) => new Response(JSON.stringify(datos), {
        headers: total === undefined ? {} : { 'Total-registros': String(total) }
    });

    setup(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(window, 'fetch');
        servicio = new TipoExamenService();
    });
    teardown(() => sandbox.restore());

    test('findRange solicita el catálogo y preserva el total del servidor', async () => {
        const datos = [{ idTipoExamen: 'tipo-1', activo: true }];
        fetchStub.resolves(pagina(datos, 8));
        const resultado = await servicio.findRange(2, 3);
        assert.instanceOf(resultado, DefaultResponse);
        assert.deepEqual(resultado.datos, datos);
        assert.equal(resultado.totalDatos, '8');
        const [url, opciones] = fetchStub.firstCall.args;
        const ruta = new URL(url);
        assert.match(ruta.pathname, /\/tipo_examen$/);
        assert.deepEqual([...ruta.searchParams], [['first', '2'], ['max', '3']]);
        assert.equal(opciones.method, 'GET');
        assert.equal(opciones.cache, 'no-store');
    });

    test('findAll avanza por la cantidad recibida cuando el total anuncia más registros', async () => {
        const primero = [{ idTipoExamen: '1' }, { idTipoExamen: '2' }];
        const ultimo = [{ idTipoExamen: '3' }];
        fetchStub.onFirstCall().resolves(pagina(primero, 3));
        fetchStub.onSecondCall().resolves(pagina(ultimo, 3));
        assert.deepEqual(await servicio.findAll(), [...primero, ...ultimo]);
        assert.deepEqual(fetchStub.getCalls().map(({ args }) => new URL(args[0]).searchParams.get('first')), ['0', '2']);
    });

    test('findAll finaliza en la página corta cuando falta Total-registros', async () => {
        const datos = [{ idTipoExamen: '1' }];
        fetchStub.resolves(pagina(datos));
        assert.deepEqual(await servicio.findAll(), datos);
        sinon.assert.calledOnce(fetchStub);
    });

    for (const [nombre, respuesta, mensaje] of [
        ['página repetida', () => pagina([{ idTipoExamen: '1' }], 3), /repitió una página/],
        ['página vacía', () => pagina([], 3), /lista incompleta/],
        ['objeto en lugar de lista', () => pagina({ idTipoExamen: '2' }, 3), /no devolvió una lista/]
    ]) {
        test(`findAll rechaza ${nombre} sin devolver resultados parciales`, async () => {
            fetchStub.onFirstCall().resolves(pagina([{ idTipoExamen: '1' }], 3));
            fetchStub.onSecondCall().resolves(respuesta());
            await rechaza(servicio.findAll(), error => assert.match(error.message, mensaje));
            sinon.assert.calledTwice(fetchStub);
        });
    }

    test('findAll aplica el límite solicitado antes de pedir otra página', async () => {
        fetchStub.resolves(pagina([{ idTipoExamen: '1' }], 3));
        await rechaza(servicio.findAll(1), error => assert.match(error.message, /límite solicitado/));
        sinon.assert.calledOnce(fetchStub);
    });

    test('findRange distingue un error HTTP de un cuerpo JSON inválido', async () => {
        fetchStub.onFirstCall().resolves(new Response('', { status: 503 }));
        fetchStub.onSecondCall().resolves(new Response('{'));
        await rechaza(servicio.findRange(0, 10), error => {
            assert.instanceOf(error, DefaultError);
            assert.include(error.mensaje, '503');
            assert.isNull(error.error);
        });
        await rechaza(servicio.findRange(0, 10), error => {
            assert.instanceOf(error, DefaultError);
            assert.include(error.mensaje, 'procesar los datos');
            assert.instanceOf(error.error, SyntaxError);
        });
    });
});

async function rechaza(promesa, verificar) {
    try {
        await promesa;
    } catch (error) {
        verificar(error);
        return;
    }
    assert.fail('La solicitud debía rechazar la promesa');
}

mocha.run();
