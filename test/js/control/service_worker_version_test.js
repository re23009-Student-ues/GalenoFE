import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';

mocha.setup('tdd');
suite('Actualización HU4 y caché sensible', () => {
    let source, html, sandbox, handlers, cache, cachesMock, selfMock;
    suiteSetup(async () => {
        [source, html] = await Promise.all(['../../../src/serviceWorker.js', '../../../src/index.html'].map(async path => {
            const response = await fetch(new URL(path, import.meta.url), { cache: 'no-store' });
            assert.isTrue(response.ok); return response.text();
        }));
    });
    setup(() => {
        sandbox = sinon.createSandbox(); handlers = new Map();
        cache = { addAll: sandbox.stub().resolves() };
        cachesMock = { open: sandbox.stub().resolves(cache), keys: sandbox.stub().resolves([]), delete: sandbox.stub().resolves(true) };
        selfMock = { registration: { scope: new URL('../../../src/', import.meta.url).href }, location: { origin: location.origin },
            addEventListener: (type, handler) => handlers.set(type, handler), skipWaiting: sandbox.stub().resolves(), clients: { claim: sandbox.stub().resolves() } };
        new Function('self', 'caches', source)(selfMock, cachesMock);
    });
    teardown(() => sandbox.restore());
    async function lifecycle(type) {
        let completion; handlers.get(type)({ waitUntil(promise) { completion = promise; } }); await completion;
    }
    test('precarga v27 y el mismo main actualizado que carga el HTML', async () => {
        await lifecycle('install');
        sinon.assert.calledWithExactly(cachesMock.open, 'galenosv-v27');
        const index = new DOMParser().parseFromString(html, 'text/html');
        const main = index.querySelector('script[type="module"]').getAttribute('src');
        assert.equal(main, 'js/main.js?v=22');
        const requests = cache.addAll.firstCall.args[0];
        assert.isTrue(requests.some(request => request.url === new URL(main, selfMock.registration.scope).href));
        assert.isTrue(requests.every(request => request.cache === 'reload'));
        sinon.assert.calledOnce(selfMock.skipWaiting);
    });
    test('activación elimina versiones del rollback y caché API anterior; conserva otras aplicaciones', async () => {
        cachesMock.keys.resolves(['galenosv-v13', 'galenosv-v14', 'galenosv-v15', 'galenosv-v16', 'galenosv-v17', 'galenosv-v18', 'galenosv-v19', 'galenosv-v27', 'galeno-api-v0', 'galeno-api-v1', 'otra-app']);
        await lifecycle('activate');
        assert.deepEqual(cachesMock.delete.getCalls().map(call => call.args[0]), ['galenosv-v13', 'galenosv-v14', 'galenosv-v15', 'galenosv-v16', 'galenosv-v17', 'galenosv-v18', 'galenosv-v19', 'galeno-api-v0', 'galeno-api-v1']);
        sinon.assert.calledOnce(selfMock.clients.claim);
    });
    test('precarga conserva Wizard, Checkbox y atención previos sin el cliente retirado', async () => {
        await lifecycle('install');
        const paths = cache.addAll.firstCall.args[0].map(request => new URL(request.url).pathname);
        for (const file of ['js/boundary/componentes/navigation/wizard/Wizard.js', 'js/boundary/componentes/form/checkbox/Checkbox.js', 'js/boundary/vistas/atencion_flujo.js', 'js/control/transporte_rest.js']) {
            assert.include(paths, new URL(file, selfMock.registration.scope).pathname);
        }
        assert.notInclude(paths, new URL('js/control/api_client.js', selfMock.registration.scope).pathname);
    });
    test('la primera toma de control no recarga, pero la actualización siguiente sí y solo una vez', () => {
        const index = new DOMParser().parseFromString(html, 'text/html');
        const inline = [...index.querySelectorAll('script:not([src])')].find(script => script.textContent.includes('controllerchange')).textContent;
        const eventos = new Map(), reload = sandbox.spy();
        const navegador = { serviceWorker: { controller: null, addEventListener: (tipo, handler) => eventos.set(tipo, handler) } };
        const ventana = { location: { reload }, addEventListener: sandbox.stub() };
        new Function('navigator', 'window', inline)(navegador, ventana);
        navegador.serviceWorker.controller = { version: 16 }; eventos.get('controllerchange')(); sinon.assert.notCalled(reload);
        navegador.serviceWorker.controller = { version: 17 }; eventos.get('controllerchange')(); sinon.assert.calledOnce(reload);
        eventos.get('controllerchange')(); sinon.assert.calledOnce(reload);
    });
});
mocha.run();
