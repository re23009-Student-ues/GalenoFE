import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Modal, ConfirmDialog } from '../../../src/js/boundary/componentes/overlays/index.js';

mocha.setup('tdd');
const wait = () => new Promise(resolve => setTimeout(resolve, 20));
const top = () => [...document.querySelectorAll('.confirm-dialog[open]')].at(-1);
const confirm = () => top().querySelector('.confirm-dialog__confirm').click();
const cancel = () => top().querySelector('.confirm-dialog__cancel').click();
function backdrop(element) {
    element.dispatchEvent(new PointerEvent('pointerdown', { clientX: -1, clientY: -1 }));
    element.dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1 }));
}
suite('Modal y ConfirmDialog nativos', () => {
    let modals, fixture;
    const make = options => { const modal = new Modal({ animated: false, ...options }); modals.push(modal); return modal; };
    setup(() => { modals = []; fixture = document.querySelector('#fixtures'); });
    teardown(async () => {
        ConfirmDialog.dismissAll(); modals.forEach(modal => modal.destroy());
        await wait(); fixture.replaceChildren(); sinon.restore();
        assert.lengthOf(document.querySelectorAll('.modal'), 0);
    });
    test('Abrir/cerrar idempotente, callbacks una vez y título accesible', async () => {
        let opens = 0, closes = 0;
        const modal = make({ title: 'Detalles', onOpen: () => opens++, onClose: () => closes++ });
        modal.open().open(); assert.isTrue(modal.isOpen()); assert.equal(opens, 1);
        assert.equal(modal.element.getAttribute('aria-labelledby'), modal.title.id);
        modal.close().close(); await wait(); assert.isFalse(modal.isOpen()); assert.equal(closes, 1);
    });
    test('Texto seguro, título dinámico y acciones opcionales', () => {
        const modal = make({ title: 'Inicial' });
        modal.setTitle('<b>Título</b>').setContent('<img src=x>').open();
        assert.equal(modal.title.textContent, '<b>Título</b>');
        assert.equal(modal.body.textContent, '<img src=x>'); assert.notExists(modal.element.querySelector('img, b'));
        assert.isTrue(modal.footer.hidden);
    });
    test('Formulario se conserva al cerrar y se restaura al destruir, con estado y listeners', () => {
        const form = document.createElement('form'), input = document.createElement('input');
        let changes = 0; input.addEventListener('input', () => changes++); input.value = 'Borrador';
        form.append(input); fixture.append(form);
        const modal = make().setContent(form).open(); modal.close();
        assert.strictEqual(form.parentNode, modal.body);
        modal.open(); input.value = 'Editado'; input.dispatchEvent(new Event('input')); modal.destroy();
        assert.strictEqual(form.parentNode, fixture); assert.equal(input.value, 'Editado'); assert.equal(changes, 1);
    });
    test('Reemplazo restaura nodos y admite fragmentos sin perder su origen', () => {
        const content = document.createElement('div'); fixture.append(content);
        const modal = make().setContent(content);
        modal.setContent('Otro'); assert.strictEqual(content.parentNode, fixture);
        const fragment = document.createDocumentFragment(), a = document.createElement('p'), b = document.createElement('p');
        fragment.append(a, b); modal.setContent(fragment); modal.destroy();
        assert.deepEqual([...fragment.childNodes], [a, b]);
    });
    test('Botón X, Escape y overlay cierran; clic interno no cierra', () => {
        const modal = make().open(); modal.closeButton.click(); assert.isFalse(modal.isOpen());
        modal.open(); modal.element.dispatchEvent(new Event('cancel', { cancelable: true })); assert.isFalse(modal.isOpen());
        modal.open(); modal.body.click(); assert.isTrue(modal.isOpen());
        backdrop(modal.element); assert.isFalse(modal.isOpen());
    });
    test('Políticas de cierre y arrastre desde contenido hacia overlay', () => {
        const modal = make({ closeOnOverlay: false, closeOnEscape: false }).open();
        backdrop(modal.element); modal.element.dispatchEvent(new Event('cancel', { cancelable: true })); assert.isTrue(modal.isOpen());
        const locked = make({ closable: false }).open(); assert.isTrue(locked.closeButton.hidden);
        backdrop(locked.element); locked.element.dispatchEvent(new Event('cancel', { cancelable: true })); assert.isTrue(locked.isOpen());
        locked.close(); modal.close();
        const other = make().open();
        other.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        other.element.dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1 })); assert.isTrue(other.isOpen());
    });
    test('Foco inicial, fondo inerte y restauración al cerrar', () => {
        const opener = document.createElement('button'); fixture.append(opener); opener.focus();
        const input = document.createElement('input'); input.id = 'modal-input';
        const modal = make({ initialFocus: '#modal-input' }).setContent(input).open();
        assert.strictEqual(document.activeElement, input);
        opener.focus(); assert.notStrictEqual(document.activeElement, opener);
        modal.close(); assert.strictEqual(document.activeElement, opener);
    });
    test('Solo el diálogo superior responde a Escape', () => {
        const first = make().open(), second = make().open();
        first.element.dispatchEvent(new Event('cancel', { cancelable: true })); assert.isTrue(first.isOpen());
        second.element.dispatchEvent(new Event('cancel', { cancelable: true })); assert.isFalse(second.isOpen()); assert.isTrue(first.isOpen());
    });
    test('Procesamiento bloquea cierres y restaura botones deshabilitados previamente', () => {
        const modal = make({ actions: [
            { label: 'Deshabilitado', disabled: true, onClick() {} },
            { label: 'Cerrar', onClick: modal => modal.close() }
        ] }).open();
        modal.setBusy(true); modal.close(); backdrop(modal.element);
        modal.element.dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isTrue(modal.isOpen()); assert.isTrue(modal.closeButton.disabled);
        modal.setBusy(false); assert.isTrue(modal.footer.firstElementChild.disabled);
        modal.footer.lastElementChild.click(); assert.isFalse(modal.isOpen());
    });
    test('Formulario method=dialog respeta busy y notifica cierre nativo', async () => {
        const form = document.createElement('form'); form.method = 'dialog';
        const button = document.createElement('button'); button.textContent = 'Cerrar'; form.append(button);
        const modal = make().setContent(form).open(); modal.setBusy(true); button.click(); assert.isTrue(modal.isOpen());
        modal.setBusy(false); button.click(); await wait(); assert.isFalse(modal.isOpen());
    });
    test('Abrir/cerrar rápidamente no deja eventos atrasados ni recursos', async () => {
        let closes = 0; const modal = make({ animated: true, onClose: () => closes++ });
        modal.open().close().open(); await wait(); assert.isTrue(modal.isOpen()); assert.equal(closes, 1);
        modal.destroy(); modal.destroy(); assert.isFalse(modal.isOpen()); modal.open(); assert.isFalse(modal.isOpen());
    });
    test('Tamaños, contenido extenso y viewport sin desbordar', () => {
        for (const size of ['small', 'medium', 'large', 'fullscreen']) {
            const modal = make({ size }).setContent('Contenido extenso '.repeat(1000)).open();
            const rect = modal.element.getBoundingClientRect();
            assert.isAtLeast(rect.left, 0); assert.isAtMost(rect.right, innerWidth + 1);
            assert.isAtMost(rect.height, innerHeight); assert.equal(getComputedStyle(modal.body).overflowY, 'auto');
            modal.close();
        }
    });
    test('Configuración inválida se rechaza antes de montar', async () => {
        assert.throws(() => make({ size: 'enorme' }), TypeError);
        assert.throws(() => make({ title: '' }), TypeError);
        const modal = make(); assert.throws(() => modal.setContent(modal.body), TypeError);
        let error; try { await ConfirmDialog.show({ type: 'otro' }); } catch (e) { error = e; }
        assert.instanceOf(error, TypeError);
    });
    test('Confirmar resuelve true una vez y no ejecuta cancelación', async () => {
        let cancellations = 0; const result = ConfirmDialog.show({ onCancel: () => cancellations++ });
        assert.isTrue(top().contains(document.activeElement));
        assert.isTrue(document.activeElement.classList.contains('confirm-dialog__cancel'));
        confirm(); assert.isTrue(await result); assert.equal(cancellations, 0);
    });
    test('Cancelar resuelve false y ejecuta callback exactamente una vez', async () => {
        let calls = 0; const result = ConfirmDialog.show({ onCancel: () => calls++ });
        cancel(); assert.isFalse(await result); ConfirmDialog.dismissAll(); assert.equal(calls, 1);
    });
    for (const way of ['escape', 'overlay', 'close']) test(`Cierre ${way} resuelve false`, async () => {
        const result = ConfirmDialog.show(); const dialog = top();
        if (way === 'escape') dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        else if (way === 'overlay') backdrop(dialog);
        else dialog.querySelector('.modal__close').click();
        assert.isFalse(await result);
    });
    test('Éxito asíncrono bloquea botones, cierres y doble confirmación', async () => {
        let done, calls = 0;
        const result = ConfirmDialog.show({ onConfirm: () => { calls++; return new Promise(resolve => { done = resolve; }); } });
        const dialog = top(); confirm(); dialog.querySelector('.confirm-dialog__confirm').click();
        assert.equal(calls, 1); assert.equal(dialog.getAttribute('aria-busy'), 'true');
        assert.isTrue([...dialog.querySelectorAll('button')].every(button => button.disabled));
        backdrop(dialog); dialog.dispatchEvent(new Event('cancel', { cancelable: true })); assert.isTrue(dialog.open);
        assert.include(dialog.querySelector('[role=status]').textContent, 'Procesando');
        done(); assert.isTrue(await result);
    });
    test('Error asíncrono seguro: mantiene promesa pendiente y permite reintentar', async () => {
        let calls = 0, settled = false;
        const result = ConfirmDialog.show({ onConfirm: async () => { if (++calls === 1) throw new Error('secreto servidor'); } });
        result.then(() => { settled = true; });
        confirm(); await wait(); assert.isTrue(top().open); assert.isFalse(settled);
        assert.include(top().querySelector('[role=alert]').textContent, 'No fue posible');
        assert.notInclude(top().textContent, 'secreto servidor');
        confirm(); assert.isTrue(await result); assert.equal(calls, 2);
    });
    test('Permite cancelar después de un fallo', async () => {
        const result = ConfirmDialog.show({ onConfirm: async () => { throw new Error('fallo'); } });
        confirm(); await wait(); cancel(); assert.isFalse(await result);
    });
    test('Confirmaciones en cola, sin superposición y orden FIFO', async () => {
        const first = ConfirmDialog.show({ title: 'Primera' }), second = ConfirmDialog.show({ title: 'Segunda' });
        assert.lengthOf(document.querySelectorAll('.confirm-dialog[open]'), 1);
        assert.include(top().textContent, 'Primera'); cancel(); assert.isFalse(await first);
        assert.include(top().textContent, 'Segunda'); confirm(); assert.isTrue(await second);
    });
    test('dismissAll resuelve activa y pendientes sin dejar nodos', async () => {
        const promises = [ConfirmDialog.show(), ConfirmDialog.show(), ConfirmDialog.show()];
        ConfirmDialog.dismissAll(); assert.deepEqual(await Promise.all(promises), [false, false, false]);
    });
    test('Destruir durante onConfirm resuelve false y tolera finalización tardía', async () => {
        let done;
        const dialog = new ConfirmDialog({ onConfirm: () => new Promise(resolve => { done = resolve; }) });
        modals.push(dialog); dialog.open(); dialog.confirm(); dialog.destroy();
        assert.isFalse(await dialog.result); done(); await wait(); assert.isFalse(dialog.isOpen());
    });
    test('Destruir antes de abrir resuelve false una vez y no crea DOM', async () => {
        let calls = 0;
        const dialog = new ConfirmDialog({ onCancel: () => calls++ });
        dialog.destroy(); dialog.destroy(); dialog.open();
        assert.isFalse(await dialog.result); assert.equal(calls, 1); assert.isFalse(dialog.isOpen());
    });
    test('Icono SVG personalizado se clona sin modificar su ubicación', async () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); fixture.append(svg);
        const result = ConfirmDialog.show({ icon: svg });
        assert.strictEqual(svg.parentNode, fixture);
        assert.notStrictEqual(top().querySelector('.confirm-dialog__icon'), svg);
        cancel(); assert.isFalse(await result);
    });
    test('Tipos, colores, SVG local, texto seguro y movimiento reducido', async () => {
        for (const type of ['default', 'danger', 'warning', 'info']) {
            const result = ConfirmDialog.show({ type, title: '<b>Título</b>', message: '<img src=x>', color: '#123456' });
            assert.isTrue(top().classList.contains(`confirm-dialog--${type}`));
            assert.exists(top().querySelector('svg path')); assert.notExists(top().querySelector('img, b'));
            assert.equal(top().style.getPropertyValue('--confirm-accent'), '#123456');
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) assert.equal(getComputedStyle(top()).transitionDuration, '0s');
            cancel(); await result;
        }
    });
    test('Componentes sin peticiones HTTP', async () => {
        const fetch = sinon.stub(window, 'fetch').throws(new Error('offline'));
        const modal = make().setContent('Sin red').open(); modal.close();
        const result = ConfirmDialog.show(); cancel(); await result; assert.isFalse(fetch.called);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
