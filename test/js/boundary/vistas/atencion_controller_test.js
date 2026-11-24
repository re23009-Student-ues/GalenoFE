import { assert } from '../../lib/chai/index.js';
import sinon from '../../lib/sinon/sinon-esm.js';
import AtencionController from '../../../../src/js/boundary/vistas/atencion_controller.js';

suite('AtencionController', () => {
    test('una consulta de otra clínica se rechaza antes de solicitar sus pasos', async () => {
        const sandbox = sinon.createSandbox();
        const vista = new AtencionController();
        const fetchREST = sandbox.stub(window, 'fetch').callsFake(async () => new Response(JSON.stringify({
            idConsulta: 'externa', idPersonaRol: { idClinica: { idClinica: 'otra-clinica' } }
        })));
        try {
            document.querySelector('#fixtures').append(vista);
            vista.usuario = { idClinica: { idClinica: 'mi-clinica' } };
            vista.idConsulta = 'externa';
            await vista.cargar();
            assert.include(vista.textContent, 'La consulta no está disponible para este usuario');
            sinon.assert.calledOnce(fetchREST);
            assert.match(new URL(fetchREST.firstCall.args[0]).pathname, /\/consulta\/externa$/);
        } finally {
            vista.remove();
            sandbox.restore();
        }
    });
});
