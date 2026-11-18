import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { solicitarREST, invalidarContextoREST, limpiarCachesAPI, TIEMPO_LECTURA_REST, TIEMPO_ESCRITURA_REST } from '../../../src/js/control/transporte_rest.js';
import DefaultService from '../../../src/js/control/default_service.js';
import { leer } from '../../../src/js/control/agenda_service.js';
import { rolesDePersona, guardarSesion, establecerContexto, cerrarSesion } from '../../../src/js/control/sesion_service.js';
mocha.setup('tdd');
suite('Paso 8: REST sin caché y aislamiento de contexto', () => {
    let sandbox, fetchStub, claves, borrar, personaAnterior, rolAnterior, worker;
    const url = 'http://localhost:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/consulta';
    const response = datos => new Response(JSON.stringify(datos), { headers: { 'Total-registros': '123' } });
    const observar = p => p.then(valor => ({ valor }), error => ({ error }));
    setup(() => {
        personaAnterior = sessionStorage.getItem('sesionPersona'); rolAnterior = sessionStorage.getItem('sesionPersonaRol');
        sessionStorage.removeItem('sesionPersona'); sessionStorage.removeItem('sesionPersonaRol'); invalidarContextoREST();
        sandbox = sinon.createSandbox(); worker = null;
        sandbox.stub(navigator.serviceWorker, 'controller').get(() => worker);
        fetchStub = sandbox.stub(window, 'fetch'); claves = sandbox.stub(caches, 'keys').resolves([]); borrar = sandbox.stub(caches, 'delete').resolves(true);
    });
    teardown(() => {
        invalidarContextoREST(); sandbox.restore();
        for (const [key,valor] of [['sesionPersona',personaAnterior],['sesionPersonaRol',rolAnterior]]) if (valor === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key,valor);
    });
    async function rechaza(fn, codigo) { const r = await observar(fn()); assert.instanceOf(r.error, Error); if (codigo) assert.equal(r.error.codigo, codigo); return r.error; }
    test('los tres transportes piden no-store conservando parámetros y Total-registros', async () => {
        fetchStub.callsFake(async (raw, opciones) => { assert.equal(opciones.cache, 'no-store'); return response([]); });
        const service = new DefaultService(); service.URL += 'consulta?clinica=c';
        assert.equal((await service.findRange(50,50)).totalDatos, '123'); await rolesDePersona('persona'); await (await leer('consulta?clinica=c')).json();
        assert.equal(fetchStub.callCount, 3); assert.include(fetchStub.firstCall.args[0], 'clinica=c&first=50&max=50');
    });
    test('no permite que un consumidor active HTTP cache con force-cache', async () => {
        fetchStub.callsFake(async (raw, opciones) => { assert.equal(opciones.cache, 'no-store'); return response({ vigente: true }); });
        assert.isTrue((await (await solicitarREST(url, { cache: 'force-cache' })).json()).vigente);
    });
    test('sin red no consulta CacheStorage ni devuelve una lista antigua', async () => {
        const match = sandbox.spy(caches, 'match'); fetchStub.rejects(new TypeError('Sin red'));
        sandbox.stub(navigator, 'onLine').get(() => false);
        const error = await observar(new DefaultService().findRange(0,50)); assert.include(error.error.mensaje, 'Se requiere red'); sinon.assert.notCalled(match);
    });
    test('GET agota el plazo, aborta y descarta una respuesta tardía', async () => {
        const reloj = sandbox.useFakeTimers(); let resolver, signal;
        fetchStub.callsFake((raw, opciones) => { signal = opciones.signal; return new Promise(r => resolver = r); });
        const observado = observar(solicitarREST(url)); await reloj.tickAsync(0); await reloj.tickAsync(TIEMPO_LECTURA_REST);
        assert.equal((await observado).error.codigo, 'TIEMPO_AGOTADO'); assert.isTrue(signal.aborted);
        resolver(response(['tardío'])); await reloj.tickAsync(0); sinon.assert.notCalled(borrar);
    });
    test('el plazo cubre también la descarga del JSON después de recibir headers', async () => {
        const reloj = sandbox.useFakeTimers(); let completar;
        const r = response([]); sandbox.stub(r, 'json').returns(new Promise(resolve => completar = resolve)); fetchStub.resolves(r);
        const observado = observar((async () => (await solicitarREST(url)).json())());
        await reloj.tickAsync(0); await reloj.tickAsync(TIEMPO_LECTURA_REST);
        assert.equal((await observado).error.codigo, 'TIEMPO_AGOTADO'); completar(['antiguo']); await reloj.tickAsync(0);
    });
    test('DefaultService conserva el mensaje de timeout durante la lectura del JSON', async () => {
        const reloj = sandbox.useFakeTimers(); const r = response([]);
        sandbox.stub(r,'json').returns(new Promise(() => {})); fetchStub.resolves(r);
        const observado = observar(new DefaultService().findRange(0,50));
        await reloj.tickAsync(0); await reloj.tickAsync(TIEMPO_LECTURA_REST);
        assert.include((await observado).error.mensaje, 'tardó demasiado');
    });
    test('cambiar contexto durante GET rechaza incluso si la red ignora abort', async () => {
        establecerContexto({ idPersonaRol: 'A' }); let resolver;
        fetchStub.callsFake(() => new Promise(r => resolver = r));
        const observado = observar(solicitarREST(url)); await Promise.resolve(); await Promise.resolve();
        establecerContexto({ idPersonaRol: 'B' }); assert.equal((await observado).error.codigo, 'CONTEXTO_CAMBIO');
        resolver(response(['del contexto A']));
    });
    test('volver de A a B y a A no valida de nuevo una respuesta anterior', async () => {
        establecerContexto({ idPersonaRol: 'A' }); let resolver;
        fetchStub.callsFake(() => new Promise(r => resolver = r)); const observado = observar(solicitarREST(url));
        await Promise.resolve(); await Promise.resolve(); establecerContexto({ idPersonaRol: 'B' }); establecerContexto({ idPersonaRol: 'A' });
        assert.equal((await observado).error.codigo, 'CONTEXTO_CAMBIO'); resolver(response([]));
    });
    test('el cuerpo y sus clones tampoco pueden aplicarse después de cambiar contexto', async () => {
        fetchStub.callsFake(async () => response(['A'])); const r = await solicitarREST(url), copia = r.clone();
        establecerContexto({ idPersonaRol: 'B' }); await rechaza(() => copia.json(), 'CONTEXTO_CAMBIO'); await rechaza(() => r.json(), 'CONTEXTO_CAMBIO');
    });
    test('cambiar contexto mientras se descarga el cuerpo rechaza sus datos', async () => {
        let resolver; const r = response([]); sandbox.stub(r,'json').returns(new Promise(r => resolver = r)); fetchStub.resolves(r);
        const recibido = await solicitarREST(url); const observado = observar(recibido.json()); establecerContexto({ idPersonaRol: 'B' });
        assert.equal((await observado).error.codigo, 'CONTEXTO_CAMBIO'); resolver(['A']);
    });
    test('POST/PUT/DELETE no se abortan automáticamente ni se repiten al cambiar contexto', async () => {
        const reloj = sandbox.useFakeTimers(); const resoluciones = [];
        fetchStub.callsFake((raw, opciones) => { assert.equal(opciones.cache, 'no-store'); assert.notProperty(opciones, 'signal'); return new Promise(r => resoluciones.push(r)); });
        const solicitudes = ['POST','PUT','DELETE'].map(method => solicitarREST(url, { method }));
        await reloj.tickAsync(0); establecerContexto({ idPersonaRol: 'B' }); await reloj.tickAsync(2*TIEMPO_LECTURA_REST);
        assert.equal(fetchStub.callCount,3); resoluciones.forEach(r => r(new Response(null,{status:201,headers:{Location:'/examen_resultado/id'}})));
        for (const r of await Promise.all(solicitudes)) { assert.equal(r.status,201); assert.equal(r.headers.get('Location'),'/examen_resultado/id'); }
    });
    test('plazo de escritura avisa confirmación pendiente sin abortar ni duplicar', async () => {
        const reloj = sandbox.useFakeTimers(); let resolver;
        fetchStub.callsFake((raw, opciones) => { assert.notProperty(opciones, 'signal'); return new Promise(r => resolver = r); });
        const observado = observar(solicitarREST(url,{method:'POST',body:'{}'}));
        await reloj.tickAsync(TIEMPO_ESCRITURA_REST);
        assert.equal((await observado).error.codigo,'ESCRITURA_PENDIENTE'); sinon.assert.calledOnce(fetchStub);
        resolver(new Response(null,{status:201,headers:{Location:'/examen_resultado/confirmado-tarde'}}));
        await reloj.tickAsync(0); sinon.assert.calledOnce(fetchStub);
    });
    test('el cuerpo de una escritura confirmada no se aplica al contexto nuevo', async () => {
        let resolver; fetchStub.callsFake(() => new Promise(r => resolver = r)); const pendiente = solicitarREST(url,{method:'PUT'});
        await Promise.resolve(); await Promise.resolve(); establecerContexto({ idPersonaRol:'B' }); resolver(response({valor:'A'}));
        const r = await pendiente; assert.equal(r.status,200); await rechaza(() => r.json(),'CONTEXTO_CAMBIO');
    });
    test('no sustituye errores HTTP por un éxito guardado', async () => {
        for (const status of [404,409,422,500]) { fetchStub.callsFake(async () => new Response('',{status})); assert.equal((await solicitarREST(url)).status,status); }
        sinon.assert.notCalled(claves);
    });
    test('un worker antiguo no puede devolver su fallback REST', async () => {
        worker = { postMessage: (data, ports) => ports[0].postMessage({politica:'cache-antigua'}) };
        await rechaza(() => solicitarREST(url),'WORKER_ANTIGUO'); sinon.assert.notCalled(fetchStub);
    });
    test('un worker sin protocolo agota verificación sin pedir datos clínicos', async () => {
        const reloj = sandbox.useFakeTimers(); worker = { postMessage() {} };
        const observado = observar(solicitarREST(url)); await reloj.tickAsync(1500);
        assert.equal((await observado).error.codigo,'WORKER_ANTIGUO'); sinon.assert.notCalled(fetchStub);
    });
    test('verifica una sola vez el worker actual y consulta siempre la red', async () => {
        let verificaciones=0; worker = { postMessage: (data, ports) => { verificaciones++; ports[0].postMessage({politica:'sin-cache-rest-v1'}); } };
        let datos=0; fetchStub.callsFake(async () => response(++datos));
        assert.equal(await (await solicitarREST(url)).json(),1); assert.equal(await (await solicitarREST(url)).json(),2);
        assert.equal(verificaciones,1); assert.equal(fetchStub.callCount,2);
    });
    test('una lectura con señal ya cancelada conserva el motivo y no devuelve datos', async () => {
        const motivo = new DOMException('Pantalla cerrada', 'AbortError');
        fetchStub.callsFake(async (_, { signal }) => {
            assert.isTrue(signal.aborted);
            throw signal.reason;
        });
        assert.strictEqual(await rechaza(() => solicitarREST(url, { signal: AbortSignal.abort(motivo) })), motivo);
        sinon.assert.calledOnce(fetchStub);
    });
    test('cancelar mientras se consume el cuerpo interrumpe la lectura y limpia el listener', async () => {
        const externo = new AbortController();
        const quitar = sandbox.spy(externo.signal, 'removeEventListener');
        fetchStub.callsFake(async (_, { signal }) => {
            const r = response(null);
            sandbox.stub(r, 'json').callsFake(() => new Promise((_, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }));
            return r;
        });
        const respuesta = await solicitarREST(url, { signal: externo.signal });
        const pendiente = observar(respuesta.json());
        const motivo = new DOMException('Pantalla cerrada', 'AbortError');
        externo.abort(motivo);
        assert.strictEqual((await pendiente).error, motivo);
        sinon.assert.calledOnceWithExactly(quitar, 'abort', sinon.match.func);
    });
    test('si cambia el worker durante la verificación, valida el nuevo antes de pedir datos', async () => {
        let puertoAnterior;
        const anterior = { postMessage: sandbox.spy((_, [puerto]) => { puertoAnterior = puerto; }) };
        const nuevo = { postMessage: sandbox.spy((_, [puerto]) => puerto.postMessage({ politica: 'cache-antigua' })) };
        worker = anterior;
        const pendiente = observar(solicitarREST(url));
        sinon.assert.calledOnce(anterior.postMessage);

        worker = nuevo;
        puertoAnterior.postMessage({ politica: 'sin-cache-rest-v1' });
        assert.equal((await pendiente).error.codigo, 'WORKER_ANTIGUO');
        sinon.assert.calledOnce(nuevo.postMessage);
        sinon.assert.notCalled(fetchStub);
    });
    test('una excepción al contactar al worker bloquea REST y permite verificarlo de nuevo', async () => {
        const informar = sandbox.stub();
        informar.onFirstCall().throws(new Error('Canal cerrado'));
        informar.onSecondCall().callsFake((_, [puerto]) => puerto.postMessage({ politica: 'sin-cache-rest-v1' }));
        worker = { postMessage: informar };
        await rechaza(() => solicitarREST(url), 'WORKER_ANTIGUO');
        sinon.assert.notCalled(fetchStub);

        fetchStub.resolves(response({ vigente: true }));
        assert.deepEqual(await (await solicitarREST(url)).json(), { vigente: true });
        sinon.assert.calledTwice(informar);
        sinon.assert.calledOnce(fetchStub);
    });
    test('ingreso/cambio/salida limpian cachés API históricas sin tocar estáticos ni otras apps', async () => {
        claves.resolves(['galeno-api-v0','galeno-api-v1','galeno-api-v99','galenosv-v16','otra-app']);
        guardarSesion({idPersona:'persona',nombres:'IT',apellidos:'IT'}); establecerContexto({idPersonaRol:'rol'}); await cerrarSesion(); await limpiarCachesAPI();
        const borradas = borrar.getCalls().map(c=>c.args[0]);
        for (const n of ['galeno-api-v0','galeno-api-v1','galeno-api-v99']) assert.include(borradas,n);
        assert.notInclude(borradas,'galenosv-v16'); assert.notInclude(borradas,'otra-app'); assert.isNull(sessionStorage.getItem('sesionPersona'));
    });
    test('Una respuesta de escritura con Location preserva el cuerpo y cierra su temporizador', async () => {
        const reloj = sandbox.useFakeTimers();
        fetchStub.resolves(new Response(JSON.stringify({ confirmado: true }), {
            status: 200, headers: { Location: '/consulta/confirmada' }
        }));
        const respuesta = await solicitarREST(url, { method: 'PUT' });
        assert.equal(respuesta.headers.get('Location'), '/consulta/confirmada');
        await reloj.tickAsync(TIEMPO_ESCRITURA_REST);
        assert.deepEqual(await respuesta.json(), { confirmado: true });
        sinon.assert.calledOnce(fetchStub);
    });

    test('Un fallo de CacheStorage no impide cerrar la sesión ni consultar datos vigentes', async () => {
        claves.rejects(new Error('CacheStorage no disponible'));
        borrar.rejects(new Error('CacheStorage no disponible'));
        guardarSesion({ idPersona: 'persona' });
        establecerContexto({ idPersonaRol: 'rol' });
        await cerrarSesion();
        assert.isNull(sessionStorage.getItem('sesionPersona'));
        assert.isNull(sessionStorage.getItem('sesionPersonaRol'));
        fetchStub.resolves(response({ vigente: true }));
        assert.deepEqual(await (await solicitarREST(url)).json(), { vigente: true });
    });

});
mocha.run();
