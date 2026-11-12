import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/serviceWorker.js', import.meta.url), 'utf8');
const scope = 'http://localhost/src/';
function worker() {
    const handlers = new Map(), stores = new Map(), deleted = [], timers = new Map();
    let claimed = 0, waiting = 0, network;
    const key = request => typeof request === 'string' ? request : request.url;
    function store(name) {
        if (!stores.has(name)) {
            const entries = new Map();
            stores.set(name, {
                entries,
                async addAll(requests) {
                    this.installed = requests;
                    requests.forEach(request => entries.set(key(request), new Response('precached')));
                },
                async put(request, response) { entries.set(key(request), response); },
                async match(request) { return entries.get(key(request))?.clone(); }
            });
        }
        return stores.get(name);
    }
    const self = {
        registration: { scope }, location: { origin: 'http://localhost' },
        addEventListener: (type, handler) => handlers.set(type, handler),
        skipWaiting: async () => { waiting++; }, clients: { claim: async () => { claimed++; } }
    };
    vm.runInNewContext(source, {
        self, URL, Request, AbortController, console: { warn() {} },
        setTimeout(fn, delay) { const id = {}; timers.set(id, { fn, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        caches: { open: async name => store(name), keys: async () => [...stores.keys()], delete: async name => { deleted.push(name); return stores.delete(name); } },
        fetch: (...args) => network(...args)
    });
    return {
        store, stores, deleted, self,
        get claimed() { return claimed; }, get waiting() { return waiting; },
        setNetwork(fn) { network = fn; },
        async timeout() {
            for (let i = 0; !timers.size && i < 10; i++) await Promise.resolve();
            assert.ok(timers.size);
            for (const { fn, delay } of timers.values()) { assert.equal(delay, 3000); fn(); }
        },
        async lifecycle(type) { let promise; handlers.get(type)({waitUntil(value) { promise = value; }}); await promise; },
        fetch(path, init) { let result; handlers.get('fetch')({request: new Request(new URL(path, scope), init), respondWith(value) { result = value; }}); return result; }
    };
}

test('Precarga completa: archivos existentes y módulos importados del portal', async () => {
    const w = worker(); await w.lifecycle('install');
    const requests = [...w.stores.values()][0].installed;
    const paths = new Set(requests.map(request => new URL(request.url).pathname));
    for (const request of requests) {
        const path = new URL(request.url).pathname;
        if (!path.endsWith('/')) await access(new URL(`../${path.slice(1)}`, import.meta.url));
        assert.equal(request.cache, 'reload');
        if (!path.endsWith('.js')) continue;
        const code = await readFile(new URL(`../${path.slice(1)}`, import.meta.url), 'utf8');
        for (const match of code.matchAll(/(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+[^;]*?\s+from\s+)["']([^"']+)["']/g)) {
            if (match[1].startsWith('.')) assert.ok(paths.has(new URL(match[1], request.url).pathname), `Falta dependencia ${match[1]} de ${path}`);
        }
    }
    assert.ok(paths.has('/src/js/boundary/vistas/paciente_controller.js'));
    assert.ok(paths.has('/src/Recursos/estilos/paciente.css'));
    assert.equal(w.waiting, 1);
});

test('Actualización elimina solo cachés anteriores de Galeno y toma control', async () => {
    const w = worker(); w.store('galenosv-v1'); w.store('galeno-api-v0'); w.store('galeno-api-v1'); w.store('otra-app');
    await w.lifecycle('install'); await w.lifecycle('activate');
    assert.deepEqual(w.deleted, ['galenosv-v1', 'galeno-api-v0']);
    assert.ok(w.stores.has('galeno-api-v1'));
    assert.ok(w.stores.has('otra-app')); assert.equal(w.claimed, 1);
});

test('Los módulos nuevos prevalecen sobre código obsoleto en caché', async () => {
    const w = worker(); await w.lifecycle('install');
    const cache = [...w.stores.values()][0];
    await cache.put(scope + 'js/router.js', new Response('router anterior'));
    w.setNetwork(async (request, options) => {
        assert.equal(options.cache, 'no-cache'); return new Response('router con pacientes');
    });
    assert.equal(await (await w.fetch('js/router.js')).text(), 'router con pacientes');
    assert.equal(await (await cache.match(scope + 'js/router.js')).text(), 'router con pacientes');
});

test('Sin red usa caché exacta sin confundir parámetros de versión', async () => {
    const w = worker(); await w.lifecycle('install');
    const cache = [...w.stores.values()][0];
    await cache.put(scope + 'js/main.js?v=8', new Response('main-v8'));
    w.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await w.fetch('js/main.js?v=8')).text(), 'main-v8');
    await assert.rejects(w.fetch('js/main.js?v=9'), /offline/);
});

test('No intercepta escrituras ni recursos ajenos a estáticos y API', () => {
    const w = worker();
    for (const method of ['POST', 'PUT', 'DELETE']) {
        assert.equal(w.fetch('http://localhost:9080/resources/v1/persona_rol', { method }), undefined);
    }
    assert.equal(w.fetch('http://otro:9080/resources/v10/persona_rol'), undefined);
    assert.equal(w.fetch('/api/consultas'), undefined);
    assert.equal(w.fetch('js/router.js', {method:'POST'}), undefined);
});

function respuestaApi(datos, type = 'cors', status = 200) {
    const respuesta = new Response(JSON.stringify(datos), { status, headers: { 'Total-registros': '7', 'Content-Type': 'application/json' } });
    Object.defineProperty(respuesta, 'type', { value: type });
    return respuesta;
}

test('API de otro origen: red 200 cors se guarda con cuerpo y headers', async () => {
    const w = worker();
    const ruta = 'http://otro-servidor:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/consulta?first=0&max=50';
    w.setNetwork(async () => respuestaApi([{ idConsulta: 'c1' }]));
    const respuesta = await w.fetch(ruta);
    assert.equal(respuesta.headers.get('Total-registros'), '7');
    const guardada = await w.store('galeno-api-v1').match(ruta);
    assert.equal(guardada.headers.get('Total-registros'), '7');
    assert.deepEqual(await guardada.json(), [{ idConsulta: 'c1' }]);
    assert.ok(!w.stores.has('galenosv-v3'));
});

test('API sin red usa caché por URL exacta, incluyendo parámetros', async () => {
    const w = worker(), ruta = 'http://localhost:9080/resources/v1/consulta?first=0&max=50';
    w.setNetwork(async () => respuestaApi([{ idConsulta: 'guardada' }], 'basic'));
    await w.fetch(ruta);
    w.setNetwork(async () => { throw new Error('offline'); });
    assert.deepEqual(await (await w.fetch(ruta)).json(), [{ idConsulta: 'guardada' }]);
    await assert.rejects(w.fetch(ruta.replace('first=0', 'first=50')), /offline/);
});

test('API supera 3 segundos: aborta red y entrega caché sin guardar respuesta tardía', async () => {
    const w = worker(), ruta = 'http://localhost:9080/resources/v1/persona_rol/persona/1';
    await w.store('galeno-api-v1').put(ruta, respuestaApi(['guardado']));
    let signal, terminar;
    w.setNetwork((request, opciones) => { signal = opciones.signal; return new Promise(resolve => { terminar = resolve; }); });
    const pendiente = w.fetch(ruta);
    await w.timeout();
    assert.deepEqual(await (await pendiente).json(), ['guardado']);
    assert.ok(signal.aborted);
    terminar(respuestaApi(['tardío']));
    await Promise.resolve();
    assert.deepEqual(await (await w.store('galeno-api-v1').match(ruta)).json(), ['guardado']);
});

test('API no guarda respuestas no 200, opacas ni de tipo default', async () => {
    const w = worker(), ruta = 'http://localhost:9080/resources/v1/documento/buscar?tipo=1&valor=2';
    for (const [type, status] of [['cors', 404], ['basic', 500], ['opaque', 200], ['default', 200]]) {
        w.setNetwork(async () => respuestaApi(null, type, status));
        const respuesta = await w.fetch(ruta);
        assert.equal(respuesta.status, status);
        assert.equal(await w.store('galeno-api-v1').match(ruta), undefined);
    }
});

test('API mantiene la respuesta 200 si falla escribir caché', async () => {
    const w = worker();
    w.store('galeno-api-v1').put = async () => { throw new Error('quota'); };
    w.setNetwork(async () => respuestaApi(['vigente']));
    assert.deepEqual(await (await w.fetch('http://otro:9080/resources/v1/tipo_documento')).json(), ['vigente']);
});

test('Un fallo al guardar caché no reemplaza una respuesta válida por código antiguo', async () => {
    const w = worker(); await w.lifecycle('install');
    [...w.stores.values()][0].put = async () => { throw new Error('quota'); };
    w.setNetwork(async () => new Response('nuevo'));
    assert.equal(await (await w.fetch('js/router.js')).text(), 'nuevo');
});
