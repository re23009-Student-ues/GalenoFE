import { assert } from './lib/chai/index.js';
import sinon from './lib/sinon/sinon-esm.js';
import { crearRouter } from '../../src/js/router.js';

mocha.setup('tdd');
suite('Router por hash', () => {
    let router, contenedor, tituloEl, obtenerUsuario, alRequerirLogin, sandbox, hashOriginal;
    const cambio = () => new Promise(resolve => setTimeout(resolve, 30));

    setup(async () => {
        hashOriginal = window.location.hash;
        window.location.hash = '/login';
        await cambio();
        sandbox = sinon.createSandbox();
        contenedor = document.createElement('div'); // Desconectado: no inicia cargas de las vistas.
        tituloEl = document.createElement('h1');
        obtenerUsuario = sandbox.stub().returns({ idRol: { nombre: 'Médico' } });
        alRequerirLogin = sandbox.spy();
        router = crearRouter({ contenedor, tituloEl, obtenerUsuario, alRequerirLogin });
    });

    teardown(async () => {
        router.detener();
        sandbox.restore();
        window.location.hash = hashOriginal;
        await cambio();
    });

    test('respeta el hash inicial y entrega parámetros decodificados', () => {
        window.location.hash = '/consulta/abc%20def';
        router.iniciar();
        assert.equal(tituloEl.textContent, 'Consulta');
        assert.equal(contenedor.firstChild.localName, 'consulta-controller');
        assert.deepEqual(contenedor.firstChild.parametros, { idConsulta: 'abc def' });
        assert.strictEqual(contenedor.firstChild.usuario, obtenerUsuario());
    });

    test('navega con hashchange sin pushState', async () => {
        const push = sandbox.spy(window.history, 'pushState');
        router.iniciar();
        router.navegarA('/consultas');
        await cambio();
        assert.equal(window.location.hash, '#/consultas');
        assert.equal(tituloEl.textContent, 'Agenda Médica');
        sinon.assert.notCalled(push);
        window.location.hash = '/dashboard';
        await cambio();
        assert.equal(tituloEl.textContent, 'Resumen');
    });

    test('sin hash y sin sesión abre citas sin solicitar login ni guardar pendiente', async () => {
        obtenerUsuario.returns(null);
        window.location.hash = '';
        router.iniciar();
        await cambio();
        assert.equal(window.location.hash, '#/citas');
        assert.equal(tituloEl.textContent, 'Búsqueda de citas');
        sinon.assert.notCalled(alRequerirLogin);
        assert.equal(router.tomarPendiente('/sin-pendiente'), '/sin-pendiente');
    });

    test('sin hash y con sesión abre dashboard', async () => {
        window.location.hash = '';
        router.iniciar();
        await cambio();
        assert.equal(window.location.hash, '#/dashboard');
        assert.equal(tituloEl.textContent, 'Resumen');
        sinon.assert.notCalled(alRequerirLogin);
    });

    test('redirige una ruta protegida sin sesión al login y recuerda la pendiente', async () => {
        obtenerUsuario.returns(null);
        window.location.hash = '/consulta/42';
        router.iniciar();
        await cambio();
        assert.equal(window.location.hash, '#/login');
        assert.equal(tituloEl.textContent, 'Iniciar sesión');
        assert.isNull(contenedor.firstChild);
        sinon.assert.calledOnce(alRequerirLogin);
        assert.equal(router.tomarPendiente(), '/consulta/42');
    });

    test('login es público y no entra en un ciclo de redirección', async () => {
        obtenerUsuario.returns(null);
        router.iniciar();
        await cambio();
        assert.equal(window.location.hash, '#/login');
        assert.equal(tituloEl.textContent, 'Iniciar sesión');
        sinon.assert.calledOnce(alRequerirLogin);
    });

    test('recuerda la consulta con su id y vuelve a ella tras el login', async () => {
        obtenerUsuario.returns(null);
        window.location.hash = '/consulta/abc%20def';
        router.iniciar();
        await cambio();
        assert.equal(window.location.hash, '#/login');
        obtenerUsuario.returns({ idRol: { nombre: 'Médico' } });
        const pendiente = router.tomarPendiente('/dashboard');
        assert.equal(pendiente, '/consulta/abc%20def');
        router.navegarA(pendiente);
        await cambio();
        assert.equal(window.location.hash, '#/consulta/abc%20def');
        assert.deepEqual(contenedor.firstChild.parametros, { idConsulta: 'abc def' });
    });

    test('consume la pendiente una sola vez y respeta el valor por defecto', () => {
        obtenerUsuario.returns(null);
        router.manejarRuta('/consulta/42');
        assert.equal(router.tomarPendiente(), '/consulta/42');
        assert.equal(router.tomarPendiente(), '/dashboard');
        assert.equal(router.tomarPendiente('/citas'), '/citas');
    });

    test('detener borra la ruta pendiente', () => {
        obtenerUsuario.returns(null);
        router.manejarRuta('/consulta/73');
        router.detener();
        assert.equal(router.tomarPendiente('/dashboard'), '/dashboard');
    });

    test('desde citas solicita login una sola vez por cada redirección protegida', async () => {
        obtenerUsuario.returns(null);
        window.location.hash = '/citas';
        router.iniciar();
        await cambio();
        sinon.assert.notCalled(alRequerirLogin);
        router.navegarA('/consulta/42');
        await cambio();
        assert.equal(window.location.hash, '#/login');
        sinon.assert.calledOnce(alRequerirLogin);
        assert.equal(router.tomarPendiente(), '/consulta/42');
        router.navegarA('/consulta/73');
        await cambio();
        sinon.assert.calledTwice(alRequerirLogin);
        assert.equal(router.tomarPendiente(), '/consulta/73');
    });

    test('volver de citas a login vuelve a solicitarlo, con sesión no lo solicita', async () => {
        obtenerUsuario.returns(null);
        router.iniciar();
        await cambio();
        sinon.assert.calledOnce(alRequerirLogin);
        router.navegarA('/citas');
        await cambio();
        router.navegarA('/login');
        await cambio();
        sinon.assert.calledTwice(alRequerirLogin);
        obtenerUsuario.returns({ idRol: { nombre: 'Médico' } });
        router.manejarRuta('/login');
        sinon.assert.calledTwice(alRequerirLogin);
    });

    test('el callback de login es opcional', () => {
        router.detener();
        router = crearRouter({ contenedor, tituloEl, obtenerUsuario });
        obtenerUsuario.returns(null);
        assert.doesNotThrow(() => router.manejarRuta('/consulta/42'));
        assert.equal(window.location.hash, '#/login');
    });

    test('citas se abre sin sesión y muestra el placeholder', async () => {
        obtenerUsuario.returns(null);
        window.location.hash = '/citas';
        router.iniciar();
        await cambio();
        assert.equal(window.location.hash, '#/citas');
        assert.equal(tituloEl.textContent, 'Búsqueda de citas');
        assert.equal(contenedor.firstChild.className, 'aviso');
        assert.equal(contenedor.textContent, 'Esta pantalla está en construcción.');
        sinon.assert.notCalled(alRequerirLogin);
        assert.equal(router.tomarPendiente('/dashboard'), '/dashboard');
    });

    test('consulta la sesión de nuevo en cada hashchange', async () => {
        router.iniciar();
        obtenerUsuario.returns(null);
        router.navegarA('/consultas');
        await cambio();
        assert.equal(window.location.hash, '#/login');
        assert.isNull(contenedor.firstChild);
    });

    test('rutas eliminadas con sesión caen en dashboard', async () => {
        for (const ruta of ['/personas', '/procedimientos', '/laboratorio', '/configuracion']) {
            window.location.hash = ruta;
            router.iniciar(); await cambio();
            assert.equal(window.location.hash, '#/dashboard');
            assert.equal(contenedor.firstChild.localName, 'resumen-controller');
            assert.deepEqual(contenedor.firstChild.parametros, {});
        }
        sinon.assert.notCalled(alRequerirLogin);
    });

    test('rutas eliminadas o desconocidas sin sesión caen en citas sin pedir login', async () => {
        obtenerUsuario.returns(null);
        for (const ruta of ['/personas', '/procedimientos', '/laboratorio', '/configuracion', '/desconocida', '/consulta/%ZZ']) {
            window.location.hash = ruta;
            router.iniciar(); await cambio();
            assert.equal(window.location.hash, '#/citas');
            assert.equal(tituloEl.textContent, 'Búsqueda de citas');
        }
        sinon.assert.notCalled(alRequerirLogin);
        assert.equal(router.tomarPendiente('/sin-pendiente'), '/sin-pendiente');
    });

    test('hash vacío, desconocido o mal codificado vuelve a dashboard', () => {
        for (const ruta of ['', '/desconocida', '/consulta/%ZZ', '/consulta/1/extra', '/consulta/']) {
            window.location.hash = ruta;
            router.iniciar();
            assert.equal(window.location.hash, '#/dashboard');
            assert.equal(tituloEl.textContent, 'Resumen');
        }
    });

    test('detener elimina el listener e iniciar no lo duplica', async () => {
        const escuchar = sandbox.spy(window, 'addEventListener');
        const quitar = sandbox.spy(window, 'removeEventListener');
        router.iniciar();
        router.iniciar();
        assert.equal(escuchar.getCalls().filter(c => c.args[0] === 'hashchange').length, 1);
        router.detener();
        sinon.assert.calledWith(quitar, 'hashchange', sinon.match.func);
        obtenerUsuario.resetHistory();
        window.location.hash = '/consultas';
        await cambio();
        sinon.assert.notCalled(obtenerUsuario);
        assert.isNull(contenedor.firstChild);
        router.iniciar();
        assert.equal(tituloEl.textContent, 'Agenda Médica');
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
