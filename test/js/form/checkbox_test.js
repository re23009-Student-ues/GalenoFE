import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Checkbox } from '../../../src/js/boundary/componentes/form/checkbox/index.js';
import { Wizard } from '../../../src/js/boundary/componentes/navigation/wizard/index.js';
import { Modal } from '../../../src/js/boundary/componentes/overlays/index.js';
mocha.setup('tdd');
suite('Checkbox nativo', () => {
    let fixture, fields, components;
    const pause = () => new Promise(resolve => setTimeout(resolve, 20));
    function create(options = {}, target = fixture) {
        const field = new Checkbox(target, options); fields.push(field); return field.render();
    }
    setup(() => { fixture = document.querySelector('#fixtures'); fields = []; components = []; });
    teardown(() => { fields.forEach(field => field.destroy()); components.forEach(component => component.destroy()); fixture.replaceChildren(); sinon.restore(); });
    test('Opcional, vacío y accesible por defecto', () => {
        const field = create({ label: 'Consentimiento', name: 'consentimiento' });
        assert.equal(field.root.localName, 'galeno-checkbox'); assert.equal(field.control.type, 'checkbox');
        assert.isFalse(field.getChecked()); assert.isTrue(field.validate().valid);
        assert.equal(field.label.htmlFor, field.control.id); assert.equal(field.control.labels[0], field.label);
        field.focus(); assert.equal(document.activeElement, field.control); assert.equal(field.control.tabIndex, 0);
    });
    test('Configuración inicial e identificadores', () => {
        const field = create({ id: 'examen-1', name: 'examenes', checked: true, value: 'uuid' });
        assert.isTrue(field.getChecked()); assert.equal(field.getValue(), 'uuid'); assert.equal(field.control.id, 'examen-1');
        assert.throws(() => create({ id: 'examen-1' }), TypeError);
        assert.throws(() => create({ id: 'examen-1-error' }), TypeError);
    });
    test('Clic en etiqueta marca y desmarca; callback y evento con datos', () => {
        const callback = sinon.spy(), event = sinon.spy(); fixture.addEventListener('galeno-checkbox-change', event, { once: true });
        const field = create({ value: '1', onChange: callback }); field.label.click();
        assert.isTrue(field.getChecked()); sinon.assert.calledWithExactly(callback, true, '1');
        assert.deepEqual(event.firstCall.args[0].detail, { checked: true, value: '1' });
        field.control.click(); assert.isFalse(field.getChecked()); sinon.assert.calledWithExactly(callback, false, '1');
    });
    test('Cambios programáticos y render repetido no emiten callbacks', () => {
        const callback = sinon.spy(), field = create({ onChange: callback }); const control = field.control;
        field.setChecked(true).render().render(); assert.isTrue(field.getChecked()); sinon.assert.notCalled(callback);
        assert.strictEqual(control, field.control); field.control.click(); sinon.assert.calledOnce(callback);
    });
    test('Deshabilitar impide clic y habilitar restaura interacción', () => {
        const callback = sinon.spy(), field = create({ onChange: callback, required: true });
        field.setDisabled(true); field.control.click(); assert.isFalse(field.getChecked()); sinon.assert.notCalled(callback);
        assert.isTrue(field.validate().valid); field.setDisabled(false); field.control.click(); assert.isTrue(field.getChecked());
    });
    test('Required y errores asociados; corrección y limpieza', () => {
        const field = create({ required: true }); assert.equal(field.error.textContent, '');
        assert.isFalse(field.validate().valid); assert.equal(field.control.getAttribute('aria-invalid'), 'true');
        assert.equal(field.control.getAttribute('aria-describedby'), field.error.id);
        field.setChecked(true); assert.isTrue(field.validate().valid);
        field.setError('<b>Error</b>'); assert.equal(field.error.textContent, '<b>Error</b>'); assert.isNull(field.error.querySelector('b'));
        assert.isFalse(field.control.checkValidity()); field.clearError(); assert.isTrue(field.validate().valid);
        assert.isFalse(field.control.hasAttribute('aria-describedby'));
    });
    test('FormData recupera selecciones independientes y permite restaurarlas', () => {
        const form = document.createElement('form'); fixture.append(form);
        const fields = ['1', '2', '3'].map(value => create({ name: 'examenes', value }, form));
        fields[0].setChecked(true); fields[2].setChecked(true);
        assert.deepEqual(new FormData(form).getAll('examenes'), ['1', '3']);
        fields.forEach(field => field.setChecked(['2'].includes(field.getValue())));
        assert.deepEqual(new FormData(form).getAll('examenes'), ['2']);
        assert.equal(new Set(fields.map(field => field.control.id)).size, 3);
    });
    test('Formulario valida required y reset restaura checked inicial sin callback', async () => {
        const form = document.createElement('form'); fixture.append(form); const callback = sinon.spy();
        const field = create({ required: true, checked: true, onChange: callback }, form);
        field.setChecked(false); assert.isFalse(form.checkValidity()); form.reset(); await pause();
        assert.isTrue(field.getChecked()); assert.equal(field.error.textContent, ''); sinon.assert.notCalled(callback);
    });
    test('Reset cancelado conserva el error', async () => {
        const form = document.createElement('form'); fixture.append(form); const field = create({}, form);
        field.setError('Error'); form.addEventListener('reset', event => event.preventDefault(), { once: true });
        form.reset(); await pause(); assert.equal(field.error.textContent, 'Error');
    });
    test('Mover entre formularios reconecta reset', async () => {
        const first = document.createElement('form'), second = document.createElement('form'); fixture.append(first, second);
        const field = create({ checked: true }, first); second.append(field.root); field.setChecked(false).setError('Error');
        first.reset(); await pause(); assert.equal(field.error.textContent, 'Error');
        second.reset(); await pause(); assert.isTrue(field.getChecked()); assert.equal(field.error.textContent, '');
    });
    test('Destroy elimina listeners, DOM y reserva de id; es idempotente', () => {
        const form = document.createElement('form'); fixture.append(form); const callback = sinon.spy();
        const field = create({ id: 'reutilizable', onChange: callback }, form), control = field.control;
        const remove = sinon.spy(control, 'removeEventListener'), removeForm = sinon.spy(form, 'removeEventListener');
        field.destroy(); field.destroy(); control.click(); sinon.assert.notCalled(callback);
        assert.isTrue(remove.calledWith('change')); assert.isTrue(remove.calledWith('invalid')); assert.isTrue(removeForm.calledWith('reset'));
        assert.isNull(document.getElementById('reutilizable')); assert.exists(create({ id: 'reutilizable' }));
    });
    test('Configuraciones y setters inválidos fallan antes de modificar el DOM', () => {
        assert.throws(() => create({ checked: 'true' }), TypeError); assert.throws(() => create({ id: 'a b' }), TypeError);
        const field = create(); assert.throws(() => field.setChecked(1), TypeError); assert.throws(() => field.setDisabled(null), TypeError);
        assert.throws(() => field.setError({}), TypeError);
    });
    test('Wizard valida el checkbox y conserva el nodo y selección al navegar', async () => {
        const host = document.createElement('div'), content = document.createElement('form'), other = document.createElement('p');
        fixture.append(host, content); const field = create({ required: true }, content), control = field.control;
        const wizard = new Wizard(host, { steps: [
            { id: 'seleccion', title: 'Selección', content, validate: () => field.validate() },
            { id: 'revision', title: 'Revisión', content: other }
        ] }).render(); components.push(wizard);
        await wizard.next(); assert.isFalse(field.validate().valid);
        field.setChecked(true); await wizard.next(); await wizard.previous();
        assert.strictEqual(field.control, control); assert.isTrue(field.getChecked()); assert.isTrue(control.isConnected);
    });
    test('Modal conserva el control al abrir, cerrar y restaurar contenido', () => {
        const content = document.createElement('form'); fixture.append(content); const field = create({}, content);
        const modal = new Modal({ animated: false }); components.push(modal); modal.setContent(content).open();
        field.control.click(); assert.isTrue(field.getChecked()); modal.close(); modal.open(); assert.isTrue(field.getChecked());
        modal.destroy(); assert.strictEqual(content.parentNode, fixture);
    });
});
mocha.run(failures => { document.body.dataset.failures = String(failures); });
