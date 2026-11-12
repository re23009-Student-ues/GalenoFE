import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import '../../../src/js/boundary/galeno_app.js';
import { guardarSesion, establecerContexto, obtenerSesion, obtenerContexto, cerrarSesion } from '../../../src/js/control/sesion_service.js';

mocha.setup('tdd');
suite('Shell en Web Components', () => {
    const usuario = { idPersonaRol: 'medico-1', idPersona: { nombres: 'Ana', apellidos: 'López' }, idRol: { nombre: 'Médico' }, idClinica: { nombre: 'Central' } };
    let app, sandbox, aplicacion, iniciarAplicacion, personaPrevia, contextoPrevio, hashPrevio;
    const pausa = () => new Promise(resolve => setTimeout(resolve, 40));
    suiteSetup(async () => {
        await pausa();
        ({ iniciarAplicacion } = await import('../../../src/js/main.js'));
    });
    setup(() => {
        personaPrevia = sessionStorage.getItem('sesionPersona');
        contextoPrevio = sessionStorage.getItem('sesionPersonaRol');
        hashPrevio = window.location.hash;
        cerrarSesion();
        sandbox = sinon.createSandbox();
        sandbox.stub(window.caches, 'delete').resolves(true);
        app = document.createElement('galeno-app');
        document.querySelector('#fixtures').append(app);
    });
    teardown(async () => {
        aplicacion?.detener(); aplicacion = null;
        app.remove(); sandbox.restore();
        cerrarSesion();
        if (personaPrevia !== null) sessionStorage.setItem('sesionPersona', personaPrevia);
        if (contextoPrevio !== null) sessionStorage.setItem('sesionPersonaRol', contextoPrevio);
        window.location.hash = hashPrevio;
        await pausa();
    });

    function conectarConSesion() {
        app.remove();
        guardarSesion({ idPersona: 'persona-1', ...usuario.idPersona });
        establecerContexto(usuario);
        app = document.createElement('galeno-app');
        document.querySelector('#fixtures').append(app);
        sandbox.stub(app.outlet, 'replaceChildren'); // Sin conectar vistas ni iniciar sus consultas.
    }

    test('sin red restaura desde la caché API y no llama a cerrarSesion', async () => {
        conectarConSesion();
        sandbox.stub(navigator, 'onLine').get(() => false);
        // Simula fetch resuelto por el service worker desde su caché, sin red.
        const respuestaCacheada = new Response(JSON.stringify([usuario]), { status: 200 });
        const red = sandbox.stub(window, 'fetch').callsFake(async () => respuestaCacheada.clone());
        const eliminarSesion = sandbox.spy(Storage.prototype, 'removeItem');
        window.location.hash = '/dashboard';
        aplicacion = iniciarAplicacion(app);
        await aplicacion.listo;
        sinon.assert.calledOnce(red);
        sinon.assert.notCalled(window.caches.delete);
        sinon.assert.notCalled(eliminarSesion); // cerrarSesion elimina ambas claves con removeItem.
        assert.equal(obtenerSesion().idPersona, 'persona-1');
        assert.equal(obtenerContexto(), usuario.idPersonaRol);
        assert.equal(app.getAttribute('modo'), 'personal');
        assert.isFalse(app.hasAttribute('restaurando'));
        assert.isNull(app.querySelector('#login-form'));
    });

    test('con sesión se oculta al conectarse y se revela en modo personal al restaurar', async () => {
        conectarConSesion();
        assert.isTrue(app.hasAttribute('restaurando'));
        assert.equal(getComputedStyle(app.querySelector('.contenedor-app')).visibility, 'hidden');
        app.usuario = usuario;
        assert.isTrue(app.hasAttribute('restaurando')); // El setter usuario no controla este estado.
        let resolver;
        sandbox.stub(window, 'fetch').returns(new Promise(resolve => { resolver = resolve; }));
        window.location.hash = '/dashboard';
        aplicacion = iniciarAplicacion(app);
        assert.isTrue(app.hasAttribute('restaurando'));
        resolver(new Response(JSON.stringify([usuario]), { status: 200 }));
        await aplicacion.listo;
        assert.isFalse(app.hasAttribute('restaurando'));
        assert.equal(app.getAttribute('modo'), 'personal');
        assert.equal(getComputedStyle(app.querySelector('.contenedor-app')).visibility, 'visible');
    });

    test('sin sesión restaurando nunca aparece, ni al iniciar main', async () => {
        const cambios = [];
        const observador = new MutationObserver(registros => cambios.push(...registros));
        observador.observe(app, { attributes: true, attributeFilter: ['restaurando'] });
        try {
            assert.isFalse(app.hasAttribute('restaurando'));
            window.location.hash = '/citas';
            aplicacion = iniciarAplicacion(app);
            await aplicacion.listo; await pausa();
            assert.isFalse(app.hasAttribute('restaurando'));
            assert.lengthOf(cambios, 0);
            assert.equal(app.getAttribute('modo'), 'publico');
        } finally { observador.disconnect(); }
    });

    test('si falla restaurar se revela el modo público y se solicita login', async () => {
        conectarConSesion();
        let rechazar;
        sandbox.stub(console, 'error');
        sandbox.stub(window, 'fetch').callsFake(url => {
            if (url.includes('persona_rol/persona/')) return new Promise((resolve, reject) => { rechazar = reject; });
            return Promise.resolve(new Response('[]', { status: 200 })); // Catálogo del login.
        });
        window.location.hash = '/dashboard';
        aplicacion = iniciarAplicacion(app);
        assert.isTrue(app.hasAttribute('restaurando'));
        rechazar(new TypeError('Sin conexión'));
        await aplicacion.listo; await pausa();
        assert.isFalse(app.hasAttribute('restaurando'));
        assert.equal(app.getAttribute('modo'), 'publico');
        assert.equal(getComputedStyle(app.querySelector('.contenedor-app')).visibility, 'visible');
        assert.equal(window.location.hash, '#/login');
        assert.exists(app.querySelector('#login-form'));
    });

    test('público: logo y acceso del personal sin menú ni controles de sesión', () => {
        assert.equal(app.getAttribute('modo'), 'publico');
        assert.exists(app.querySelector('galeno-topbar img'));
        assert.equal(app.querySelector('galeno-topbar a[href="#/login"]').textContent, 'Acceso del personal');
        assert.notExists(app.querySelector('galeno-menu'));
        assert.notExists(app.querySelector('#btn-salir'));
        assert.notExists(app.querySelector('#btn-menu-movil'));
        assert.exists(app.querySelector('galeno-outlet'));
        assert.lengthOf(app.querySelectorAll('instalador-app'), 1);
        assert.exists(app.querySelector('galeno-topbar instalador-app'));
        assert.notExists(app.querySelector('.pie instalador-app'));
    });

    test('estado de conexión se muestra al recargar offline y se actualiza con eventos', () => {
        let online = false;
        sandbox.stub(navigator, 'onLine').get(() => online);
        const estado = app.querySelector('galeno-estado-conexion');
        estado.remove();
        app.querySelector('.contenido-principal').prepend(estado);
        assert.isFalse(estado.hidden);
        assert.equal(estado.textContent, 'Sin conexión: se muestran datos guardados');
        online = true;
        window.dispatchEvent(new Event('online'));
        assert.isTrue(estado.hidden);
        online = false;
        window.dispatchEvent(new Event('offline'));
        assert.isFalse(estado.hidden);
        const quitar = sandbox.spy(window, 'removeEventListener');
        estado.remove();
        sinon.assert.calledWith(quitar, 'online', sinon.match.func);
        sinon.assert.calledWith(quitar, 'offline', sinon.match.func);
    });

    test('personal: menú, usuario del contexto y cierre de sesión', () => {
        app.usuario = usuario;
        assert.equal(app.getAttribute('modo'), 'personal');
        assert.exists(app.querySelector('galeno-menu'));
        assert.equal(app.querySelector('#usuario-nombre').textContent, 'Ana López');
        assert.include(app.querySelector('#usuario-detalle').textContent, 'Médico · Central');
        assert.exists(app.querySelector('#btn-salir'));
        assert.notExists(app.querySelector('galeno-topbar a[href="#/login"]'));
        assert.exists(app.querySelector('galeno-topbar instalador-app'));
    });

    test('cambiar de modo conserva outlet, título e instalador y borra identidad al salir', () => {
        const outlet = app.outlet, titulo = app.tituloEl, instalador = app.instalador;
        const contenido = document.createElement('p'); contenido.textContent = 'Vista montada';
        outlet.append(contenido);
        app.usuario = usuario;
        titulo.textContent = 'Consultas';
        app.usuario = null;
        assert.strictEqual(app.outlet, outlet);
        assert.strictEqual(app.tituloEl, titulo);
        assert.strictEqual(outlet.firstChild, contenido);
        assert.strictEqual(app.instalador, instalador);
        assert.notExists(app.querySelector('#usuario-nombre'));
        assert.notExists(app.querySelector('galeno-menu'));
        assert.isTrue(titulo.hidden);
    });

    test('el menú emite ruta y marca el enlace activo sin cambiar el hash', () => {
        app.usuario = usuario;
        const navegar = sandbox.spy();
        app.addEventListener('galeno-navegar', navegar);
        const previo = window.location.hash;
        app.querySelector('[data-route="/consultas"]').click();
        sinon.assert.calledOnce(navegar);
        assert.deepEqual(navegar.firstCall.args[0].detail, { ruta: '/consultas' });
        assert.isTrue(navegar.firstCall.args[0].bubbles);
        assert.isTrue(navegar.firstCall.args[0].composed);
        assert.equal(window.location.hash, previo);
        app.marcarActiva('/consultas');
        assert.isTrue(app.querySelector('[data-route="/consultas"]').classList.contains('activo'));
    });

    test('topbar emite cierre y la hamburguesa alterna el menú; click fuera lo cierra', () => {
        app.usuario = usuario;
        const salir = sandbox.spy();
        app.addEventListener('galeno-cerrar-sesion', salir);
        app.querySelector('#btn-menu-movil').click();
        assert.isTrue(app.querySelector('.sidebar').classList.contains('abierta'));
        document.body.click();
        assert.isFalse(app.querySelector('.sidebar').classList.contains('abierta'));
        app.querySelector('#btn-salir').click();
        sinon.assert.calledOnce(salir);
    });

    test('atributos de entrada actualizan título y ruta; texto de usuario no se interpreta como HTML', () => {
        app.usuario = { ...usuario, idPersona: { nombres: '<img src=x>', apellidos: 'Prueba' } };
        app.topbar.setAttribute('titulo', 'Agenda');
        app.menu.setAttribute('ruta', '/laboratorio');
        assert.equal(app.tituloEl.textContent, 'Agenda');
        assert.isTrue(app.querySelector('[data-route="/laboratorio"]').classList.contains('activo'));
        assert.notExists(app.querySelector('#usuario-nombre img'));
        assert.include(app.querySelector('#usuario-nombre').textContent, '<img src=x>');
    });

    test('desconectar limpia listeners del menú y reconectar no duplica el layout', () => {
        app.usuario = usuario;
        const quitar = sandbox.spy(document, 'removeEventListener');
        const desconectar = sandbox.spy();
        app.addEventListener('galeno-desconectar', desconectar);
        app.remove();
        sinon.assert.calledWith(quitar, 'click', sinon.match.func);
        sinon.assert.calledOnce(desconectar);
        document.querySelector('#fixtures').append(app);
        assert.lengthOf(app.querySelectorAll('galeno-outlet'), 1);
        assert.lengthOf(app.querySelectorAll('galeno-menu'), 1);
        assert.lengthOf(app.querySelectorAll('galeno-topbar'), 1);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
