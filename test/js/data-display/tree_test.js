import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { Tree } from '../../../src/js/boundary/componentes/data-display/index.js';
import { createTree, visibleTree } from '../../../src/js/boundary/componentes/data-display/tree_model.js';
mocha.setup('tdd');
const data = () => [{ id: 1, label: 'Proyecto', children: [
    { id: 2, label: 'src', children: [{ id: 3, label: 'main.js' }, { id: 4, label: 'test.js' }] },
    { id: 5, label: 'Bloqueado', disabled: true, children: [{ id: 6, label: 'Protegido' }] }
] }, { id: 7, label: 'Archivo', tag: 'especial' }];
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
suite('Tree', () => {
    let tree;
    setup(() => { tree = new Tree(); tree.configure({ data: data() }); document.querySelector('#fixtures').append(tree); });
    teardown(() => { tree.destroy(); document.querySelector('#fixtures').replaceChildren(); });
    const ids = () => tree.view.map(node => node.id);
    const key = value => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    test('Componente independiente, vacío y expansión multinivel', async () => {
        assert.isNull(tree.querySelector('table')); assert.equal(tree.list.getAttribute('role'), 'tree');
        assert.deepEqual(ids(), [1, 7]); await tree.expandNode(1); await tree.expandNode(2); assert.deepEqual(ids(), [1, 2, 3, 4, 5, 7]);
        tree.collapseNode(1); await tree.expandNode(1); assert.include(ids(), 3);
        tree.collapseAll(); assert.deepEqual(ids(), [1, 7]); await tree.expandAll(); assert.include(ids(), 4); assert.notInclude(ids(), 6);
        tree.setData([]); assert.include(tree.status.textContent, 'No hay nodos');
    });
    test('Campos configurables, expansión inicial y claves tipadas', () => {
        tree.configure({ rowKey: 'code', labelKey: 'name', childrenKey: 'items', iconKey: 'glyph', disabledKey: 'locked', hasChildrenKey: 'remote', expanded: true,
            data: [{ code: 1, name: 'Raíz', items: [{ code: '1', name: 'Hijo', glyph: '★' }] }] });
        assert.deepEqual(ids(), [1, '1']); tree.selectNode('1'); assert.equal(tree.getSelectedNodes()[0].name, 'Hijo');
        assert.include(tree.list.textContent, '★');
    });
    test('Selección simple, múltiple independiente y sin selección', () => {
        tree.selectNode(3).selectNode(7); assert.deepEqual(tree.getSelectedNodes().map(node => node.id), [7]);
        tree.configure({ data: data(), selection: 'multiple', propagateSelection: false }); tree.selectNode(3).selectNode(4);
        assert.deepEqual(tree.getSelectedNodes().map(node => node.id), [3, 4]); assert.isFalse(tree.selected.has(2));
        tree.clearSelection(); assert.lengthOf(tree.getSelectedNodes(), 0);
        tree.configure({ data: data(), selection: 'none' }).selectNode(1); assert.lengthOf(tree.getSelectedNodes(), 0);
    });
    test('Propaga a descendientes, agrega padres y representa indeterminado', async () => {
        tree.configure({ data: data(), selection: 'multiple' }); await tree.expandAll();
        tree.selectNode(3); const src = tree.items.get(2), input = src.querySelector('input');
        assert.isTrue(input.indeterminate); assert.equal(src.getAttribute('aria-checked'), 'mixed');
        tree.selectNode(4); assert.isTrue(tree.selected.has(2)); assert.isTrue(tree.selected.has(1));
        tree.selectNode(2, false); assert.isFalse(tree.selected.has(1));
        tree.selectNode(1); assert.isTrue(tree.selected.has(3)); assert.isFalse(tree.selected.has(5)); assert.isFalse(tree.selected.has(6));
    });
    test('Checkbox no expande y selección conserva elementos DOM y foco', async () => {
        tree.configure({ data: data(), selection: 'multiple' }); const item = tree.items.get(1); item.focus(); item.querySelector('input').click();
        assert.strictEqual(tree.items.get(1), item); assert.deepEqual(ids(), [1, 7]); assert.strictEqual(document.activeElement, item);
        assert.isTrue(tree.selected.has(3));
    });
    test('Deshabilitados bloquean clic, doble clic, teclado y API', async () => {
        const click = sinon.spy(), dbl = sinon.spy(); tree.configure({ data: data(), expanded: true, onNodeClick: click, onNodeDoubleClick: dbl });
        const item = tree.items.get(5); item.click(); item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        tree.selectNode(6); await tree.expandNode(5); assert.equal(click.callCount, 0); assert.equal(dbl.callCount, 0); assert.equal(tree.selected.size, 0);
        assert.equal(item.getAttribute('aria-disabled'), 'true');
    });
    test('Búsqueda jerárquica, campos adicionales, resaltado y restauración', async () => {
        await tree.expandNode(1); tree.setSearch('MAIN'); assert.deepEqual(ids(), [1, 2, 3]); assert.equal(tree.querySelector('mark').textContent, 'main');
        await tree.expandAll(); tree.setSearch(''); assert.deepEqual(ids(), [1, 2, 5, 7]);
        tree.setSearch('ausente'); assert.include(tree.status.textContent, 'No se encontraron');
        tree.configure({ data: data(), searchKeys: ['tag'], highlight: false }).setSearch('especial'); assert.deepEqual(ids(), [7]); assert.isNull(tree.querySelector('mark'));
        tree.configure({ data: data(), searchable: false }).setSearch('main'); assert.deepEqual(ids(), [1, 7]); assert.isNull(tree.search);
    });
    test('API dinámica agrega raíz/hijo, actualiza y elimina sin mutar la entrada', async () => {
        const original = data(); tree.setData(original); tree.addNode(2, { id: 8, label: 'nuevo' }).updateNode(8, { label: 'editado' });
        assert.equal(tree.getNode(8).label, 'editado'); assert.lengthOf(original[0].children[0].children, 2);
        tree.addNode(null, { id: 9, label: 'Raíz nueva' }); assert.isNotNull(tree.getNode(9));
        tree.updateNode(2, { children: [{ id: 10, label: 'reemplazo' }] }); assert.isNull(tree.getNode(3)); assert.isNotNull(tree.getNode(10));
        tree.selectNode(10).removeNode(2); assert.isNull(tree.getNode(10)); assert.lengthOf(tree.getSelectedNodes(), 0);
        const copy = tree.getData(); copy[0].label = 'Otro'; assert.equal(tree.getNode(1).label, 'Proyecto');
    });
    test('Valida cambios de forma atómica y rechaza ciclos o nodos compartidos', () => {
        const onError = sinon.spy(); tree.configure({ data: data(), onError });
        const cycle = { id: 8 }; cycle.children = [cycle]; const shared = { id: 8 };
        for (const bad of [[cycle], [shared, shared], [{ id: 1 }, { id: 1 }], [{ label: 'Sin ID' }], [{ id: 8, children: 'mal' }]]) tree.setData(bad);
        tree.addNode(2, { id: 3 }); tree.updateNode(3, { id: 90 }); tree.addNode('ausente', { id: 9 }); tree.removeNode('ausente');
        assert.equal(tree.nodes.size, 7); assert.isTrue(onError.callCount >= 9);
        assert.throws(() => tree.configure({ selection: 'otra' }), TypeError);
        assert.throws(() => tree.configure({ childrenKey: 'id' }), TypeError);
        assert.throws(() => tree.configure({ onNodeClick: true }), TypeError);
    });
    test('Texto e iconos seguros, iconos DOM, temas y guías', () => {
        tree.configure({ data: [{ id: 1, label: '<img src=x>', icon: 'folder' }], icons: { folder: '<b>Icono</b>' }, theme: 'dark', guides: false });
        assert.isNull(tree.querySelector('img,b')); assert.include(tree.list.textContent, '<img'); assert.equal(tree.root.dataset.theme, 'dark'); assert.isFalse(tree.root.classList.contains('tree--guides'));
        tree.configure({ data: data(), renderIcon: () => { const span = document.createElement('strong'); span.textContent = '★'; return span; } }); assert.exists(tree.querySelector('.tree__icon strong'));
    });
    test('Teclado: flechas, Enter/Espacio, Home/End y recuperación del foco', async () => {
        tree.items.get(1).focus(); key('ArrowRight'); key('ArrowRight'); assert.equal(tree.focusId, 2);
        key('Enter'); assert.equal(tree.getSelectedNodes()[0].id, 2); key('ArrowRight'); key('ArrowDown'); assert.equal(tree.focusId, 3);
        tree.collapseNode(1); assert.strictEqual(document.activeElement, tree.items.get(1));
        key('End'); assert.equal(tree.focusId, 7); key('Home'); assert.equal(tree.focusId, 1); key(' '); assert.equal(tree.getSelectedNodes()[0].id, 1);
        await tree.expandNode(1); await tree.expandNode(2); tree.items.get(3).focus(); tree.removeNode(2); assert.strictEqual(document.activeElement, tree.items.get(1));
    });
    test('Eventos y callbacks no se duplican al refrescar/reconectar', async () => {
        const onNodeClick = sinon.spy(), onNodeSelect = sinon.spy(), onNodeDoubleClick = sinon.spy(), event = sinon.spy();
        tree.configure({ data: data(), onNodeClick, onNodeSelect, onNodeDoubleClick }); tree.addEventListener('tree-select', event);
        tree.refresh().refresh(); tree.remove(); document.querySelector('#fixtures').append(tree);
        tree.items.get(1).querySelector('.tree__label').click(); assert.equal(onNodeClick.callCount, 1); assert.equal(onNodeSelect.callCount, 1); assert.equal(event.callCount, 1);
        tree.items.get(1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); assert.equal(onNodeDoubleClick.callCount, 1);
        assert.equal(event.firstCall.args[0].detail.node.label, 'Proyecto');
    });
    test('Carga diferida deduplica, agrega hijos y conserva selección', async () => {
        const request = deferred(), loader = sinon.stub().returns(request.promise);
        tree.configure({ data: [{ id: 1, label: 'Remoto', hasChildren: true }], selection: 'multiple', onLoadChildren: loader }); tree.selectNode(1);
        const first = tree.expandNode(1), second = tree.expandNode(1); await Promise.resolve(); assert.equal(loader.callCount, 1); assert.equal(tree.items.get(1).getAttribute('aria-busy'), 'true');
        request.resolve([{ id: 2, label: 'Cargado' }]); await Promise.all([first, second]); assert.isNotNull(tree.getNode(2)); assert.isTrue(tree.selected.has(2));
        tree.collapseNode(1); await tree.expandNode(1); assert.equal(loader.callCount, 1);
        assert.instanceOf(loader.firstCall.args[0].signal, AbortSignal);
    });
    test('Carga vacía convierte a hoja; errores permiten reintento con botón', async () => {
        const loader = sinon.stub(); loader.onFirstCall().rejects(new Error('Sin red')); loader.onSecondCall().resolves([]);
        tree.configure({ data: [{ id: 1, label: 'Remoto', hasChildren: true }], onLoadChildren: loader }); await tree.expandNode(1);
        assert.isFalse(tree.items.get(1).querySelector('[data-command=retry]').hidden); assert.include(tree.status.textContent, 'Sin red');
        tree.items.get(1).querySelector('[data-command=retry]').click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        assert.equal(loader.callCount, 2); assert.isFalse(tree.branch(tree.nodes.get(1))); assert.isFalse(tree.items.get(1).hasAttribute('aria-expanded'));
    });
    test('No acepta hijos inválidos y puede reintentar', async () => {
        const loader = sinon.stub().resolves([{ id: 1, label: 'Duplicado' }]);
        tree.configure({ data: [{ id: 1, label: 'Remoto', hasChildren: true }], onLoadChildren: loader }); await tree.expandNode(1);
        assert.equal(tree.nodes.size, 1); assert.isTrue(tree.errors.has(1));
        loader.resolves([{ id: 2, label: 'Correcto' }]); await tree.expandNode(1); assert.equal(tree.nodes.size, 2);
    });
    test('Cargas concurrentes de ramas diferentes se conservan', async () => {
        const a = deferred(), b = deferred(); tree.configure({ data: [{ id: 1, label: 'A', hasChildren: true }, { id: 2, label: 'B', hasChildren: true }], onLoadChildren: ({ id }) => id === 1 ? a.promise : b.promise });
        const pa = tree.expandNode(1), pb = tree.expandNode(2); await Promise.resolve(); a.resolve([{ id: 3, label: 'A hijo' }]); await pa;
        b.resolve([{ id: 4, label: 'B hijo' }]); await pb; assert.isNotNull(tree.getNode(3)); assert.isNotNull(tree.getNode(4));
    });
    test('Descarta cargas obsoletas tras eliminar, modificar, setData y destroy', async () => {
        for (const action of ['remove', 'update', 'replace', 'destroy']) {
            const request = deferred(), loader = sinon.stub().returns(request.promise);
            tree.configure({ data: [{ id: 1, label: 'Remoto', hasChildren: true }], onLoadChildren: loader }); const pending = tree.expandNode(1); await Promise.resolve();
            const signal = loader.firstCall.args[0].signal;
            if (action === 'remove') tree.removeNode(1);
            if (action === 'update') tree.updateNode(1, { children: [{ id: 8, label: 'Local' }] });
            if (action === 'replace') tree.setData([{ id: 1, label: 'Nueva versión' }]);
            if (action === 'destroy') tree.destroy();
            assert.isTrue(signal.aborted); request.resolve([{ id: 9, label: 'Obsoleto' }]); await pending;
            assert.isFalse(tree.nodes.has(9)); if (action === 'destroy') break;
        }
    });
    test('Contraer durante carga conserva intención y desconectar cancela', async () => {
        const request = deferred(); tree.configure({ data: [{ id: 1, label: 'Remoto', hasChildren: true }], onLoadChildren: () => request.promise });
        const pending = tree.expandNode(1); await Promise.resolve(); tree.collapseNode(1); request.resolve([{ id: 2, label: 'Hijo' }]); await pending;
        assert.deepEqual(ids(), [1]); assert.isNotNull(tree.getNode(2));
        tree.destroy(); tree.destroy(); assert.throws(() => tree.refresh(), /destruido/);
    });
    test('Expandir todo carga niveles diferidos nuevos', async () => {
        tree.configure({ data: [{ id: 1, label: 'A', hasChildren: true }], onLoadChildren: async ({ id }) => id === 1 ? [{ id: 2, label: 'B', hasChildren: true }] : [{ id: 3, label: 'C' }] });
        await tree.expandAll(); assert.deepEqual(ids(), [1, 2, 3]);
    });
    test('Expansión inicial carga hijos y snapshots no alteran la estructura', async () => {
        const loader = sinon.stub().resolves([{ id: 2, label: 'Hijo' }]);
        tree.configure({ data: [{ id: 1, label: 'Raíz', hasChildren: true }], expanded: [1], onLoadChildren: loader });
        await tree.expandNode(1); assert.equal(loader.callCount, 1); assert.include(ids(), 2);
        tree.selectNode(1); const snapshot = tree.getSelectedNodes()[0]; snapshot.children[0].label = 'Mutado';
        assert.equal(tree.getNode(2).label, 'Hijo');
    });
    test('Desconectar antes del microtask evita invocar el proveedor', async () => {
        const loader = sinon.stub().resolves([]);
        tree.configure({ data: [{ id: 1, label: 'Remoto', hasChildren: true }], onLoadChildren: loader });
        const pending = tree.expandNode(1); tree.remove(); await pending; assert.equal(loader.callCount, 0);
        document.querySelector('#fixtures').append(tree); await tree.expandNode(1); assert.equal(loader.callCount, 1);
    });
    test('Contraer todo interrumpe expansión global pendiente', async () => {
        const request = deferred();
        tree.configure({ data: [{ id: 1, label: 'A', hasChildren: true }], onLoadChildren: () => request.promise });
        const pending = tree.expandAll(); await Promise.resolve(); tree.collapseAll();
        request.resolve([{ id: 2, label: 'B', hasChildren: true }]); await pending;
        assert.deepEqual(ids(), [1]); assert.isFalse(tree.expanded.has(2));
    });
    test('Errores de callbacks síncronos y asíncronos quedan contenidos', async () => {
        const onError = sinon.spy();
        tree.configure({ data: data(), onError, onNodeSelect: () => { throw new Error('Fallo síncrono'); } }); tree.selectNode(1);
        assert.include(tree.status.textContent, 'Fallo síncrono');
        tree.configure({ data: data(), onError, onNodeSelect: async () => { throw new Error('Fallo asíncrono'); } }); tree.selectNode(1); await Promise.resolve();
        assert.include(tree.status.textContent, 'Fallo asíncrono'); assert.equal(onError.callCount, 2);
    });
    test('Teclado entra en coincidencias filtradas y eliminar raíz conserva foco', () => {
        tree.setSearch('test.js'); tree.items.get(1).focus(); key('ArrowRight'); assert.equal(tree.focusId, 2);
        key('ArrowRight'); assert.equal(tree.focusId, 4);
        tree.setSearch(''); tree.items.get(1).focus(); tree.removeNode(1);
        assert.strictEqual(document.activeElement, tree.items.get(7)); assert.equal(tree.items.get(7).tabIndex, 0);
    });
    test('renderLabel admite contenido DOM y expone el texto completo a lectores', () => {
        tree.configure({ data: [{ id: 1, label: 'Paso' }], renderLabel: node => { const label = document.createElement('span'); label.textContent = node.label + ' Completado'; return label; } });
        assert.equal(tree.items.get(1).getAttribute('aria-label'), 'Paso Completado');
        tree.configure({ data: [{ id: 1, label: 'Seguro' }], renderLabel: () => '<img>' });
        assert.isNull(tree.querySelector('img')); assert.include(tree.status.textContent, 'nodo DOM');
    });
    test('Modelo admite 5000 niveles sin recursión', () => {
        const root = { id: 0, label: 'Raíz' }; let node = root;
        for (let id = 1; id < 5000; id++) { const next = { id, label: id === 4999 ? 'Destino' : 'Nodo' }; node.children = [next]; node = next; }
        const model = createTree([root], { rowKey: 'id', childrenKey: 'children', disabledKey: 'disabled' });
        assert.lengthOf(visibleTree(model.roots, model.nodes, new Set(), 'Destino', ['label']), 5000);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
