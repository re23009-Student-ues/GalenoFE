import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/serviceWorker.js', import.meta.url), 'utf8');
const scope = 'http://localhost/src/';
function worker() {
    const handlers = new Map(), stores = new Map(), deleted = [];
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
        self, URL, Request, console: { warn() {} },
        caches: { open: async name => store(name), keys: async () => [...stores.keys()], delete: async name => { deleted.push(name); return stores.delete(name); } },
        fetch: (...args) => network(...args)
    });
    return {
        store, stores, deleted, self,
        get claimed() { return claimed; }, get waiting() { return waiting; },
        setNetwork(fn) { network = fn; },
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
    const w = worker(); w.store('galenosv-v1'); w.store('otra-app');
    await w.lifecycle('install'); await w.lifecycle('activate');
    assert.deepEqual(w.deleted, ['galenosv-v1']);
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

test('Las peticiones REST y otros recursos no entran en la caché estática', () => {
    const w = worker();
    assert.equal(w.fetch('http://localhost:9080/resources/v1/persona_rol'), undefined);
    assert.equal(w.fetch('/api/consultas'), undefined);
    assert.equal(w.fetch('js/router.js', {method:'POST'}), undefined);
});

test('Un fallo al guardar caché no reemplaza una respuesta válida por código antiguo', async () => {
    const w = worker(); await w.lifecycle('install');
    [...w.stores.values()][0].put = async () => { throw new Error('quota'); };
    w.setNetwork(async () => new Response('nuevo'));
    assert.equal(await (await w.fetch('js/router.js')).text(), 'nuevo');
});
