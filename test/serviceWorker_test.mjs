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
            for (const { fn, delay } of timers.values()) { assert.equal(delay, 10000); fn(); }
        },
        async lifecycle(type) { let promise; handlers.get(type)({waitUntil(value) { promise = value; }}); await promise; },
        message(data) { const replies = []; handlers.get('message')({ data, ports: [{ postMessage: value => replies.push(value) }] }); return replies; },
        fetch(path, init) { let result; handlers.get('fetch')({request: new Request(new URL(path, scope), init), respondWith(value) { result = value; }}); return result; }
    };
}

test('Precarga completa: archivos existentes y módulos importados de la aplicación', async () => {
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
    assert.ok(paths.has('/src/js/boundary/vistas/resumen_controller.js'));
    assert.ok(paths.has('/src/js/boundary/vistas/consulta_controller.js'));
    assert.ok(paths.has('/src/js/boundary/componentes/calendar/calendar.js'));
    assert.ok(paths.has('/src/js/boundary/componentes/data-display/dataTable.js'));
    const manifest = JSON.parse(await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8'));
    for (const recurso of [...manifest.icons, ...manifest.screenshots]) {
        assert.ok(paths.has(new URL(recurso.src, scope).pathname), `Falta recurso del manifest: ${recurso.src}`);
    }
    for (const retirado of ['js/boundary/vistas/paciente_controller.js', 'js/control/paciente_agenda.js', 'Recursos/estilos/paciente.css', 'js/boundary/componentes/notificacion_emergente.js', 'js/control/generador_mensajes.js']) {
        assert.ok(!paths.has(`/src/${retirado}`));
    }
    assert.equal(w.waiting, 1);
});

test('Actualización elimina solo cachés anteriores de Galeno y toma control', async () => {
    const w = worker(); w.store('galenosv-v1'); w.store('galenosv-v3'); w.store('galenosv-v4'); w.store('galenosv-v13'); w.store('galenosv-v14'); w.store('galenosv-v15'); w.store('galenosv-v16'); w.store('galenosv-v17'); w.store('galenosv-v18'); w.store('galenosv-v19'); w.store('galeno-api-v0'); w.store('galeno-api-v1'); w.store('otra-app');
    await w.lifecycle('install'); await w.lifecycle('activate');
    assert.deepEqual(w.deleted, ['galenosv-v1', 'galenosv-v3', 'galenosv-v4', 'galenosv-v13', 'galenosv-v14', 'galenosv-v15', 'galenosv-v16', 'galenosv-v17', 'galenosv-v18', 'galenosv-v19', 'galeno-api-v0', 'galeno-api-v1']);
    assert.ok(!w.stores.has('galeno-api-v1'));
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
    await cache.put(scope + 'js/main.js?v=23', new Response('main-v15'));
    w.setNetwork(async () => { throw new Error('offline'); });
    assert.equal(await (await w.fetch('js/main.js?v=23')).text(), 'main-v15');
    await assert.rejects(w.fetch('js/main.js?v=14'), /offline/);
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

const API = 'http://localhost:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/';

test('REST usa no-store y no abre ninguna caché API', async () => {
    const w = worker();
    w.setNetwork(async (request, options) => { assert.equal(options.cache, 'no-store'); return respuestaApi([{ idConsulta: 'actual' }]); });
    const response = await w.fetch(API + 'consulta?first=0&max=50');
    assert.equal(response.headers.get('Total-registros'), '7'); assert.deepEqual(await response.json(), [{ idConsulta: 'actual' }]);
    assert.equal(w.stores.size, 0);
});

test('REST offline nunca devuelve una respuesta clínica histórica, tampoco con no-store', async () => {
    const w = worker(), ruta = API + 'consulta/1';
    await w.store('galeno-api-v1').put(ruta, respuestaApi(['antiguo']));
    w.store('galeno-api-v1').match = async () => { throw new Error('No debe leerse caché API'); };
    w.setNetwork(async () => { throw new Error('offline'); });
    await assert.rejects(w.fetch(ruta), /offline/);
    await assert.rejects(w.fetch(ruta, { cache: 'no-store' }), /offline/);
});

test('REST timeout a diez segundos aborta y no guarda respuestas tardías', async () => {
    const w = worker(); let signal, terminar;
    w.setNetwork((request, opciones) => { signal = opciones.signal; return new Promise(resolve => { terminar = resolve; }); });
    const pendiente = w.fetch(API + 'persona_rol/persona/1');
    const rejected = assert.rejects(pendiente, /Tiempo de espera/); await w.timeout(); await rejected;
    assert.ok(signal.aborted); terminar(respuestaApi(['tardío'])); await Promise.resolve(); assert.equal(w.stores.size, 0);
});

test('REST conserva errores HTTP sin sustituirlos por datos guardados', async () => {
    const w = worker(), ruta = API + 'examen_resultado/1';
    await w.store('galeno-api-v1').put(ruta, respuestaApi(['antiguo']));
    for (const status of [404,409,422,500]) {
        w.setNetwork(async () => respuestaApi({error:true}, 'cors', status));
        assert.equal((await w.fetch(ruta)).status, status);
    }
    assert.deepEqual(await (await w.store('galeno-api-v1').match(ruta)).json(), ['antiguo']);
});

test('Dos contextos y una escritura intermedia nunca reutilizan lecturas REST', async () => {
    const w = worker(), ruta = API + 'consulta/resumen'; let count = 0;
    w.setNetwork(async () => respuestaApi({revision: ++count}));
    assert.equal((await (await w.fetch(ruta, {headers:{'X-Contexto-Persona-Rol':'A'}})).json()).revision, 1);
    assert.equal(w.fetch(API + 'consulta/1/atencion', {method:'PUT'}), undefined);
    assert.equal((await (await w.fetch(ruta, {headers:{'X-Contexto-Persona-Rol':'B'}})).json()).revision, 2);
    assert.equal((await (await w.fetch(ruta)).json()).revision, 3); assert.equal(w.stores.size, 0);
});

test('Worker reconoce únicamente el protocolo actual de caché sin datos personales', () => {
    const w = worker(); assert.deepEqual(w.message({tipo:'otro'}), []);
    assert.equal(w.message({tipo:'galeno-politica-rest'})[0].politica, 'sin-cache-rest-v1');
});

test('No intercepta API de otros hosts o despliegues', () => {
    const w = worker();
    assert.equal(w.fetch('http://otro-servidor:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/consulta'), undefined);
    assert.equal(w.fetch('http://localhost:9080/otro/resources/v1/consulta'), undefined);
    assert.equal(w.fetch('http://localhost:9080/GalenoSV-1.0-SNAPSHOT/resources/v10/consulta'), undefined);
});

test('Un fallo al guardar caché no reemplaza una respuesta válida por código antiguo', async () => {
    const w = worker(); await w.lifecycle('install');
    [...w.stores.values()][0].put = async () => { throw new Error('quota'); };
    w.setNetwork(async () => new Response('nuevo'));
    assert.equal(await (await w.fetch('js/router.js')).text(), 'nuevo');
});
