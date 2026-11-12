import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { mostrarLogin } from '../../../src/js/boundary/login.js';
import { guardarSesion, obtenerSesion, establecerContexto, obtenerContexto, cerrarSesion } from '../../../src/js/control/sesion_service.js';

mocha.setup('tdd');
suite('Ingreso HU2 y contexto de trabajo', () => {
    const persona = { idPersona: 'p1', nombres: 'Ana', apellidos: 'López' };
    const tipo = { idTipoDocumento: 'dui', activo: true, nombre: 'DUI', indicaciones: 'Ocho dígitos y un verificador', expresionRegular: '[0-9]{8}-[0-9]' };
    const rol = { idPersonaRol: 'r1', idPersona: persona, idRol: { nombre: 'Médico' }, idClinica: { nombre: 'Central' } };
    const segundo = { ...rol, idPersonaRol: 'r2', idClinica: { nombre: 'Norte' } };
    const pausa = () => new Promise(resolve => setTimeout(resolve, 40));
    const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status });
    let sandbox, fetchStub, fixture, aplicacion, iniciarAplicacion, guardado, contexto, hash;

    suiteSetup(async () => {
        // Importar después del DOMContentLoaded evita arrancar main fuera del fixture.
        await pausa();
        ({ iniciarAplicacion } = await import('../../../src/js/main.js'));
    });
    setup(async () => {
        guardado = sessionStorage.getItem('sesionPersona');
        contexto = sessionStorage.getItem('sesionPersonaRol');
        hash = window.location.hash;
        cerrarSesion();
        window.location.hash = '/login';
        await pausa();
        sandbox = sinon.createSandbox();
        sandbox.stub(console, 'error');
        fetchStub = sandbox.stub(window, 'fetch').callsFake(async url => {
            const ruta = new URL(url).pathname;
            if (ruta.endsWith('/tipo_documento')) return json([tipo, { ...tipo, idTipoDocumento: 'inactivo', activo: false }]);
            if (ruta.endsWith('/documento/buscar')) return json({ idPersona: persona });
            if (ruta.endsWith('/persona_rol/persona/p1')) return json([rol, segundo]);
            throw new Error(`Petición inesperada: ${url}`);
        });
        fixture = document.getElementById('fixtures');
        fixture.innerHTML = '<galeno-app></galeno-app>';
        // Conserva el router real; evita peticiones de las vistas al conectarlas.
        sandbox.stub(fixture.querySelector('#app-root'), 'replaceChildren');
    });
    teardown(async () => {
        aplicacion?.detener();
        aplicacion = null;
        fixture.replaceChildren();
        sandbox.restore();
        cerrarSesion();
        if (guardado !== null) sessionStorage.setItem('sesionPersona', guardado);
        if (contexto !== null) sessionStorage.setItem('sesionPersonaRol', contexto);
        window.location.hash = hash;
        await pausa();
    });

    function enviar(valor = '01234567-8') {
        const input = fixture.querySelector('#login-documento');
        input.value = valor;
        input.dispatchEvent(new Event('input'));
        fixture.querySelector('#login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    }

    test('login exitoso: solo tipos activos, indicaciones y persona sin contexto', async () => {
        const ingreso = mostrarLogin();
        await pausa();
        assert.exists(fixture.querySelector('login-formulario'));
        assert.lengthOf(fixture.querySelectorAll('select'), 1);
        assert.lengthOf(fixture.querySelectorAll('input'), 1);
        assert.deepEqual([...fixture.querySelector('select').options].map(o => o.value), ['', 'dui']);
        assert.equal(fixture.querySelector('#login-indicaciones').textContent, tipo.indicaciones);
        enviar();
        assert.isTrue(fixture.querySelector('#login-entrar').disabled);
        assert.deepEqual(await ingreso, { persona, personaRoles: [rol, segundo] });
        assert.deepEqual(obtenerSesion(), persona);
        assert.isNull(obtenerContexto());
        assert.isTrue(fixture.querySelector('#pantalla-login').hidden);
    });

    test('documento no registrado muestra el mensaje y permite reintentar', async () => {
        fetchStub.withArgs(sinon.match(/documento\/buscar/)).callsFake(async () => json(null, 404));
        mostrarLogin(); await pausa(); enviar(); await pausa();
        assert.equal(fixture.querySelector('#login-aviso').textContent, 'Documento no registrado');
        assert.isFalse(fixture.querySelector('#login-entrar').disabled);
        assert.isNull(obtenerSesion());
    });

    test('formato inválido se informa sin consultar el documento', async () => {
        mostrarLogin(); await pausa(); enviar('incorrecto'); await pausa();
        assert.equal(fixture.querySelector('#login-aviso').textContent, 'El formato del documento no es válido');
        assert.equal(fetchStub.callCount, 1);
        assert.isNull(obtenerSesion());
    });

    test('una persona que solo es paciente no inicia sesión', async () => {
        fetchStub.withArgs(sinon.match(/persona_rol\/persona/)).callsFake(async () => json([{ ...rol, idRol: { nombre: 'Paciente' } }]));
        mostrarLogin(); await pausa(); enviar(); await pausa();
        assert.equal(fixture.querySelector('#login-aviso').textContent, 'Solo el personal puede ingresar');
        assert.isNull(obtenerSesion());
    });

    test('main elige el primer contexto y vuelve a la consulta pendiente', async () => {
        window.location.hash = '/consulta/42';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        enviar(); await pausa();
        assert.equal(obtenerContexto(), 'r1');
        assert.equal(window.location.hash, '#/consulta/42');
        assert.equal(fixture.querySelector('#usuario-nombre').textContent, 'Ana López');
        assert.include(fixture.querySelector('#usuario-detalle').textContent, 'Central');
        const pantalla = fixture.querySelector('#app-root').replaceChildren.lastCall.args[0];
        assert.deepEqual(pantalla.usuario, rol);
    });

    test('restaura tras recarga el contexto elegido, incluso si no es el primero', async () => {
        guardarSesion(persona); establecerContexto(segundo);
        window.location.hash = '/consultas';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        assert.isNull(fixture.querySelector('#login-form'));
        assert.include(fixture.querySelector('#usuario-detalle').textContent, 'Norte');
        assert.equal(window.location.hash, '#/consultas');
        assert.equal(obtenerContexto(), 'r2');
    });

    test('si falla restaurar la sesión muestra el login y limpia los datos', async () => {
        guardarSesion(persona); establecerContexto(rol);
        fetchStub.withArgs(sinon.match(/persona_rol\/persona/)).rejects(new TypeError('Sin conexión'));
        window.location.hash = '/consultas';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        assert.exists(fixture.querySelector('#login-form'));
        assert.equal(window.location.hash, '#/login');
        assert.isNull(obtenerSesion()); assert.isNull(obtenerContexto());
    });

    test('un contexto que ya no pertenece a la persona requiere login', async () => {
        guardarSesion(persona); establecerContexto({ idPersonaRol: 'eliminado' });
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        assert.exists(fixture.querySelector('#login-form'));
        assert.isNull(obtenerSesion());
    });

    test('cierre de sesión limpia persona y contexto y abre citas en modo público', async () => {
        guardarSesion(persona); establecerContexto(segundo);
        window.location.hash = '/dashboard';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        fixture.querySelector('#btn-salir').click(); await pausa();
        assert.isNull(obtenerSesion()); assert.isNull(obtenerContexto());
        assert.equal(window.location.hash, '#/citas');
        assert.isNull(fixture.querySelector('#login-form'));
        assert.equal(fixture.querySelector('galeno-app').getAttribute('modo'), 'publico');
    });

    test('citas permanece pública y navegar a una protegida abre login', async () => {
        window.location.hash = '/citas';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        assert.isNull(fixture.querySelector('#login-form'));
        sinon.assert.notCalled(fetchStub);
        aplicacion.router.navegarA('/consultas'); await pausa();
        assert.exists(fixture.querySelector('#login-form'));
    });

    test('main sin hash y sin sesión abre citas sin mostrar login', async () => {
        window.location.hash = '';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        assert.equal(window.location.hash, '#/citas');
        assert.isNull(fixture.querySelector('#login-form'));
        sinon.assert.notCalled(fetchStub);
    });

    test('main sin hash restaura la sesión antes de abrir dashboard', async () => {
        guardarSesion(persona); establecerContexto(segundo);
        window.location.hash = '';
        aplicacion = iniciarAplicacion(); await aplicacion.listo; await pausa();
        assert.equal(window.location.hash, '#/dashboard');
        assert.isNull(fixture.querySelector('#login-form'));
        assert.include(fixture.querySelector('#usuario-detalle').textContent, 'Norte');
    });

    test('desconectar el shell impide reactivar el router tras una restauración pendiente', async () => {
        guardarSesion(persona); establecerContexto(rol);
        let resolver;
        fetchStub.withArgs(sinon.match(/persona_rol\/persona/)).returns(new Promise(resolve => { resolver = resolve; }));
        const app = fixture.querySelector('galeno-app');
        aplicacion = iniciarAplicacion(app);
        const iniciar = sandbox.spy(aplicacion.router, 'iniciar');
        app.remove();
        resolver(json([rol]));
        await aplicacion.listo;
        sinon.assert.notCalled(iniciar);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
