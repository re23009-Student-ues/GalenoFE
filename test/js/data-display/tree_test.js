import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import Tree from '../../../src/js/boundary/componentes/data-display/Tree.js';
import { createTree, visibleTree } from '../../../src/js/boundary/componentes/data-display/tree_model.js';

mocha.setup('tdd');

suite('Modelo de árbol', () => {
    test('Conserva el orden visible y propaga la deshabilitación del padre', () => {
        const datos = [{ id: 0, disabled: true, children: [{ id: 'hijo' }] }, { id: 'otro' }];
        const { nodes, roots } = createTree(datos);
        assert.deepEqual(visibleTree(roots, new Set()).map(nodo => nodo.id), [0, 'otro']);
        assert.deepEqual(visibleTree(roots, new Set([0])).map(nodo => nodo.id), [0, 'hijo', 'otro']);
        assert.isTrue(nodes.get('hijo').disabled);
        assert.notProperty(datos[0].children[0], 'disabled');
    });

    test('Rechaza identificadores duplicados, ciclos, nodos compartidos e hijos inválidos', () => {
        const ciclo = { id: 'ciclo' };
        ciclo.children = [ciclo];
        const compartido = { id: 'compartido' };
        for (const datos of [
            [{ id: 'a' }, { id: 'a' }], [ciclo],
            [compartido, { id: 'otro', children: [compartido] }],
            [{ id: 1, children: {} }], [{ id: '' }]
        ]) {
            assert.throws(() => createTree(datos), TypeError);
        }
    });
});

suite('Web Component de árbol', () => {
    let arbol, seleccionar;
    const fila = nombre => arbol.querySelector(`[aria-label="${nombre}"][role=treeitem]`);
    const tecla = (elemento, key) => elemento.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    setup(() => {
        seleccionar = sinon.spy();
        arbol = new Tree();
        arbol.configure({
            data: [{ id: 'a', nombre: 'Raíz', children: [
                { id: 'b', nombre: 'Bloqueado', disabled: true },
                { id: 'c', nombre: 'Disponible' }
            ] }],
            renderLabel: nodo => document.createTextNode(nodo.nombre),
            onNodeSelect: seleccionar
        });
        document.querySelector('#fixtures').append(arbol);
    });

    teardown(() => {
        arbol.destroy();
        arbol.remove();
    });

    test('Expande sin seleccionar y el teclado salta las filas deshabilitadas', () => {
        const raiz = fila('Raíz');
        raiz.focus();
        tecla(raiz, 'ArrowRight');
        assert.equal(raiz.getAttribute('aria-expanded'), 'true');
        sinon.assert.notCalled(seleccionar);
        tecla(raiz, 'ArrowRight');
        assert.strictEqual(document.activeElement, fila('Disponible'));
        tecla(fila('Bloqueado'), 'Enter');
        tecla(fila('Disponible'), 'Enter');
        sinon.assert.calledOnceWithExactly(seleccionar, sinon.match({ id: 'c' }));
        assert.equal(fila('Disponible').getAttribute('aria-selected'), 'true');
    });

    test('Contraer recupera el foco y reconectar conserva un solo listener', () => {
        arbol.expandNode('a');
        fila('Disponible').focus();
        arbol.collapseNode('a');
        assert.strictEqual(document.activeElement, fila('Raíz'));
        arbol.remove();
        document.querySelector('#fixtures').append(arbol);
        fila('Raíz').querySelector('.tree__label').click();
        sinon.assert.calledOnce(seleccionar);
    });
    test('Las flechas verticales y Home/End conservan el foco entre filas disponibles', () => {
        arbol.expandNode('a');
        const raiz = fila('Raíz'), disponible = fila('Disponible');
        raiz.focus();
        tecla(raiz, 'ArrowDown');
        assert.strictEqual(document.activeElement, disponible);
        tecla(disponible, 'ArrowDown');
        assert.strictEqual(document.activeElement, disponible);
        tecla(disponible, 'ArrowUp');
        assert.strictEqual(document.activeElement, raiz);
        tecla(raiz, 'End');
        assert.strictEqual(document.activeElement, disponible);
        tecla(disponible, 'Home');
        assert.strictEqual(document.activeElement, raiz);
        tecla(raiz, 'End');
        tecla(disponible, ' ');
        sinon.assert.calledOnce(seleccionar);
        tecla(disponible, 'ArrowLeft');
        assert.strictEqual(document.activeElement, raiz);
        tecla(raiz, 'ArrowLeft');
        assert.isNull(fila('Disponible'));
        assert.equal(raiz.getAttribute('aria-expanded'), 'false');
        assert.isTrue(tecla(raiz, 'Tab'));
    });

    test('Una selección fallida se anuncia y el árbol permite volver a seleccionar', () => {
        seleccionar = sinon.stub();
        seleccionar.onFirstCall().throws(new Error('No se pudo abrir la consulta'));
        arbol.configure({
            data: [{ id: 'a', nombre: 'Raíz' }],
            renderLabel: nodo => document.createTextNode(nodo.nombre),
            onNodeSelect: seleccionar
        });
        const raiz = fila('Raíz');
        tecla(raiz, 'Enter');
        assert.include(arbol.querySelector('[role=status]').textContent, 'No se pudo abrir');
        tecla(raiz, 'Enter');
        sinon.assert.calledTwice(seleccionar);
    });

    test('Una etiqueta inválida conserva el texto accesible y la selección con teclado', () => {
        arbol.configure({
            data: [{ id: 'a', nombre: 'Raíz' }],
            renderLabel: () => 'Texto que no es un nodo DOM',
            onNodeSelect: seleccionar
        });
        const raiz = fila('Raíz');
        assert.exists(raiz);
        assert.include(arbol.querySelector('[role=status]').textContent, 'nodo DOM');
        raiz.focus();
        tecla(raiz, 'Enter');
        sinon.assert.calledOnceWithExactly(seleccionar, sinon.match({ id: 'a' }));
    });

    test('Un clic en una fila deshabilitada no cambia la selección', () => {
        arbol.expandNode('a');
        fila('Disponible').querySelector('.tree__label').click();
        fila('Bloqueado').querySelector('.tree__label').click();
        sinon.assert.calledOnce(seleccionar);
        assert.equal(fila('Disponible').getAttribute('aria-selected'), 'true');
        assert.equal(fila('Bloqueado').getAttribute('aria-selected'), 'false');
        assert.strictEqual(document.activeElement, fila('Disponible'));
    });

});

mocha.run();
