import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { TextArea } from '../../../src/js/boundary/componentes/form/textarea/index.js';
import { Modal } from '../../../src/js/boundary/componentes/overlays/index.js';

mocha.setup('tdd');
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
suite('TextArea nativo', () => {
    let fixture, fields, components;
    function create(options = {}, target) {
        if (!target) { target = document.createElement('div'); fixture.append(target); }
        const field = new TextArea(target, options); fields.push(field); return field.render();
    }
    setup(() => { fixture = document.querySelector('#fixtures'); fields = []; components = []; });
    teardown(() => { fields.forEach(field => field.destroy()); components.forEach(component => component.destroy()); fixture.replaceChildren(); sinon.restore(); });
    test('Render inicial, etiqueta, placeholder, required y nombre nativos', () => {
        const field = create({ label: 'Observaciones', name: 'notes', placeholder: 'Escribe aquí', required: true, value: 'Inicial', rows: 4 });
        assert.equal(field.root.localName, 'galeno-textarea'); assert.instanceOf(field.control, HTMLTextAreaElement);
        assert.equal(field.label.htmlFor, field.control.id); assert.equal(field.control.name, 'notes');
        assert.equal(field.control.placeholder, 'Escribe aquí'); assert.equal(field.getValue(), 'Inicial');
        assert.isTrue(field.control.required); assert.equal(field.control.rows, 4); assert.isFalse(field.required.hidden);
    });
    test('Render repetido conserva el mismo control y no duplica callbacks', () => {
        const field = create(); const control = field.control;
        const refresh = sinon.spy(field, "refresh");
        field.render().render(); control.value = 'Línea 1\nLínea 2'; control.dispatchEvent(new Event('input', { bubbles: true }));
        assert.strictEqual(field.control, control); assert.lengthOf(field.root.querySelectorAll('textarea'), 1);
        assert.equal(refresh.callCount, 3); assert.equal(field.getValue(), 'Línea 1\nLínea 2');
    });
    test('setValue y clear sincronizan contador sin emitir eventos de usuario', () => {
        const input = sinon.spy(), change = sinon.spy();
        const field = create({ showCounter: true, maxLength: 20 });
        field.control.addEventListener("input", input);
        field.control.addEventListener("change", change);
        field.setValue('Texto\nNuevo'); assert.equal(field.counter.textContent, '11 / 20');
        field.clear(); assert.equal(field.getValue(), ''); assert.equal(field.counter.textContent, '0 / 20');
        assert.isFalse(input.called); assert.isFalse(change.called);
    });
    test('Contador UTF-16 como maxlength; formato sin límite y contador opcional', () => {
        const field = create({ showCounter: true }); field.setValue('💊');
        assert.equal(field.counter.textContent, '2 caracteres');
        assert.isFalse(field.control.hasAttribute('maxlength'));
        const hidden = create({ showCounter: false }); assert.isTrue(hidden.counter.hidden);
    });
    test('Required no muestra error hasta validación explícita o interacción', () => {
        const field = create({ required: true });
        assert.equal(field.error.textContent, ''); assert.equal(field.control.getAttribute('aria-invalid'), 'false');
        assert.isFalse(field.validate().valid); assert.include(field.error.textContent, 'Completa');
        field.setValue('Contenido'); assert.isTrue(field.validate().valid); assert.equal(field.error.textContent, '');
    });
    test('minLength y maxLength verifican también valores programáticos sin truncarlos', () => {
        const field = create({ minLength: 3, maxLength: 5 });
        assert.isTrue(field.validate().valid, 'El campo opcional vacío es válido');
        field.setValue('ab'); assert.isFalse(field.validate().valid); assert.include(field.error.textContent, '3');
        field.setValue('abc'); assert.isTrue(field.validate().valid);
        field.setValue('abcdef'); assert.equal(field.getValue(), 'abcdef'); assert.isFalse(field.validate().valid);
        assert.equal(field.control.maxLength, 5); assert.isTrue(field.control.validity.customError);
    });
    test('setError y ayuda son texto seguro; clearError mantiene las restricciones', () => {
        const field = create({ required: true, helperText: 'Ayuda' });
        field.setError('<img src=x>'); assert.equal(field.error.textContent, '<img src=x>'); assert.notExists(field.root.querySelector('img'));
        assert.isTrue(field.control.getAttribute('aria-describedby').includes(field.error.id));
        field.clearError(); assert.equal(field.error.textContent, ''); assert.isFalse(field.control.validity.valid);
        field.setHelperText('<b>Ayuda nueva</b>'); assert.equal(field.helper.textContent, '<b>Ayuda nueva</b>');
        field.setHelperText(''); assert.isTrue(field.helper.hidden);
        assert.isFalse(field.control.getAttribute('aria-describedby')?.includes(field.helper.id) ?? false);
    });
    test('FormData incluye name y valor; disabled lo excluye y readOnly lo conserva', () => {
        const form = document.createElement('form'), host = document.createElement('div'); form.append(host); fixture.append(form);
        const field = create({ name: 'notes', value: 'Observación', required: true }, host);
        assert.equal(new FormData(form).get('notes'), 'Observación');
        field.setDisabled(true); assert.isFalse(new FormData(form).has('notes')); assert.isTrue(field.validate().valid);
        field.setDisabled(false).setReadOnly(true).clear(); assert.equal(new FormData(form).get('notes'), '');
        assert.isTrue(field.validate().valid); assert.isTrue(field.root.classList.contains('textarea--readonly'));
        field.setReadOnly(false); assert.isFalse(field.validate().valid);
    });
    test('No impide submit; participa en checkValidity nativo', () => {
        const form = document.createElement('form'), host = document.createElement('div'); form.append(host); fixture.append(form);
        const field = create({ required: true, name: 'notes' }, host);
        assert.isFalse(form.checkValidity()); field.setValue('Listo'); assert.isTrue(form.checkValidity());
        const event = new Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(event);
        assert.isFalse(event.defaultPrevented);
    });
    test('Respeta setCustomValidity nativo hasta limpiar explícitamente el error', () => {
        const form = document.createElement('form'), host = document.createElement('div'); form.append(host); fixture.append(form);
        const field = create({ value: 'Texto válido' }, host);
        field.control.setCustomValidity('Validación externa');
        assert.isFalse(form.checkValidity()); assert.isFalse(field.control.validity.valid);
        assert.equal(field.validate().message, 'Validación externa');
        field.control.setCustomValidity(''); field.refresh(); assert.isTrue(form.checkValidity());
        field.setError('Error de la página'); assert.isFalse(form.checkValidity());
        field.clearError(); assert.isTrue(form.checkValidity());
    });
    test('AutoResize crece, se reduce, respeta filas máximas y activa scroll', () => {
        const field = create({ autoResize: true, minRows: 2, maxRows: 4 });
        const initial = field.control.getBoundingClientRect().height;
        field.setValue(Array.from({ length: 20 }, () => 'Línea').join('\n'));
        const maximum = field.control.getBoundingClientRect().height;
        assert.isAbove(maximum, initial); assert.equal(field.control.style.overflowY, 'auto');
        assert.isAtMost(maximum, Number.parseFloat(field.control.style.maxHeight) + 1);
        field.clear(); assert.isBelow(field.control.getBoundingClientRect().height, maximum);
        assert.isAtLeast(field.control.getBoundingClientRect().height, Number.parseFloat(field.control.style.minHeight) - 1);
        assert.equal(field.control.style.overflowY, 'hidden');
    });
    test('AutoResize desactivado conserva altura manual y resize nativo', () => {
        const field = create({ autoResize: false });
        const control = field.control; control.style.height = '140px'; control.style.resize = 'vertical';
        field.setValue('Línea\n'.repeat(20));
        assert.equal(control.style.height, '140px'); assert.equal(control.style.resize, 'vertical');
    });
    test('Inicialmente oculto recalcula al mostrarse y al estrecharse', async () => {
        const host = document.createElement('div'); host.hidden = true; host.style.width = '360px'; fixture.append(host);
        const field = create({ autoResize: true, minRows: 1, maxRows: 100, value: 'Texto '.repeat(80) }, host);
        host.hidden = false; await frames();
        const wide = field.control.getBoundingClientRect().height; assert.isAbove(wide, 0);
        host.style.width = '160px'; await frames(); assert.isAbove(field.control.getBoundingClientRect().height, wide);
    });
    test('Modal: se adapta al abrirse y conserva valor al volver a abrir', async () => {
        const host = document.createElement('div');
        const modal = new Modal({ title: 'Notas', animated: false }); components.push(modal); modal.setContent(host);
        const field = create({ autoResize: true, minRows: 2, maxRows: 6, value: 'Línea\n'.repeat(10) }, host);
        modal.open(); await frames(); assert.isAbove(field.control.getBoundingClientRect().height, 0);
        assert.equal(field.control.style.overflowY, 'auto'); field.focus(); assert.isTrue(modal.element.contains(document.activeElement));
        modal.close(); modal.open(); await frames(); assert.equal(field.getValue(), 'Línea\n'.repeat(10));
    });
    test('Form reset actualiza valor, contador y error tras el reset nativo', async () => {
        const form = document.createElement('form'), host = document.createElement('div'); form.append(host); fixture.append(form);
        const field = create({ value: 'Inicial', showCounter: true }, host); field.setValue('Cambio'); field.setError('Error');
        form.reset(); await pause(); assert.equal(field.getValue(), 'Inicial'); assert.equal(field.counter.textContent, '7 caracteres'); assert.equal(field.error.textContent, '');
    });
    test('Mover entre formularios enlaza reset al nuevo formulario', async () => {
        const a = document.createElement('form'), b = document.createElement('form'), host = document.createElement('div');
        a.append(host); fixture.append(a, b); const field = create({ value: 'Inicial', showCounter: true }, host);
        b.append(host); field.setValue('Nuevo'); b.reset(); await pause(); assert.equal(field.getValue(), 'Inicial');
        field.setValue('Actual'); a.reset(); await pause(); assert.equal(field.getValue(), 'Actual');
    });
    test('Lectura directa y refresh permiten actualizar valor por APIs DOM externas', () => {
        const field = create({ showCounter: true }); field.control.value = 'Externo'; assert.equal(field.getValue(), 'Externo');
        field.refresh(); assert.equal(field.counter.textContent, '7 caracteres');
    });
    test('Múltiples instancias, identificadores únicos y ancho disponible', () => {
        const first = create({ label: 'Uno', helperText: 'Ayuda', showCounter: true, maxLength: 100 }); const second = create({ label: 'Dos' });
        assert.notEqual(first.control.id, second.control.id); assert.equal(first.label.htmlFor, first.control.id);
        first.target.style.width = '200px'; first.refresh(); assert.isAtMost(first.root.scrollWidth, first.root.clientWidth + 1);
        assert.isAtMost(first.control.getBoundingClientRect().width, 200); assert.equal(second.getValue(), '');
        assert.equal(first.counter.getAttribute('aria-live'), null);
    });
    test('Setters previos al render y destrucción idempotente sin listeners ni observadores activos', async () => {
        const host = document.createElement('div'); fixture.append(host); const input = sinon.spy();
        const field = new TextArea(host, { value: 'Original', onInput: input, autoResize: true }); fields.push(field);
        field.setValue('Antes').setDisabled(true).setReadOnly(true).setHelperText('Ayuda').render();
        assert.equal(field.getValue(), 'Antes'); assert.isTrue(field.control.disabled); assert.isTrue(field.control.readOnly);
        const control = field.control, disconnect = sinon.spy(field.observer, 'disconnect');
        field.destroy(); field.destroy(); await frames();
        assert.isTrue(disconnect.called); assert.notExists(host.querySelector('galeno-textarea'));
        control.dispatchEvent(new Event('input')); assert.isFalse(input.called); assert.isNull(field.observer);
    });
    test('Opciones inválidas no modifican el textarea original', () => {
        const control = document.createElement('textarea'); fixture.append(control); control.name = 'Original';
        for (const options of [{ rows: 0 }, { minRows: 4, maxRows: 2 }, { minLength: 5, maxLength: 2 },
            { maxLength: -1 }, { maxLength: 2147483648 }, { rows: 4294967296 },
            { value: 123 }, { disabled: 'true' }, { validator: 'fn' }]) {
            assert.throws(() => new TextArea(control, options), TypeError); assert.equal(control.name, 'Original');
        }
        assert.throws(() => new TextArea('#missing'), TypeError);
    });
    test('Sin peticiones HTTP ni almacenamiento persistente', () => {
        const fetch = sinon.stub(window, 'fetch').throws(new Error('Sin conexión'));
        const storage = sinon.spy(Storage.prototype, 'setItem');
        const field = create({ required: true, autoResize: true }); field.setValue('Texto').validate();
        assert.isFalse(fetch.called); assert.isFalse(storage.called);
    });
    test('Sin ResizeObserver recalcula tras resize y deja de observar al desconectar', async () => {
        sinon.stub(window, 'ResizeObserver').value(undefined);
        const host = document.createElement('div');
        host.style.width = '400px';
        fixture.append(host);
        const field = create({ autoResize: true, minRows: 1, maxRows: 40, value: 'Texto '.repeat(90) }, host);
        const altura = field.control.getBoundingClientRect().height;
        host.style.width = '160px';
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        await frames();
        assert.isAbove(field.control.getBoundingClientRect().height, altura);

        host.remove();
        const resize = sinon.spy(field, 'resize');
        window.dispatchEvent(new Event('resize'));
        await frames();
        sinon.assert.notCalled(resize);
    });

    test('Cancelar reset conserva el valor y el mensaje accesible original', async () => {
        const form = fixture.appendChild(document.createElement('form'));
        const field = create({ value: 'Inicio', showCounter: true }, form);
        form.addEventListener('reset', evento => evento.preventDefault(), { once: true });
        field.setValue('Borrador').setError('Revisa el texto');
        form.reset();
        await pause();
        assert.equal(field.getValue(), 'Borrador');
        assert.equal(field.error.textContent, 'Revisa el texto');
        assert.include(field.control.getAttribute('aria-describedby'), field.error.id);
        assert.equal(field.counter.textContent, '8 caracteres');
    });

    test('Tras destruir el control los setters conservan el último valor sin remontarlo', () => {
        const field = create({ value: 'Último valor' });
        const host = field.target;
        field.destroy();
        field.setValue('Otro').setDisabled(true).setReadOnly(true).setHelperText('Otra ayuda').setError('Error');
        field.clearError().focus().blur().render();
        assert.equal(field.getValue(), 'Último valor');
        assert.isFalse(field.validate().valid);
        assert.isEmpty(host.children);
    });

});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
