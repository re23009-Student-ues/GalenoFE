import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import Checkbox from '../../../src/js/boundary/componentes/form/checkbox/Checkbox.js';

mocha.setup('tdd');

suite('Checkbox nativo', () => {
    let formulario, campos;
    function montar(opciones) {
        const campo = new Checkbox(formulario, opciones).render();
        campos.push(campo);
        return campo;
    }
    setup(() => {
        formulario = document.createElement('form');
        document.body.append(formulario);
        campos = [];
    });
    teardown(() => {
        campos.forEach(campo => campo.destroy());
        formulario.remove();
    });

    test('La etiqueta cambia la selección y notifica una vez por interacción', () => {
        const onChange = sinon.spy();
        const campo = montar({ label: 'Hemograma', onChange });
        campo.render();
        campo.label.click();
        assert.isTrue(campo.getChecked());
        campo.label.click();
        assert.isFalse(campo.getChecked());
        assert.deepEqual(onChange.args, [[true], [false]]);
        assert.lengthOf(formulario.querySelectorAll('input'), 1);
    });

    test('El formulario serializa solo opciones habilitadas y restaura la selección inicial', () => {
        const primero = montar({ name: 'examen', value: 'a', checked: true });
        const segundo = montar({ name: 'examen', value: 'b' });
        assert.notEqual(primero.control.id, segundo.control.id);
        segundo.setChecked(true);
        assert.deepEqual(new FormData(formulario).getAll('examen'), ['a', 'b']);
        primero.setDisabled(true);
        assert.deepEqual(new FormData(formulario).getAll('examen'), ['b']);
        formulario.reset();
        assert.isTrue(primero.getChecked());
        assert.isFalse(segundo.getChecked());
    });

    test('Bloquea cambios del usuario cuando está deshabilitado y limpia listeners al destruir', () => {
        const onChange = sinon.spy();
        const campo = montar({ disabled: true, onChange });
        campo.label.click();
        assert.isFalse(campo.getChecked());
        campo.setDisabled(false).setChecked(true);
        const control = campo.control;
        campo.destroy();
        campo.destroy();
        control.dispatchEvent(new Event('change'));
        sinon.assert.notCalled(onChange);
        assert.isTrue(campo.getChecked());
        assert.notExists(formulario.querySelector('galeno-checkbox'));
    });

    test('Rechaza opciones y valores inválidos antes de modificar el control', () => {
        assert.throws(() => montar({ checked: 'true' }), TypeError);
        assert.throws(() => montar({ onChange: true }), TypeError);
        assert.isEmpty(formulario.children);
        const campo = montar();
        assert.throws(() => campo.setChecked(1), TypeError);
        assert.throws(() => campo.setDisabled(null), TypeError);
        assert.isFalse(campo.getChecked());
        assert.isFalse(campo.control.disabled);
    });
});

mocha.run();
