import { assert } from '../../lib/chai/index.js';
import sinon from '../../lib/sinon/sinon-esm.js';
import GalenoCitas from '../../../../src/js/boundary/vistas/citas_controller.js';

suite('GalenoCitas', () => {
    test('un documento con formato inválido mantiene deshabilitada la búsqueda y no consulta el servidor', async () => {
        const sandbox = sinon.createSandbox();
        const vista = new GalenoCitas();
        const fetchREST = sandbox.stub(window, 'fetch').callsFake(async () => new Response(JSON.stringify([
            { idTipoDocumento: 'dui', nombre: 'DUI', activo: true, expresionRegular: '[0-9]{8}-[0-9]' }
        ])));
        try {
            document.querySelector('#fixtures').append(vista);
            await vista.catalogo();
            const tipo = vista.campo('tipo');
            tipo.value = 'dui';
            tipo.dispatchEvent(new Event('input', { bubbles: true }));
            const numero = vista.campo('numero');
            numero.value = 'invalido';
            numero.dispatchEvent(new Event('input', { bubbles: true }));
            fetchREST.resetHistory();
            await vista.buscar();
            assert.equal(numero.getAttribute('aria-invalid'), 'true');
            assert.isTrue(vista.querySelector('[data-buscar]').disabled);
            sinon.assert.notCalled(fetchREST);
        } finally {
            vista.remove();
            sandbox.restore();
        }
    });
});
