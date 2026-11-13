import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Wizard } from '../../../src/js/boundary/componentes/navigation/wizard/index.js';
import { Modal } from '../../../src/js/boundary/componentes/overlays/index.js';

mocha.setup('tdd');
suite('Wizard', () => {
    let fixture, instances, modals;
    const steps = () => [1, 2, 3].map(number => {
        const content = document.createElement('div'); content.textContent = `Contenido ${number}`;
        return { id: `step-${number}`, title: `Paso ${number}`, description: `Descripción ${number}`, content };
    });
    function create(options = {}) {
        const host = document.createElement('div'); fixture.append(host);
        const wizard = new Wizard(host, { steps: steps(), ...options }); instances.push(wizard);
        return wizard.render();
    }
    setup(() => { fixture = document.querySelector('#fixtures'); instances = []; modals = []; });
    teardown(() => { instances.forEach(wizard => wizard.destroy()); modals.forEach(modal => modal.destroy()); fixture.replaceChildren(); sinon.restore(); });
    test('Paso único valida, finaliza una vez y bloquea nuevas finalizaciones', async () => {
        let count = 0;
        const wizard = create({ steps: steps().slice(0, 1), onComplete: () => { count++; } });
        assert.equal(wizard.root.localName, 'galeno-wizard'); assert.equal(wizard.state, 'initial');
        assert.isTrue(wizard.back.disabled); assert.equal(wizard.forward.textContent, 'Finalizar');
        assert.isTrue(await wizard.next()); assert.equal(wizard.state, 'completed');
        assert.isFalse(await wizard.next()); assert.equal(count, 1); assert.equal(wizard.progress.value, 1);
    });
    test('Avance, regreso y callbacks con metadatos seguros', async () => {
        const changes = [];
        const wizard = create({ onStepChange: (current, previous) => changes.push([current.id, previous.id]) });
        assert.isTrue(await wizard.next()); assert.equal(wizard.getCurrentStep().id, 'step-2');
        assert.isTrue(wizard.getSteps()[0].completed);
        assert.isTrue(await wizard.previous()); assert.equal(wizard.getCurrentStep().id, 'step-1');
        assert.isFalse(await wizard.previous()); assert.deepEqual(changes, [['step-2', 'step-1'], ['step-1', 'step-2']]);
        const metadata = wizard.getSteps(); metadata[0].title = 'Mutado'; assert.equal(wizard.getSteps()[0].title, 'Paso 1');
    });
    test('Render repetido no duplica DOM, formularios ni listeners', async () => {
        const wizard = create(); const root = wizard.root, panel = wizard.steps[0].panel;
        wizard.render().render(); assert.strictEqual(wizard.root, root); assert.strictEqual(wizard.steps[0].panel, panel);
        assert.lengthOf(wizard.container.querySelectorAll('galeno-wizard'), 1);
        wizard.forward.click(); await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(wizard.getCurrentStep().id, 'step-2');
    });
    test('False impide avanzar y no modifica otros pasos', async () => {
        const list = steps(); list[0].validate = () => false;
        const wizard = create({ steps: list }); const before = wizard.getSteps().slice(1);
        assert.isFalse(await wizard.next()); assert.equal(wizard.getCurrentStep().id, 'step-1');
        assert.equal(wizard.state, 'validation-error'); assert.deepEqual(wizard.getSteps().slice(1), before);
        assert.equal(wizard.error.getAttribute('role'), 'alert'); assert.include(wizard.error.textContent, 'requeridos');
    });
    test('Resultado estructurado y texto seguro; corregir permite reintentar', async () => {
        let valid = false; const list = steps(); list[0].validate = () => ({ valid, message: '<img src=x>' });
        const wizard = create({ steps: list }); assert.isFalse(await wizard.next());
        assert.equal(wizard.error.textContent, '<img src=x>'); assert.notExists(wizard.root.querySelector('img'));
        valid = true; assert.isTrue(await wizard.next()); assert.equal(wizard.error.textContent, '');
    });
    test('Validación asíncrona bloquea navegación y doble clic', async () => {
        let resolve, count = 0; const list = steps();
        list[0].validate = () => { count++; return new Promise(done => { resolve = done; }); };
        const wizard = create({ steps: list }); const pending = wizard.next();
        assert.equal(wizard.state, 'validating'); assert.equal(wizard.root.getAttribute('aria-busy'), 'true');
        assert.isTrue(wizard.forward.disabled); assert.isFalse(wizard.loading.hidden);
        assert.isFalse(await wizard.next()); assert.isFalse(await wizard.previous()); assert.isFalse(await wizard.goToStep('step-3'));
        assert.equal(count, 1); resolve(true); assert.isTrue(await pending); assert.isFalse(wizard.forward.disabled);
    });
    test('Excepciones y resultados inválidos nunca avanzan ni filtran detalles', async () => {
        for (const validate of [() => { throw new Error('secreto servidor'); }, async () => { throw new Error('secreto'); }, () => 'true', () => undefined]) {
            const list = steps(); list[0].validate = validate;
            const wizard = create({ steps: list }); assert.isFalse(await wizard.next());
            assert.equal(wizard.getCurrentStep().id, 'step-1'); assert.notInclude(wizard.error.textContent, 'secreto');
        }
    });
    test('Formulario conserva valores y listeners al navegar y al destruir', async () => {
        const form = document.createElement('form'), input = document.createElement('input');
        input.value = 'Borrador'; form.append(input); fixture.append(form);
        let events = 0; input.addEventListener('input', () => events++);
        const list = steps(); list[0].content = form;
        const wizard = create({ steps: list }); const parent = form.parentElement;
        await wizard.next(); assert.strictEqual(form.parentElement, parent); assert.isTrue(parent.hidden);
        await wizard.previous(); input.value = 'Editado'; input.dispatchEvent(new Event('input', { bubbles: true }));
        wizard.destroy(); assert.strictEqual(form.parentElement, fixture); assert.equal(input.value, 'Editado'); assert.equal(events, 1);
    });
    test('Estado compartido se clona, combina por claves y no cambia controles DOM', () => {
        const wizard = create({ data: { original: true } }); const data = { personal: { name: 'Ana' } };
        wizard.setData(data); data.personal.name = 'Mutado';
        const returned = wizard.getData(); returned.personal.name = 'Otro';
        assert.deepEqual(wizard.getData(), { original: true, personal: { name: 'Ana' } });
        assert.include(wizard.steps[0].panel.textContent, 'Contenido 1');
        assert.throws(() => wizard.setData([]), TypeError); assert.throws(() => wizard.setData({ fn() {} }), TypeError);
    });
    test('Lineal no salta pendientes, pero valida al pulsar el indicador siguiente', async () => {
        const wizard = create(); assert.isFalse(await wizard.goToStep('step-3'));
        assert.isTrue(await wizard.goToStep('step-2')); assert.isTrue(await wizard.goToStep('step-3'));
        assert.isTrue(await wizard.goToStep('step-1'));
        assert.isTrue(await wizard.goToStep('step-3')); assert.equal(wizard.getCurrentStep().id, 'step-3');
    });
    test('No lineal valida los obligatorios intermedios antes de un salto', async () => {
        let valid = false, calls = 0; const list = steps(); list[1].validate = () => { calls++; return valid; };
        const wizard = create({ steps: list, linear: false });
        assert.isFalse(await wizard.goToStep('step-3')); assert.equal(wizard.getCurrentStep().id, 'step-1');
        assert.equal(wizard.getSteps()[1].status, 'pending'); assert.include(wizard.error.textContent, 'Paso 2');
        valid = true; assert.isTrue(await wizard.goToStep('step-3')); assert.equal(calls, 2);
        assert.isTrue(wizard.getSteps()[1].completed);
    });
    test('Pasos opcionales omitidos no bloquean finalizar; deshabilitados no se visitan', async () => {
        let calls = 0; const list = steps(); list[1].optional = true; list[1].validate = () => { calls++; return false; };
        const wizard = create({ steps: list, linear: false });
        await wizard.goToStep('step-3'); assert.isTrue(await wizard.next()); assert.equal(calls, 0);
        const disabled = steps(); disabled[1].enabled = false;
        const second = create({ steps: disabled }); assert.isFalse(await second.goToStep('step-2'));
        await second.next(); assert.equal(second.getCurrentStep().id, 'step-3');
    });
    test('allowBackNavigation=false bloquea botones y navegación directa hacia atrás', async () => {
        const wizard = create({ allowBackNavigation: false }); await wizard.next();
        assert.isTrue(wizard.back.disabled); assert.isFalse(await wizard.previous()); assert.isFalse(await wizard.goToStep('step-1'));
        assert.isFalse(await wizard.goToStep('no-existe')); assert.isFalse(await wizard.goToStep('step-2'));
    });
    test('Finalizar vuelve a validar los anteriores, aunque se hubieran completado', async () => {
        let valid = true, completed = 0; const list = steps(); list[0].validate = () => valid;
        const wizard = create({ steps: list, onComplete: () => completed++ });
        await wizard.next(); await wizard.next(); valid = false;
        assert.isFalse(await wizard.next()); assert.equal(completed, 0);
        assert.equal(wizard.getCurrentStep().id, 'step-1'); assert.equal(wizard.state, 'validation-error');
    });
    test('Finalización asíncrona recibe copia de datos y bloquea llamadas duplicadas', async () => {
        let resolve, calls = 0; const wizard = create({ steps: steps().slice(0, 1), data: { name: 'Ana' },
            onComplete: data => { calls++; data.name = 'Mutación externa'; return new Promise(done => { resolve = done; }); } });
        const pending = wizard.next(); await Promise.resolve(); await Promise.resolve();
        assert.equal(wizard.state, 'completing'); assert.isFalse(await wizard.next()); assert.isFalse(wizard.reset());
        resolve(); assert.isTrue(await pending); assert.equal(calls, 1); assert.equal(wizard.getData().name, 'Ana');
    });
    test('Error al finalizar conserva datos, distingue el error y permite reintentar', async () => {
        let fail = true; const wizard = create({ steps: steps().slice(0, 1), data: { draft: 'Conservado' },
            onComplete: async () => { if (fail) throw new Error('traza privada'); } });
        assert.isFalse(await wizard.next()); assert.equal(wizard.state, 'completion-error');
        assert.equal(wizard.error.dataset.kind, 'completion'); assert.notInclude(wizard.error.textContent, 'traza privada');
        assert.equal(wizard.getData().draft, 'Conservado'); assert.isFalse(wizard.getCurrentStep().completed);
        fail = false; assert.isTrue(await wizard.next());
    });
    test('Corregir validación y fallar al guardar no conserva una marca de validación inválida', async () => {
        let valid = false; const list = steps().slice(0, 1); list[0].validate = () => valid;
        const wizard = create({ steps: list, onComplete: () => { throw new Error('Fallo de la operación'); } });
        assert.isFalse(await wizard.next()); assert.equal(wizard.getCurrentStep().status, 'error');
        valid = true; assert.isFalse(await wizard.next());
        assert.equal(wizard.state, 'completion-error'); assert.equal(wizard.getCurrentStep().status, 'current');
    });
    test('Un false de onComplete tampoco confirma éxito', async () => {
        const wizard = create({ steps: steps().slice(0, 1), onComplete: () => false });
        assert.isFalse(await wizard.next()); assert.equal(wizard.state, 'completion-error');
    });
    test('reset reinicia pasos y datos iniciales sin borrar los controles', async () => {
        const form = document.createElement('form'), input = document.createElement('input'); input.value = 'Editado'; form.append(input);
        const list = steps(); list[0].content = form;
        const changes = [];
        const wizard = create({ steps: list, data: { initial: 1 }, onStepChange: step => changes.push(step.id) });
        wizard.setData({ other: 2 }); await wizard.next();
        assert.isTrue(wizard.reset()); assert.equal(wizard.state, 'initial'); assert.equal(wizard.getCurrentStep().id, 'step-1');
        assert.deepEqual(wizard.getData(), { initial: 1 }); assert.equal(input.value, 'Editado');
        assert.isTrue(wizard.getSteps().every(step => !step.completed));
        assert.deepEqual(changes, ['step-2', 'step-1']);
    });
    test('Loading externo no puede desbloquear una validación interna', async () => {
        let resolve; const list = steps(); list[0].validate = () => new Promise(done => { resolve = done; });
        const wizard = create({ steps: list }); wizard.setLoading(true); assert.isFalse(await wizard.next());
        wizard.setLoading(false); const pending = wizard.next(); wizard.setLoading(false);
        assert.isTrue(wizard.forward.disabled); resolve(true); await pending; assert.isFalse(wizard.forward.disabled);
    });
    test('Edición durante validación invalida el resultado asíncrono', async () => {
        let resolve; const list = steps(), input = document.createElement('input'); list[0].content.append(input);
        list[0].validate = () => new Promise(done => { resolve = done; });
        const wizard = create({ steps: list }); const pending = wizard.next();
        input.value = 'Cambio'; input.dispatchEvent(new Event('input', { bubbles: true })); resolve(true);
        assert.isFalse(await pending); assert.include(wizard.error.textContent, 'cambiaron'); assert.equal(wizard.getCurrentStep().id, 'step-1');
    });
    test('Datos compartidos cambiados mientras se valida requieren una nueva revisión', async () => {
        let resolve; const list = steps(); list[0].validate = () => new Promise(done => { resolve = done; });
        const wizard = create({ steps: list, data: { draft: 'Inicial' } }); const pending = wizard.next();
        wizard.setData({ draft: 'Nuevo' }); resolve(true);
        assert.isFalse(await pending); assert.equal(wizard.getCurrentStep().id, 'step-1');
        assert.equal(wizard.getData().draft, 'Nuevo'); assert.equal(wizard.state, 'validation-error');
    });
    test('Destruir mientras valida ignora el resultado tardío y restaura nodos', async () => {
        let resolve; const list = steps(); fixture.append(list[0].content);
        list[0].validate = () => new Promise(done => { resolve = done; });
        const node = list[0].content, wizard = create({ steps: list }); const pending = wizard.next();
        wizard.destroy(); wizard.destroy(); resolve(true); assert.isFalse(await pending);
        assert.strictEqual(node.parentElement, fixture); assert.isFalse(await wizard.next());
        assert.notExists(fixture.querySelector('galeno-wizard')); assert.strictEqual(wizard.render(), wizard);
    });
    test('Destruir durante finalización no permite cambios posteriores del componente', async () => {
        let resolve; const wizard = create({ steps: steps().slice(0, 1), onComplete: () => new Promise(done => { resolve = done; }) });
        const pending = wizard.next(); await Promise.resolve(); await Promise.resolve();
        wizard.destroy(); resolve(); assert.isFalse(await pending); assert.isNull(wizard.root);
    });
    test('Fragmentos y contenido dinámico se conservan y restauran', async () => {
        const fragment = document.createDocumentFragment(), content = document.createElement('p'); fragment.append(content);
        const list = steps(); list[0].content = fragment; const wizard = create({ steps: list });
        content.textContent = 'Dinámico <b>seguro</b>'; assert.include(wizard.root.textContent, 'Dinámico <b>seguro</b>');
        assert.notExists(wizard.root.querySelector('b')); await wizard.next(); await wizard.previous();
        assert.include(wizard.steps[0].panel.textContent, 'Dinámico'); wizard.destroy(); assert.strictEqual(content.parentNode, fragment);
    });
    test('Wizard dentro de Modal conserva el foco en el diálogo', async () => {
        const wizard = create(); const modal = new Modal({ title: 'Formulario', animated: false }); modals.push(modal);
        modal.setContent(wizard.container).open(); await wizard.next();
        assert.isTrue(modal.element.contains(document.activeElement));
        assert.strictEqual(document.activeElement, wizard.steps[1].heading);
        modal.close(); modal.open(); assert.equal(wizard.getCurrentStep().id, 'step-2');
    });
    test('Instancias independientes, ids únicos y accesibilidad del indicador', async () => {
        const first = create(), second = create(); await first.next();
        assert.equal(second.getCurrentStep().id, 'step-1'); assert.notEqual(first.steps[0].panel.id, second.steps[0].panel.id);
        assert.equal(first.steps[1].button.getAttribute('aria-current'), 'step');
        assert.equal(first.steps[1].button.getAttribute('aria-controls'), first.steps[1].panel.id);
        assert.equal(first.progress.getAttribute('aria-label'), 'Pasos completados');
        assert.equal(first.steps[0].number.textContent, '✓');
    });
    test('Form submit avanza sin solicitud nativa y respeta handlers externos', async () => {
        const form = document.createElement('form'); const list = steps(); list[0].content = form;
        const wizard = create({ steps: list }); const event = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(event); assert.isTrue(event.defaultPrevented); await Promise.resolve(); await Promise.resolve();
        assert.equal(wizard.getCurrentStep().id, 'step-2');
        await wizard.previous(); form.addEventListener('submit', event => event.preventDefault());
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve(); assert.equal(wizard.getCurrentStep().id, 'step-1');
    });
    test('Textos configurables, progreso y numeración opcionales, ancho estrecho', () => {
        const wizard = create({ previousText: 'Volver', nextText: 'Continuar', showProgress: false, showStepNumbers: false });
        wizard.container.style.width = '240px'; wizard.render();
        assert.equal(wizard.back.textContent, 'Volver'); assert.equal(wizard.forward.textContent, 'Continuar');
        assert.isTrue(wizard.progress.hidden); assert.equal(wizard.steps[0].number.textContent, '•');
        assert.isAtMost(wizard.root.getBoundingClientRect().width, 240);
        assert.isAtMost(wizard.root.scrollWidth, wizard.root.clientWidth + 1);
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            wizard.setLoading(true); assert.equal(getComputedStyle(wizard.loading, '::before').animationName, 'none');
        }
    });
    test('Configuraciones inválidas y contenido compartido se rechazan antes de mover nodos', () => {
        const host = document.createElement('div'); fixture.append(host);
        assert.throws(() => new Wizard('#missing', { steps: steps() }), TypeError);
        for (const options of [{ steps: [] }, { steps: steps().map(step => ({ ...step, enabled: false })) },
            { steps: steps(), linear: 1 }, { steps: [{ id: 'one', title: 'Uno', content: '<b>No DOM</b>' }] }]) {
            assert.throws(() => new Wizard(host, options), TypeError);
        }
        const list = steps(); list[1].content = list[0].content;
        assert.throws(() => new Wizard(host, { steps: list }), TypeError);
    });
    test('Sin solicitudes HTTP ni persistencia automática', async () => {
        const fetch = sinon.stub(window, 'fetch').throws(new Error('offline'));
        const storage = sinon.spy(Storage.prototype, 'setItem');
        const wizard = create({ steps: steps().slice(0, 1) }); await wizard.next();
        assert.isFalse(fetch.called); assert.isFalse(storage.called);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
