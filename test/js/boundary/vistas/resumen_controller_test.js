import { assert } from '../../lib/chai/index.js';
import sinon from '../../lib/sinon/sinon-esm.js';
import ResumenController from '../../../../src/js/boundary/vistas/resumen_controller.js';

suite('ResumenController', () => {
    test('propaga el contexto activo al selector y a la agenda', () => {
        const sandbox = sinon.createSandbox();
        const vista = new ResumenController();
        sandbox.stub(window, 'fetch').callsFake(async () => new Response('[]'));
        try {
            const usuario = {
                idPersonaRol: 'emp', idClinica: { idClinica: 'cli' },
                idRol: { idRol: 'med', nombre: 'Médico' }, idPersona: { idPersona: 'persona' }
            };
            vista.usuario = usuario;
            document.querySelector('#fixtures').append(vista);
            assert.strictEqual(vista.querySelector('galeno-selector-contexto').usuario, usuario);
            assert.strictEqual(vista.querySelector('galeno-agenda').usuario, usuario);
        } finally {
            vista.remove();
            sandbox.restore();
        }
    });
});
