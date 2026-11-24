import { assert } from '../../lib/chai/index.js';
import sinon from '../../lib/sinon/sinon-esm.js';
import AtencionFlujo from '../../../../src/js/boundary/vistas/atencion_flujo.js';

suite('AtencionFlujo', () => {
    test('al desmontar libera sus controles y bloquea nuevas aperturas', () => {
        const host = document.createElement('div');
        const flujo = new AtencionFlujo({}, host, {}, []);
        const wizard = { destroy: sinon.spy() };
        const campo = { destroy: sinon.spy() };
        const checkbox = { destroy: sinon.spy() };
        flujo.wizard = wizard;
        flujo.campos.push(campo);
        flujo.checkboxes.push(checkbox);

        flujo.destroy();

        sinon.assert.calledOnce(wizard.destroy);
        sinon.assert.calledOnce(campo.destroy);
        sinon.assert.calledOnce(checkbox.destroy);
        assert.isNull(flujo.wizard);
        assert.isFalse(flujo.abrir({ idConsultaProcedimiento: 'proc' }));
        assert.isEmpty(host.children);
    });
});
