import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import '../../../src/js/boundary/galeno_app.js';

mocha.setup('tdd');
suite('Instalación PWA desde la barra superior', () => {
    let app, sandbox, media, standalone;
    setup(() => {
        sandbox = sinon.createSandbox();
        standalone = false;
        media = new EventTarget();
        Object.defineProperty(media, 'matches', { get: () => standalone });
        sandbox.stub(window, 'matchMedia').withArgs('(display-mode: standalone)').returns(media);
        app = document.createElement('galeno-app');
        document.querySelector('#fixtures').append(app);
    });
    teardown(() => { app.remove(); sandbox.restore(); });

    function ofrecer(userChoice = Promise.resolve({ outcome: 'accepted' })) {
        const evento = new Event('beforeinstallprompt', { cancelable: true });
        evento.prompt = sandbox.stub().resolves();
        evento.userChoice = userChoice;
        window.dispatchEvent(evento);
        return evento;
    }

    test('sin oferta está oculto y el pie nunca contiene el instalador', () => {
        assert.exists(app.querySelector('galeno-topbar instalador-app'));
        assert.notExists(app.querySelector('.pie instalador-app'));
        assert.isTrue(app.instalador.hidden);
        assert.isTrue(app.instalador.boton.hidden);
        assert.equal(app.instalador.boton.textContent, 'Instalar');
        assert.equal(app.instalador.boton.getAttribute('aria-label'), 'Instalar GalenoSV');
        assert.exists(app.instalador.shadowRoot.querySelector('link[rel="stylesheet"]'));
    });

    test('beforeinstallprompt se pospone y aparece en público y personal sin perder el evento', () => {
        const instalador = app.instalador;
        const evento = ofrecer();
        assert.isTrue(evento.defaultPrevented);
        assert.strictEqual(instalador.eventoInstalacion, evento);
        assert.isFalse(instalador.boton.hidden);
        app.usuario = { idPersona: { nombres: 'Ana' }, idRol: { nombre: 'Médico' } };
        assert.strictEqual(app.instalador, instalador);
        assert.isFalse(instalador.boton.hidden);
        app.usuario = null;
        assert.strictEqual(app.instalador, instalador);
        assert.isFalse(instalador.boton.hidden);
        assert.lengthOf(app.querySelectorAll('instalador-app'), 1);
        assert.notExists(app.querySelector('.pie button'));
    });

    test('click llama prompt una vez, espera userChoice y consume el evento', async () => {
        let elegir;
        const eleccion = new Promise(resolve => { elegir = resolve; });
        const evento = ofrecer(eleccion);
        const instalador = app.instalador;
        instalador.boton.click();
        instalador.boton.click();
        sinon.assert.calledOnce(evento.prompt);
        await Promise.resolve();
        assert.isTrue(instalador.instalando);
        elegir({ outcome: 'accepted' });
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.isFalse(instalador.instalando);
        assert.isNull(instalador.eventoInstalacion);
        assert.isTrue(instalador.boton.hidden);
        instalador.boton.click();
        sinon.assert.calledOnce(evento.prompt);
    });

    test('descartar la instalación también oculta y consume el evento', async () => {
        const evento = ofrecer(Promise.resolve({ outcome: 'dismissed' }));
        await app.instalador.instalar();
        sinon.assert.calledOnce(evento.prompt);
        assert.isTrue(app.instalador.boton.hidden);
        assert.isNull(app.instalador.eventoInstalacion);
    });

    test('appinstalled oculta el botón y evita nuevas ofertas en esta instancia', () => {
        ofrecer();
        window.dispatchEvent(new Event('appinstalled'));
        assert.isTrue(app.instalador.boton.hidden);
        assert.isNull(app.instalador.eventoInstalacion);
        const evento = ofrecer();
        assert.isTrue(evento.defaultPrevented);
        assert.isTrue(app.instalador.hidden);
        sinon.assert.notCalled(evento.prompt);
    });

    test('standalone desde el arranque nunca muestra ni permite instalar', async () => {
        app.remove();
        standalone = true;
        document.querySelector('#fixtures').append(app);
        const evento = ofrecer();
        assert.isTrue(app.instalador.boton.hidden);
        await app.instalador.instalar();
        sinon.assert.notCalled(evento.prompt);
    });

    test('entrar en standalone oculta una oferta ya recibida', () => {
        ofrecer();
        standalone = true;
        media.dispatchEvent(new Event('change'));
        assert.isTrue(app.instalador.hidden);
    });

    test('un fallo de prompt oculta el botón sin dejar una operación pendiente', async () => {
        sandbox.stub(console, 'warn');
        const evento = ofrecer();
        evento.prompt.rejects(new Error('No disponible'));
        await app.instalador.instalar();
        assert.isTrue(app.instalador.hidden);
        assert.isFalse(app.instalador.instalando);
        assert.isNull(app.instalador.eventoInstalacion);
    });

    test('desconectar limpia listeners y reconectar conserva un único botón y la oferta', () => {
        const instalador = app.instalador;
        const evento = ofrecer();
        const quitar = sandbox.spy(window, 'removeEventListener');
        const quitarMedia = sandbox.spy(media, 'removeEventListener');
        app.remove();
        sinon.assert.calledWith(quitar, 'beforeinstallprompt', instalador.alOfrecerInstalacion);
        sinon.assert.calledWith(quitar, 'appinstalled', instalador.alInstalar);
        sinon.assert.calledWith(quitarMedia, 'change', instalador.actualizar);
        document.querySelector('#fixtures').append(app);
        assert.strictEqual(app.instalador, instalador);
        assert.strictEqual(instalador.eventoInstalacion, evento);
        assert.lengthOf(instalador.shadowRoot.querySelectorAll('button'), 1);
        assert.isFalse(instalador.hidden);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
