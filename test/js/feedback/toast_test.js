import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Toast } from '../../../src/js/boundary/componentes/feedback/index.js';
import DirectToast from '../../../src/js/boundary/componentes/feedback/Toast.js';

mocha.setup('tdd');
suite('Toast', () => {
    let clock;
    const node = id => document.getElementById(id);
    const visible = () => document.querySelectorAll('.toast-slot');
    setup(() => {
        Toast.dismissAll();
        Toast.configure({ type: 'info', title: '', position: 'top-right', duration: 4000,
            maxVisible: 5, closable: true, pauseOnHover: true, showProgress: true, animated: false });
        clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    });
    teardown(() => { Toast.dismissAll(); assert.equal(clock.countTimers(), 0); clock.restore(); sinon.restore(); });
    for (const type of ['success', 'error', 'warning', 'info']) {
        test(`Tipo ${type}, icono local y región accesible`, () => {
            const id = Toast[type]('Mensaje'); clock.tick(0);
            assert.exists(node(id).querySelector(`.toast--${type} svg path`));
            assert.equal(node(id).querySelector('.toast__message').textContent, 'Mensaje');
            assert.equal(node(id).querySelector('.toast__content').getAttribute('role'), type === 'error' ? 'alert' : 'status');
            assert.notExists(node(id).querySelector('.toast__title'));
        });
    }
    test('Título, texto seguro y opciones individuales prioritarias', () => {
        Toast.configure({ title: 'Global', duration: 1 });
        const id = Toast.show({ message: '<img src=x>', title: '<b>Paciente</b>', duration: 0 }); clock.tick(100);
        assert.equal(node(id).querySelector('.toast__title').textContent, '<b>Paciente</b>');
        assert.include(node(id).textContent, '<img src=x>');
        assert.notExists(node(id).querySelector('img, b, .toast__progress'));
    });
    test('Cierre automático y limpieza de temporizadores', () => {
        const id = Toast.success('Guardado', { duration: 100 });
        clock.tick(99); assert.exists(node(id));
        clock.tick(1); assert.notExists(node(id)); assert.equal(clock.countTimers(), 0);
    });
    test('Cierre manual, identificador inexistente y cierre duplicado', () => {
        const id = Toast.info('Mensaje'); node(id).querySelector('button').click();
        assert.notExists(node(id)); assert.isFalse(Toast.dismiss(id)); assert.isFalse(Toast.dismiss('inexistente'));
    });
    test('Persistente sin botón se cierra por id desde otro módulo', () => {
        assert.strictEqual(Toast, DirectToast);
        const id = Toast.info('Sincronizando', { duration: 0, closable: false });
        clock.tick(100000); assert.exists(node(id)); assert.notExists(node(id).querySelector('button'));
        assert.isTrue(DirectToast.dismiss(id)); assert.notExists(node(id));
    });
    test('No realiza solicitudes HTTP durante su ciclo de vida', () => {
        const fetch = sinon.stub(window, 'fetch').throws(new Error('Sin conexión'));
        const id = Toast.success('Disponible sin red', { duration: 100 });
        clock.tick(0); assert.exists(node(id));
        clock.tick(100); assert.notExists(node(id));
        assert.isFalse(fetch.called);
    });
    test('Hover conserva tiempo restante y sincroniza progreso', () => {
        const id = Toast.info('Mensaje', { duration: 1000 }); const slot = node(id);
        clock.tick(400); slot.dispatchEvent(new MouseEvent('mouseenter'));
        const progress = slot.querySelector('.toast__progress');
        assert.equal(progress.style.transform, 'scaleX(0.6)');
        clock.tick(5000); assert.exists(node(id));
        slot.dispatchEvent(new MouseEvent('mouseleave'));
        assert.include(progress.style.transition, '600ms');
        clock.tick(599); assert.exists(node(id)); clock.tick(1); assert.notExists(node(id));
    });
    test('Foco y hover se pausan independientemente, sin robar foco', () => {
        const before = document.activeElement;
        const id = Toast.info('Mensaje', { duration: 100 }); clock.tick(0);
        assert.strictEqual(document.activeElement, before);
        const slot = node(id), button = slot.querySelector('button');
        assert.equal(button.getAttribute('aria-label'), 'Cerrar notificación');
        slot.dispatchEvent(new MouseEvent('mouseenter')); button.focus();
        slot.dispatchEvent(new MouseEvent('mouseleave')); clock.tick(1000); assert.exists(node(id));
        button.blur(); clock.tick(100); assert.notExists(node(id));
    });
    test('Opciones hover y progreso desactivadas', () => {
        const id = Toast.info('Mensaje', { duration: 50, pauseOnHover: false, showProgress: false });
        assert.notExists(node(id).querySelector('.toast__progress'));
        node(id).dispatchEvent(new MouseEvent('mouseenter')); clock.tick(50); assert.notExists(node(id));
    });
    test('Límite global, orden FIFO y temporizadores solo al salir de la cola', () => {
        Toast.configure({ maxVisible: 1 });
        const a = Toast.info('A', { duration: 0 });
        const b = Toast.info('B', { duration: 100 });
        const c = Toast.info('C', { duration: 0 });
        assert.lengthOf(visible(), 1); clock.tick(1000); assert.notExists(node(b));
        Toast.dismiss(a); assert.exists(node(b)); assert.notExists(node(c));
        clock.tick(100); assert.exists(node(c)); assert.lengthOf(visible(), 1);
    });
    test('Cancelar pendientes y dismissAll no monta pendientes', () => {
        Toast.configure({ maxVisible: 1 });
        Toast.info('A'); const b = Toast.info('B'); Toast.info('C');
        assert.isTrue(Toast.dismiss(b)); assert.isFalse(Toast.dismiss(b));
        Toast.dismissAll(); clock.tick(10000); assert.lengthOf(visible(), 0);
        assert.equal(clock.countTimers(), 0);
    });
    test('Configure aumenta capacidad sin duplicar ni alterar notificaciones existentes', () => {
        Toast.configure({ maxVisible: 1 });
        Toast.info('A', { duration: 0 }); Toast.info('B', { duration: 0 });
        Toast.configure({ maxVisible: 2 }); assert.lengthOf(visible(), 2);
        Toast.configure({ maxVisible: 1 }); assert.lengthOf(visible(), 2);
        Toast.info('C'); assert.lengthOf(visible(), 2);
    });
    test('Seis posiciones fijas y contenedores reutilizables', () => {
        Toast.configure({ maxVisible: 6 });
        for (const position of ['top-right', 'top-left', 'top-center', 'bottom-right', 'bottom-left', 'bottom-center']) {
            const id = Toast.info('Mensaje', { position, duration: 0 });
            const host = node(id).parentElement;
            assert.isTrue(host.classList.contains(`toast-container--${position}`));
            assert.equal(getComputedStyle(host).position, 'fixed');
        }
        const hosts = [...document.querySelectorAll('.toast-container')];
        Toast.dismissAll(); Toast.info('Otra');
        assert.deepEqual([...document.querySelectorAll('.toast-container')], hosts);
    });
    test('Valores inválidos se rechazan sin excepciones ni cambios parciales', () => {
        for (const options of [null, [], 'x', { type: 'otro' }, { duration: -1 }, { duration: NaN },
            { duration: Infinity }, { duration: 2147483648 }, { position: 'centro' }, { closable: 1 },
            { message: '' }, { message: '  ' }, { title: null }, { extra: true }, { maxVisible: 2 }]) {
            assert.isNull(Toast.show(options && typeof options === 'object' && !Array.isArray(options) ? { message: 'Mensaje', ...options } : options));
        }
        assert.isFalse(Toast.configure({ duration: 1, maxVisible: 0 }));
        assert.isFalse(Toast.configure({ maxVisible: 1.5 }));
        assert.isNull(Toast.info('Mensaje', null));
        const id = Toast.info('Mensaje'); clock.tick(1); assert.exists(node(id));
    });
    test('Salida animada libera espacio al terminar, con respaldo y sin doble cierre', () => {
        Toast.configure({ animated: true, maxVisible: 1 });
        sinon.stub(window, 'matchMedia').returns({ matches: false });
        const a = Toast.info('A'), b = Toast.info('B'); clock.tick(0);
        Toast.dismiss(a); assert.isFalse(Toast.dismiss(a)); assert.notExists(node(b));
        const event = new Event('transitionend'); Object.defineProperty(event, 'propertyName', { value: 'grid-template-rows' });
        node(a).dispatchEvent(event); assert.notExists(node(a)); assert.exists(node(b));
        Toast.dismiss(b); clock.tick(250); assert.notExists(node(b));
        assert.equal(clock.countTimers(), 0);
    });
    test('Movimiento reducido elimina entrada y salida animadas', () => {
        sinon.stub(window, 'matchMedia').returns({ matches: true });
        const id = Toast.info('Mensaje', { animated: true });
        assert.isTrue(node(id).classList.contains('toast-slot--static'));
        Toast.dismiss(id); assert.notExists(node(id));
    });
    test('Ancho y altura se limitan a la ventana, mensajes largos y apilamiento', () => {
        const a = Toast.info('Texto '.repeat(80), { duration: 0 });
        const b = Toast.info('Segundo', { duration: 0 }); clock.tick(0);
        const host = node(a).parentElement, rect = host.getBoundingClientRect();
        assert.isAtLeast(rect.left, 0); assert.isAtMost(rect.right, window.innerWidth);
        assert.isAtMost(rect.height, window.innerHeight);
        assert.isAtMost(node(a).getBoundingClientRect().bottom, node(b).getBoundingClientRect().top);
        assert.equal(getComputedStyle(host).overflowY, 'auto');
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
