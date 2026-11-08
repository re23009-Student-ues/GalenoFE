import { assert } from '../lib/chai/index.js';
import { DataTable } from '../../../src/js/boundary/componentes/data-display/index.js';
import { checkModel } from './data_table_model_cases.js';

mocha.setup('tdd');
suite('DataTable', () => {
    let host, tables;
    const columns = [{ key: 'name', label: 'Paciente', sortable: true }, { key: 'age', label: 'Edad', type: 'number', sortable: true }];
    const data = [{ id: 1, name: 'Juan', age: 35 }, { id: 2, name: 'María', age: 28 }, { id: 3, name: 'Ana', age: null }];
    setup(() => {
        host = document.createElement('div'); host.style.width = '600px';
        document.querySelector('#fixtures').append(host); tables = [];
    });
    teardown(() => { tables.forEach(table => table.destroy()); document.querySelector('#fixtures').replaceChildren(); });
    const create = (options = {}, container = host) => {
        const table = new DataTable(container, { columns, data, ...options }); tables.push(table); return table.render();
    };
    const click = selector => host.querySelector(selector).click();
    test('Modelo local: validación, búsqueda, orden y paginación', () => checkModel(assert.isTrue));
    test('Vacío, un registro y múltiples registros', () => {
        const table = create({ data: [] });
        assert.include(host.textContent, 'No hay registros disponibles');
        table.update([data[0]]); assert.lengthOf(host.querySelectorAll('tbody tr'), 1);
        table.update(data); assert.lengthOf(host.querySelectorAll('tbody tr'), 3);
    });
    test('Búsqueda con resultados, sin resultados y página restablecida', () => {
        const table = create({ pageSize: 1 }); table.setPage(3).setSearch('jU');
        assert.include(host.querySelector('tbody').textContent, 'Juan');
        assert.include(host.querySelector('.data-table__page-info').textContent, 'Página 1');
        table.setSearch('xyz'); assert.include(host.textContent, 'No se encontraron resultados');
        table.setSearch(''); assert.notInclude(host.querySelector('tbody').textContent, 'No se encontraron resultados');
    });
    test('Debounce filtra dinámicamente sin reemplazar el buscador', async () => {
        create({ debounce: 10 });
        const input = host.querySelector('input[type=search]'); input.focus(); input.value = 'MAR';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.strictEqual(host.querySelector('input[type=search]'), input);
        assert.strictEqual(document.activeElement, input);
        assert.lengthOf(host.querySelectorAll('tbody tr'), 1);
        assert.include(host.querySelector('tbody').textContent, 'María');
    });
    test('Orden ascendente, descendente y original con aria-sort', () => {
        create();
        click('[data-command=sort][data-column="1"]');
        assert.include(host.querySelector('tbody tr').textContent, 'María');
        assert.equal(host.querySelectorAll('th')[1].getAttribute('aria-sort'), 'ascending');
        click('[data-command=sort][data-column="1"]'); assert.include(host.querySelector('tbody tr').textContent, 'Juan');
        assert.equal(host.querySelectorAll('th')[1].getAttribute('aria-sort'), 'descending');
        click('[data-command=sort][data-column="1"]'); assert.equal(host.querySelectorAll('th')[1].getAttribute('aria-sort'), 'none');
        assert.equal(data[0].name, 'Juan');
    });
    test('Paginación, selector de tamaño y actualización ajustan páginas', () => {
        const table = create({ pageSize: 1, pageSizeOptions: [1, 2, 5] });
        click('[data-command=next]'); assert.include(host.querySelector('tbody').textContent, 'María');
        click('[data-command=previous]'); assert.include(host.querySelector('tbody').textContent, 'Juan');
        const size = host.querySelector('select'); size.value = '2'; size.dispatchEvent(new Event('change', { bubbles: true }));
        assert.lengthOf(host.querySelectorAll('tbody tr'), 2);
        table.setPage(99); assert.include(host.querySelector('tbody').textContent, 'Ana');
        table.update([data[0]]); assert.include(host.querySelector('.data-table__page-info').textContent, 'Página 1 de 1');
    });
    test('Selección por clave persiste entre páginas y filtros y se reconcilia al actualizar', () => {
        const table = create({ selectable: true, pageSize: 1 });
        click('[data-command=select]'); table.setPage(2); click('[data-command=select]');
        assert.deepEqual(table.getSelectedRows().map(row => row.id), [1, 2]);
        table.setSearch('Ana'); assert.lengthOf(table.getSelectedRows(), 2);
        table.update([{ ...data[1], name: 'María actualizada' }, data[2]]);
        assert.deepEqual(table.getSelectedRows().map(row => row.name), ['María actualizada']);
        table.clearSelection(); assert.lengthOf(table.getSelectedRows(), 0);
    });
    test('Seleccionar y deseleccionar página actual, estado indeterminado', () => {
        const table = create({ selectable: true, pageSize: 2 });
        click('[data-command=select]'); assert.isTrue(host.querySelector('[data-command=all]').indeterminate);
        click('[data-command=all]'); assert.lengthOf(table.getSelectedRows(), 2);
        click('[data-command=all]'); assert.lengthOf(table.getSelectedRows(), 0);
    });
    test('Acciones reciben el registro una sola vez y respetan disabled', () => {
        let calls = 0, received;
        const table = create({ actions: [
            { label: 'Ver', onClick: row => { calls++; received = row; } },
            { label: 'Eliminar', variant: 'danger', disabled: row => row.id === 1, onClick: () => { calls++; } }
        ] });
        table.render().render(); click('[data-action="0"]');
        assert.equal(calls, 1); assert.equal(received.id, 1);
        click('[data-action="1"]'); assert.equal(calls, 1);
    });
    test('Texto seguro, formatter, renderCell y valores faltantes', () => {
        create({ data: [{ name: '<img src=x onerror=alert(1)>' }], columns: [
            ...columns,
            { key: 'status', label: 'Estado', formatter: value => value ?? '<b>Sin dato</b>' }
        ] });
        assert.notExists(host.querySelector('img')); assert.notExists(host.querySelector('b'));
        assert.include(host.textContent, '<b>Sin dato</b>');
        assert.equal(host.querySelectorAll('tbody td')[1].textContent, '');
        const other = document.createElement('div'); host.append(other);
        create({ columns: [{ key: 'name', label: 'Nombre', renderCell: value => {
            const strong = document.createElement('strong'); strong.textContent = value; return strong;
        } }] }, other);
        assert.equal(other.querySelector('strong').textContent, 'Juan');
    });
    test('Loading, error y recuperación son estados distintos', () => {
        const table = create({ data: [] }); table.setLoading(true);
        assert.include(host.textContent, 'Cargando registros'); assert.equal(host.querySelector('table').getAttribute('aria-busy'), 'true');
        assert.notInclude(host.querySelector('tbody').textContent, 'No hay registros');
        table.setError('<error de API>').setLoading(false);
        assert.include(host.querySelector('.data-table__error').textContent, '<error de API>');
        table.update(data); assert.notExists(host.querySelector('.data-table__error'));
    });
    test('Funciones desactivadas, render idempotente y datos inválidos', () => {
        const table = create({ searchable: false, sortable: false, pagination: false, selectable: false });
        table.setSearch('xyz').setPage(10).clearSelection().render();
        assert.lengthOf(host.querySelectorAll('tbody tr'), 3); assert.lengthOf(table.getSelectedRows(), 0);
        assert.notExists(host.querySelector('select')); assert.notExists(host.querySelector('input'));
        assert.lengthOf(host.querySelectorAll('.data-table'), 1);
        assert.throws(() => table.update(null), TypeError); assert.lengthOf(host.querySelectorAll('tbody tr'), 3);
        assert.throws(() => new DataTable('#missing-table', { columns }));
        assert.throws(() => new DataTable(host, { columns, selectable: true, data: [{ id: 1 }, { id: 1 }] }), TypeError);
    });
    test('Múltiples tablas, destrucción, temporizador pendiente y reinicialización', async () => {
        const first = create({ debounce: 10 });
        const other = document.createElement('div'); document.querySelector('#fixtures').append(other);
        create({}, other);
        assert.notEqual(host.querySelector('input').id, other.querySelector('input').id);
        const oldInput = host.querySelector('input'); oldInput.value = 'Ana'; oldInput.dispatchEvent(new Event('input', { bubbles: true }));
        first.destroy(); first.destroy();
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.notExists(host.querySelector('.data-table')); assert.exists(other.querySelector('table'));
        for (const action of [() => first.render(), () => first.update([]), () => first.setLoading(false), () => first.setError(null),
            () => first.setPage(1), () => first.setSearch(''), () => first.clearSelection(), () => first.getSelectedRows()]) assert.throws(action);
        create(); assert.exists(host.querySelector('table'));
    });
    test('Contenedor estrecho conserva columnas y habilita desplazamiento', () => {
        host.style.width = '240px'; create({ columns: columns.map(column => ({ ...column, width: '300px' })) });
        const scroller = host.querySelector('.data-table__container');
        assert.equal(getComputedStyle(scroller).overflowX, 'auto');
        assert.lengthOf(host.querySelectorAll('thead th'), 2);
        assert.isAtMost(scroller.getBoundingClientRect().width, 240);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
