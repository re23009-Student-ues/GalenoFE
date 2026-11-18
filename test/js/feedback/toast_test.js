import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Toast } from '../../../src/js/boundary/componentes/feedback/index.js';

mocha.setup('tdd');

suite('Toast', () => {
    let sandbox, reloj, ancla;
    setup(() => {
        sandbox = sinon.createSandbox();
        reloj = sandbox.useFakeTimers();
        sandbox.stub(window, 'matchMedia').returns({ matches: true });
    });
    teardown(() => {
        Toast.dismissAll();
        ancla?.remove();
        sandbox.restore();
    });

    test('Anuncia errores como texto literal y elimina la notificación al vencer', () => {
        const id = Toast.error('<img src=x>');
        reloj.tick(1);
        const slot = document.getElementById(id);
        assert.equal(slot.querySelector('[role=alert]').textContent, '<img src=x>');
        assert.notExists(slot.querySelector('img'));
        reloj.tick(3999);
        assert.notExists(document.getElementById(id));
    });

    test('Mantiene cinco visibles y atiende la cola en orden', () => {
        const ids = Array.from({ length: 7 }, (_, indice) => Toast.info(String(indice)));
        assert.lengthOf(document.querySelectorAll('.toast-slot'), 5);
        assert.notExists(document.getElementById(ids[5]));
        assert.isTrue(Toast.dismiss(ids[0]));
        assert.exists(document.getElementById(ids[5]));
        assert.notExists(document.getElementById(ids[6]));
        Toast.dismissAll();
        assert.lengthOf(document.querySelectorAll('.toast-slot'), 0);
        assert.equal(reloj.countTimers(), 0);
    });

    test('Pausa el tiempo bajo el puntero y recupera el tiempo restante al salir', () => {
        const id = Toast.info('Aviso', { duration: 1000 });
        const slot = document.getElementById(id);
        reloj.tick(400);
        slot.dispatchEvent(new MouseEvent('mouseenter'));
        reloj.tick(2000);
        assert.isTrue(slot.isConnected);
        slot.dispatchEvent(new MouseEvent('mouseleave'));
        reloj.tick(599);
        assert.isTrue(slot.isConnected);
        reloj.tick(1);
        assert.isFalse(slot.isConnected);
    });

    test('Acción anclada se ejecuta una sola vez y retira su contenedor', () => {
        ancla = document.body.appendChild(document.createElement('div'));
        const run = sinon.spy();
        const id = Toast.info('Cambios pendientes', { anchor: ancla, action: { label: 'Revisar', run } });
        const contenedor = ancla.nextElementSibling;
        const accion = contenedor.querySelector('.toast__action');
        assert.exists(contenedor.querySelector('#' + id));
        accion.click();
        accion.click();
        sinon.assert.calledOnce(run);
        assert.isFalse(contenedor.isConnected);
    });
    test('Una notificación retirada de la cola no aparece cuando se libera un espacio', () => {
        const ids = Array.from({ length: 7 }, (_, i) => Toast.info(String(i)));
        assert.isTrue(Toast.dismiss(ids[5]));
        assert.isFalse(Toast.dismiss(ids[5]));
        assert.isTrue(Toast.dismiss(ids[0]));
        assert.notExists(document.getElementById(ids[5]));
        assert.exists(document.getElementById(ids[6]));
        assert.lengthOf(document.querySelectorAll('.toast-slot'), 5);
    });

    test('La animación ignora transiciones ajenas y el cierre tiene respaldo por tiempo', () => {
        window.matchMedia.returns({ matches: false });
        const id = Toast.info('Animado');
        const slot = document.getElementById(id);
        slot.querySelector('.toast__close').click();
        assert.isFalse(Toast.dismiss(id));
        slot.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
        assert.isTrue(slot.isConnected);
        reloj.tick(249);
        assert.isTrue(slot.isConnected);
        reloj.tick(1);
        assert.isFalse(slot.isConnected);

        const otro = document.getElementById(Toast.info('Segundo'));
        otro.querySelector('.toast__close').click();
        otro.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'grid-template-rows' }));
        assert.isFalse(otro.isConnected);
        assert.equal(reloj.countTimers(), 0);
    });

    test('El foco mantiene disponible una acción aunque el puntero salga', () => {
        const id = Toast.info('Acción pendiente', { duration: 1000, action: { label: 'Abrir', run() {} } });
        const slot = document.getElementById(id);
        const accion = slot.querySelector('.toast__action');
        const cerrar = slot.querySelector('.toast__close');
        reloj.tick(300);
        slot.dispatchEvent(new MouseEvent('mouseenter'));
        accion.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        accion.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: cerrar }));
        slot.dispatchEvent(new MouseEvent('mouseleave'));
        reloj.tick(2000);
        assert.isTrue(slot.isConnected);
        cerrar.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        reloj.tick(700);
        assert.isFalse(slot.isConnected);
    });

});

mocha.run();
