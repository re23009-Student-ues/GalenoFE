import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Wizard } from '../../../src/js/boundary/componentes/navigation/wizard/index.js';

mocha.setup('tdd');

suite('Wizard', () => {
    let host, wizard, steps, actions;

    function presentar({ saveDisabled = false, ocultarSegundo = false } = {}) {
        wizard.updateView({
            steps: steps.map((step, i) => ({
                enabled: i === 0 || !ocultarSegundo,
                completed: i === 0,
                disabled: false,
                detail: 'Responsable',
                status: i === 0 ? 'Completado' : 'Pendiente'
            })),
            previous: { disabled: false, title: 'Reabrir' },
            saveDisabled,
            next: { disabled: false, text: 'Completar' }
        });
    }

    setup(() => {
        host = document.querySelector('#fixtures');
        steps = [
            { id: 'inicio', title: 'Inicio', enabled: true, content: document.createElement('form') },
            { id: 'final', title: 'Final', enabled: true, content: document.createElement('form') }
        ];
        actions = {
            onSelect: sinon.spy(), onPrevious: sinon.spy(), onSave: sinon.spy(),
            onNext: sinon.spy(), onEdit: sinon.spy()
        };
        wizard = new Wizard(host, { steps, ...actions }).render();
    });

    teardown(() => {
        wizard.destroy();
        host.replaceChildren();
    });

    test('Delega acciones al controlador y espera navegación explícita', () => {
        presentar();
        wizard.steps[1].button.click();
        wizard.back.click();
        wizard.save.click();
        wizard.forward.click();
        sinon.assert.calledOnceWithExactly(actions.onSelect, 'final');
        sinon.assert.calledOnce(actions.onPrevious);
        sinon.assert.calledOnce(actions.onSave);
        sinon.assert.calledOnce(actions.onNext);
        assert.equal(wizard.getCurrentStep().id, 'inicio');
        assert.equal(wizard.forward.textContent, 'Completar');
        assert.equal(wizard.progress.value, 1);
    });

    test('Bloquea botones y navegación durante carga y recupera permisos del paso', () => {
        presentar({ saveDisabled: true });
        wizard.setLoading(true);
        wizard.forward.click();
        assert.equal(wizard.root.getAttribute('aria-busy'), 'true');
        assert.isFalse(wizard.goToStep('final'));
        sinon.assert.notCalled(actions.onNext);
        wizard.setLoading(false);
        assert.isTrue(wizard.save.disabled);
        assert.isFalse(wizard.forward.disabled);
        assert.isTrue(wizard.goToStep('final'));
        assert.equal(wizard.steps[1].button.getAttribute('aria-current'), 'step');
    });

    test('Conserva el formulario y su borrador al volver al paso', () => {
        presentar();
        const input = steps[0].content.appendChild(document.createElement('input'));
        input.value = 'Borrador';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        wizard.goToStep('final');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        sinon.assert.calledOnce(actions.onEdit);
        wizard.goToStep('inicio');
        assert.strictEqual(wizard.root.querySelector('input'), input);
        assert.equal(input.value, 'Borrador');
    });

    test('Intercepta el envío del formulario activo y respeta pasos ocultos', () => {
        presentar({ ocultarSegundo: true });
        const envio = new Event('submit', { bubbles: true, cancelable: true });
        steps[0].content.dispatchEvent(envio);
        assert.isTrue(envio.defaultPrevented);
        sinon.assert.calledOnce(actions.onNext);
        assert.isFalse(wizard.goToStep('final'));
        assert.isTrue(wizard.steps[1].item.hidden);
    });

    test('Rechaza pasos duplicados y devuelve el contenido a su origen al desmontar', () => {
        assert.throws(() => new Wizard(host, { steps: [steps[0], steps[0]], ...actions }), TypeError);
        const origen = document.createElement('div');
        const contenido = origen.appendChild(document.createElement('p'));
        wizard.destroy();
        wizard = new Wizard(host, { steps: [{ ...steps[0], content: contenido }], ...actions }).render();
        assert.isTrue(wizard.root.contains(contenido));
        wizard.destroy();
        wizard.destroy();
        assert.strictEqual(contenido.parentElement, origen);
        assert.notExists(host.querySelector('galeno-wizard'));
    });
    test('El carrusel desplaza con teclado y botones sin cambiar el paso actual', () => {
        const sandbox = sinon.createSandbox();
        try {
            sandbox.stub(window, 'matchMedia').returns({ matches: true });
            const { viewport } = wizard;
            sandbox.stub(viewport, 'clientWidth').value(320);
            sandbox.stub(viewport, 'scrollWidth').value(950);
            const desplazar = sandbox.stub(viewport, 'scrollTo').callsFake(({ left }) => { viewport.scrollLeft = left; });
            wizard.updateCarousel(false, false);
            assert.isTrue(wizard.carouselActive);
            assert.equal(viewport.tabIndex, 0);
            const tecla = (target, key, extra = {}) => target.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
            );
            assert.isTrue(tecla(viewport, 'ArrowRight', { ctrlKey: true }));
            assert.isTrue(tecla(wizard.steps[0].button, 'ArrowRight'));
            assert.isTrue(tecla(viewport, 'Tab'));
            sinon.assert.notCalled(desplazar);
            assert.isFalse(tecla(viewport, 'End'));
            sinon.assert.calledWithExactly(desplazar, { left: 950, behavior: 'instant' });
            assert.isFalse(tecla(viewport, 'ArrowLeft'));
            assert.isFalse(tecla(viewport, 'Home'));
            sinon.assert.calledWithExactly(desplazar, { left: 0, behavior: 'instant' });
            assert.isFalse(tecla(viewport, 'ArrowRight'));
            wizard.carouselNext.click();
            assert.equal(desplazar.lastCall.args[0].left, 256);
            assert.equal(wizard.getCurrentStep().id, 'inicio');
            sinon.assert.notCalled(actions.onSelect);
        } finally {
            sandbox.restore();
        }
    });

    test('Sin ResizeObserver, responde a resize hasta que se destruye', () => {
        const sandbox = sinon.createSandbox();
        try {
            sandbox.stub(window, 'ResizeObserver').value(undefined);
            wizard.destroy();
            wizard = new Wizard(host, { steps, ...actions }).render();
            const actualizar = sandbox.spy(wizard, 'scheduleCarousel');
            window.dispatchEvent(new Event('resize'));
            sinon.assert.calledOnceWithExactly(actualizar, true);
            wizard.destroy();
            window.dispatchEvent(new Event('resize'));
            sinon.assert.calledOnce(actualizar);
        } finally {
            sandbox.restore();
        }
    });

    test('Los formularios ocultos y los envíos ya cancelados no disparan Guardar y avanzar', () => {
        presentar();
        const crearEnvio = () => new Event('submit', { bubbles: true, cancelable: true });
        const cancelado = crearEnvio();
        cancelado.preventDefault();
        steps[0].content.dispatchEvent(cancelado);
        const oculto = crearEnvio();
        steps[1].content.dispatchEvent(oculto);
        assert.isFalse(oculto.defaultPrevented);
        sinon.assert.notCalled(actions.onNext);

        wizard.setLoading(true);
        const ocupado = crearEnvio();
        steps[0].content.dispatchEvent(ocupado);
        assert.isTrue(ocupado.defaultPrevented);
        sinon.assert.notCalled(actions.onNext);
        wizard.setLoading(false);
        steps[0].content.dispatchEvent(crearEnvio());
        sinon.assert.calledOnce(actions.onNext);
    });

});

mocha.run();
