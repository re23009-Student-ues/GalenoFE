import { assert } from '../lib/chai/index.js';
import { TreeTable } from '../../../src/js/boundary/componentes/data-display/index.js';
import { indexTree, treeView } from '../../../src/js/boundary/componentes/data-display/tree_table_model.js';
mocha.setup('tdd');
const columns = [{ key: 'name', label: 'Nombre', sortable: true }, { key: 'value', label: 'Valor', sortable: true, type: 'number' }];
const data = () => [{ id: 1, name: 'Zeta', children: [
    { id: 2, name: 'Beta', children: [{ id: 3, name: 'Informe', value: 8 }] },
    { id: 4, name: 'Alfa', value: 2 }
] }, { id: 5, name: 'Archivo', value: 1 }];
suite('TreeTable', () => {
    let table;
    setup(() => { table = new TreeTable(); document.querySelector('#fixtures').append(table); table.configure({ columns, data: data() }); });
    teardown(() => { table.destroy(); document.querySelector('#fixtures').replaceChildren(); });
    const ids = () => table.view.map(node => node.id);
    const key = (row, value) => row.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    test('Expansión individual, multinivel, inicial y global', () => {
        assert.deepEqual(ids(), [1, 5]); table.expandNode(1).expandNode(2); assert.deepEqual(ids(), [1, 2, 3, 4, 5]);
        table.collapseNode(1).expandNode(1); assert.include(ids(), 3);
        table.collapseAll(); assert.deepEqual(ids(), [1, 5]); table.expandAll(); assert.lengthOf(ids(), 5);
        table.configure({ expanded: [1] }); assert.deepEqual(ids(), [1, 2, 4, 5]);
    });
    test('Hijos y clave configurables; IDs numéricos y texto distintos', () => {
        table.configure({ rowKey: 'code', childrenKey: 'items', data: [{ code: 1, name: 'Padre', items: [{ code: '1', name: 'Hijo' }] }], expanded: true });
        assert.deepEqual(ids(), [1, '1']); table.selectNode('1'); assert.equal(table.getSelectedRows()[0].name, 'Hijo');
    });
    test('Búsqueda revela antecesores y restaura expansión sin modificarla', () => {
        table.expandNode(1).setSearch('INFORME'); assert.deepEqual(ids(), [1, 2, 3]);
        table.setSearch(''); assert.deepEqual(ids(), [1, 2, 4, 5]);
        table.setSearch('ausente'); assert.include(table.status.textContent, 'No se encontraron');
        table.setSearch('   '); assert.deepEqual(ids(), [1, 2, 4, 5]);
    });
    test('Respeta columnas buscables y búsqueda deshabilitada', () => {
        table.configure({ columns: [{ key: 'name', label: 'Nombre', searchable: false }] }).setSearch('Informe'); assert.lengthOf(ids(), 0);
        table.configure({ searchable: false }).setSearch('Informe'); assert.isNull(table.search); // Se elimina al reconfigurar.
    });
    test('Orden entre hermanos mantiene relación padre-hijo y datos originales', () => {
        const original = data(); table.setData(original).expandAll().setSort('name');
        assert.deepEqual(ids(), [5, 1, 4, 2, 3]); assert.equal(original[0].id, 1);
        table.setSort('name', 'desc'); assert.deepEqual(ids(), [1, 2, 3, 4, 5]);
        table.setSort('name', null); assert.deepEqual(ids(), [1, 2, 3, 4, 5]);
    });
    test('Selección simple, múltiple, sin selección y actualización', () => {
        table.selectNode(1).selectNode(5); assert.deepEqual(table.getSelectedRows().map(row => row.id), [5]);
        table.configure({ selection: 'multiple' }); table.selectNode(1).selectNode(3); table.setSearch('Archivo');
        assert.lengthOf(table.getSelectedRows(), 2); table.setData([{ id: 3, name: 'Actualizado' }]);
        assert.equal(table.getSelectedRows()[0].name, 'Actualizado'); table.clearSelection(); assert.lengthOf(table.getSelectedRows(), 0);
        table.configure({ selection: 'none' }).selectNode(3); assert.lengthOf(table.getSelectedRows(), 0);
    });
    test('Selección no reconstruye el cuerpo ni pierde foco; checkbox independiente', () => {
        table.configure({ selection: 'multiple' }); const tr = table.body.firstChild; const checkbox = tr.querySelector('input');
        checkbox.click(); assert.lengthOf(table.getSelectedRows(), 1); assert.strictEqual(table.body.firstChild, tr);
        checkbox.click(); assert.lengthOf(table.getSelectedRows(), 0);
        assert.equal(tr.getAttribute('aria-selected'), 'false');
    });
    test('Eventos y callbacks contienen nodo, padre y nivel; no duplican listeners', () => {
        const onExpand = sinon.spy(), onSelect = sinon.spy(), event = sinon.spy();
        table.configure({ onExpand, onSelect }); table.addEventListener('tree-table-select', event);
        table.refresh().refresh(); table.root.querySelector('[data-command=toggle]').click();
        assert.equal(onExpand.callCount, 1); table.selectNode(2);
        assert.equal(onSelect.firstCall.args[0].parentId, 1); assert.equal(event.firstCall.args[0].detail.level, 2);
    });
    test('Acciones disabled, errores síncronos y asíncronos', async () => {
        const spy = sinon.spy(); table.configure({ actions: [{ label: 'Ver', onClick: spy }, { label: 'Bloqueada', disabled: true, onClick: spy }] });
        table.body.querySelector('[data-action="0"]').click(); table.body.querySelector('[data-action="1"]').click(); assert.equal(spy.callCount, 1);
        table.configure({ actions: [{ label: 'Error', onClick: () => Promise.reject(new Error('Falló carga')) }] });
        table.body.querySelector('button[data-action]').click(); await Promise.resolve(); assert.include(table.status.textContent, 'Falló carga');
        table.setError(null); assert.lengthOf(table.body.querySelectorAll('tr[data-index]'), 2);
    });
    test('Vacío, carga, error y recuperación; bloquea controles durante carga', () => {
        table.setLoading(true); table.root.querySelector('[data-command=expand-all]').click(); assert.equal(table.expanded.size, 0);
        assert.equal(table.table.getAttribute('aria-busy'), 'true'); table.setLoading(false).setError('Sin red'); assert.include(table.status.textContent, 'Sin red');
        table.setData([]); assert.include(table.status.textContent, 'No hay registros'); table.setData(data()); assert.lengthOf(ids(), 2);
    });
    test('Validación atómica: duplicados, ciclos, hijos inválidos y configuración', () => {
        const cycle = { id: 8 }; cycle.children = [cycle];
        for (const invalid of [[{ id: 1 }, { id: 1 }], [cycle], [{ id: 1, children: 'mal' }], [{ name: 'Sin ID' }]]) {
            table.setData(invalid); assert.equal(table.nodes.size, 5); assert.isNotEmpty(table.error);
        }
        assert.throws(() => table.configure({ hierarchyColumn: 'ausente' }), TypeError);
        assert.throws(() => table.configure({ selection: 'otra' }), TypeError);
    });
    test('Texto seguro, formatter y renderCell', () => {
        table.configure({ columns: [{ key: 'name', label: 'Nombre', formatter: value => `<b>${value}</b>` }] });
        assert.isNull(table.body.querySelector('b')); assert.include(table.body.textContent, '<b>Zeta</b>');
        table.configure({ columns: [{ key: 'name', label: 'Nombre', renderCell: value => { const strong = document.createElement('strong'); strong.textContent = value; return strong; } }] });
        assert.equal(table.body.querySelector('strong').textContent, 'Zeta');
    });
    test('Teclado: flechas, Enter, espacio, Home/End y foco al contraer', () => {
        let tr = table.body.firstChild; tr.focus(); key(tr, 'ArrowRight'); assert.include(ids(), 2);
        tr = table.body.firstChild; key(tr, 'ArrowRight'); assert.equal(document.activeElement.dataset.index, '1');
        key(document.activeElement, 'Enter'); assert.equal(table.getSelectedRows()[0].id, 2);
        key(document.activeElement, 'ArrowRight'); key(document.activeElement, 'ArrowDown'); assert.equal(document.activeElement.getAttribute('aria-level'), '3');
        table.collapseNode(1); assert.strictEqual(document.activeElement, table.body.firstChild);
        key(document.activeElement, 'End'); assert.equal(document.activeElement.dataset.index, '1');
        key(document.activeElement, 'Home'); assert.equal(document.activeElement.dataset.index, '0');
        key(document.activeElement, ' '); assert.equal(table.getSelectedRows()[0].id, 1);
    });
    test('ARIA y navegación no interceptan botones', () => {
        assert.equal(table.table.getAttribute('role'), 'treegrid'); assert.equal(table.body.firstChild.getAttribute('aria-expanded'), 'false');
        const control = table.body.querySelector('button'); key(control, 'ArrowRight'); assert.deepEqual(ids(), [1, 5]);
        table.head.querySelector('button').click(); assert.equal(table.head.querySelector('th').getAttribute('aria-sort'), 'ascending');
    });
    test('Desconectar y reconectar conserva datos sin listeners duplicados', () => {
        const onExpand = sinon.spy(); table.configure({ onExpand }); table.remove(); document.querySelector('#fixtures').append(table);
        table.body.querySelector('button').click(); assert.equal(onExpand.callCount, 1);
        table.destroy(); table.destroy(); assert.isEmpty(table.children); assert.throws(() => table.refresh(), /destruido/);
    });
    test('Restaura expansión previa incluso con acciones globales durante búsqueda', () => {
        table.expandNode(1).setSearch('Informe').expandAll().setSearch('');
        assert.deepEqual(ids(), [1, 2, 4, 5]);
    });
    test('Opciones inválidas se rechazan sin alterar la instancia', () => {
        for (const option of [
            { columns: [{ key: 'name', label: 'Nombre', type: 'otro' }] },
            { columns: [{ key: 'name', label: 'Nombre', formatter: 2 }] },
            { onSelect: true }, { actions: [{ label: 'Acción', onClick() {}, disabled: 'si' }] }
        ]) assert.throws(() => table.configure(option), TypeError);
        assert.equal(table.nodes.size, 5);
    });
    test('Configuración deshabilita ordenamiento y selección de filas con clic', () => {
        table.configure({ sortable: false, searchable: false }); table.setSort('name').setSearch('Informe');
        assert.deepEqual(ids(), [1, 5]); assert.isNull(table.head.querySelector('button'));
        table.body.firstChild.querySelector('td').click(); assert.equal(table.getSelectedRows()[0].id, 1);
    });
    test('Errores de render y callbacks se informan y permiten recuperación', () => {
        const onError = sinon.spy();
        table.configure({ onError, columns: [{ key: 'name', label: 'Nombre', renderCell: () => 'incorrecto' }] });
        assert.include(table.status.textContent, 'nodo DOM'); assert.equal(onError.callCount, 1);
        table.configure({ columns, onSelect: () => { throw new Error('Error de callback'); } }).selectNode(1);
        assert.include(table.status.textContent, 'Error de callback'); table.setError(null); assert.lengthOf(ids(), 2);
    });
    test('Modelo itera miles de niveles sin recursión y no muta datos', () => {
        const root = { id: 0, name: 'raíz' }; let cursor = root;
        for (let id = 1; id < 5000; id++) { const child = { id, name: id === 4999 ? 'destino' : 'nodo' }; cursor.children = [child]; cursor = child; }
        const { roots, nodes } = indexTree([root], 'id', 'children');
        const view = treeView(roots, nodes, columns, 'destino', new Set(), null);
        assert.lengthOf(view, 5000); assert.equal(view.at(-1).level, 5000); assert.equal(root.children[0].id, 1);
    });
});
mocha.run();
