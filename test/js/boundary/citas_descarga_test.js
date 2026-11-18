import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Toast } from '../../../src/js/boundary/componentes/feedback/index.js';
import '../../../src/js/boundary/galeno_app.js';
import '../../../src/js/boundary/vistas/citas_controller.js';

mocha.setup('tdd');

suite('Descarga pública de citas', () => {
    let sandbox, host, fetchStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(window, 'fetch');
        host = document.querySelector('#fixtures');
    });

    teardown(() => {
        host.replaceChildren();
        sandbox.restore();
    });

    function montarTarjeta(contenedor = host) {
        const tarjeta = document.createElement('galeno-tarjeta-cita');
        tarjeta.cita = { idConsulta: 'cita-1', procedimientos: [] };
        contenedor.append(tarjeta);
        return tarjeta;
    }

    const pdf = () => new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } });

    test('una descarga tardía no crea archivos ni emite eventos tras reconectar la tarjeta', async () => {
        let entregar;
        fetchStub.returns(new Promise(resolve => { entregar = resolve; }));
        const crearArchivo = sandbox.stub(URL, 'createObjectURL').returns('blob:prueba');
        const descargada = sandbox.spy();
        const tarjeta = montarTarjeta();
        tarjeta.addEventListener('galeno-consulta-descargada', descargada);
        const pendiente = tarjeta.descargar();

        tarjeta.remove();
        host.append(tarjeta);
        entregar(pdf());
        await pendiente;

        sinon.assert.notCalled(crearArchivo);
        sinon.assert.notCalled(descargada);
        assert.equal(tarjeta.querySelector('[role=status]').textContent, '');
        assert.isFalse(tarjeta.querySelector('button').disabled);
    });

    test('la descarga recomienda instalar una vez y desmontar la vista retira el aviso', async () => {
        const reloj = sandbox.useFakeTimers();
        fetchStub.onFirstCall().resolves(new Response('[]'));
        fetchStub.onSecondCall().resolves(pdf());
        fetchStub.onThirdCall().resolves(pdf());
        sandbox.stub(URL, 'createObjectURL').returns('blob:prueba');
        sandbox.stub(URL, 'revokeObjectURL');
        sandbox.stub(HTMLAnchorElement.prototype, 'click');

        const app = host.appendChild(document.createElement('galeno-app'));
        const recomendar = sandbox.stub(app.instalador, 'recomendar').returns('aviso-citas');
        const quitar = sandbox.stub(Toast, 'dismiss');
        const vista = app.outlet.appendChild(document.createElement('galeno-citas'));
        const tarjeta = montarTarjeta(vista);
        await tarjeta.descargar();
        await tarjeta.descargar();
        await reloj.tickAsync(2999);
        sinon.assert.notCalled(recomendar);
        await reloj.tickAsync(1);
        sinon.assert.calledOnceWithExactly(recomendar, sinon.match(/acceder a tus citas/));

        vista.remove();
        sinon.assert.calledOnceWithExactly(quitar, 'aviso-citas');
    });

    test('salir antes de que se anuncie la instalación cancela el aviso pendiente', async () => {
        const reloj = sandbox.useFakeTimers();
        fetchStub.resolves(new Response('[]'));
        const app = host.appendChild(document.createElement('galeno-app'));
        const recomendar = sandbox.stub(app.instalador, 'recomendar');
        const vista = app.outlet.appendChild(document.createElement('galeno-citas'));

        vista.dispatchEvent(new CustomEvent('galeno-consulta-descargada', { bubbles: true }));
        vista.remove();
        await reloj.tickAsync(3000);
        sinon.assert.notCalled(recomendar);
    });
});

mocha.run();
