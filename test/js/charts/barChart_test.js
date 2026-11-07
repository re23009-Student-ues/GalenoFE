import { assert } from '../lib/chai/index.js';
import { BarChart } from '../../../src/js/boundary/componentes/charts/index.js';

mocha.setup('tdd');
suite('BarChart', () => {
    let host, charts;
    setup(() => {
        host = document.createElement('div'); host.style.width = '600px';
        document.querySelector('#fixtures').append(host); charts = [];
    });
    teardown(() => { charts.forEach(chart => chart.destroy()); document.querySelector('#fixtures').replaceChildren(); });
    const create = (host, options = {}) => {
        const chart = new BarChart(host, { animated: false, ...options }); charts.push(chart); return chart.render();
    };
    const data = [{ label: '<img src=x>', value: 35 }, { label: 'Cero', value: 0 }];

    test('Contenedor inexistente', () => {
        assert.throws(() => new BarChart('#missing-bar'));
    });
    test('Barras, alternativa textual y texto seguro', () => {
        create(host, { data, showDataTable: true });
        assert.lengthOf(host.querySelectorAll('rect'), 2);
        assert.lengthOf(host.querySelectorAll('tbody tr'), 2);
        assert.notExists(host.querySelector('img'));
        assert.include(host.textContent, '<img src=x>');
    });
    test('Tooltip por teclado y Escape', () => {
        create(host, { data });
        const bar = host.querySelector('rect'); bar.focus();
        const tooltip = host.querySelector('.bar-chart__tooltip');
        assert.isFalse(tooltip.hidden);
        bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        assert.isTrue(tooltip.hidden);
    });
    test('El control abre la tabla y el redibujado conserva su estado', () => {
        const chart = create(host, { data, showDataTable: true });
        host.querySelector('summary').click();
        assert.isTrue(host.querySelector('details').open);
        chart.resize();
        assert.isTrue(host.querySelector('details').open);
    });
    test('Render idempotente', () => {
        const chart = create(host, { data });
        chart.render().render();
        assert.lengthOf(host.querySelectorAll('.bar-chart'), 1);
    });
    const invalidCases = [
        ['null', null],
        ['objeto', {}],
        ['etiqueta vacía', [{ label: '', value: 1 }]],
        ['valor negativo', [{ label: 'X', value: -1 }]],
        ['NaN', [{ label: 'X', value: NaN }]],
        ['Infinity', [{ label: 'X', value: Infinity }]],
        ['valor de texto', [{ label: 'X', value: '2' }]]
    ];
    for (const [name, invalid] of invalidCases) {
        test(`Rechaza ${name} y conserva los datos anteriores`, () => {
            const chart = create(host, { data });
            assert.throws(() => chart.update(invalid), TypeError);
            assert.lengthOf(host.querySelectorAll('rect'), 2);
        });
    }
    test('Actualización reutiliza las barras', () => {
        const chart = create(host, { data });
        const bar = host.querySelector('rect');
        chart.update([{ label: 'Nuevo', value: 65 }]);
        assert.strictEqual(host.querySelector('rect'), bar);
    });
    test('Tabla desactivada por defecto y descripción textual sin tabla', () => {
        create(host, { orientation: 'horizontal', data: [{ label: 'Otra', value: 10 }] });
        assert.notExists(host.querySelector('details'));
        assert.include(host.querySelector('desc').textContent, 'Otra: 10');
    });
    for (const value of [0, 0.00001, Number.MIN_VALUE, Number.MAX_VALUE]) {
        test(`Geometría finita para ${value}`, () => {
            const chart = create(host, { data });
            chart.update([{ label: 'Límite', value }]);
            for (const rect of host.querySelectorAll('rect')) {
                for (const key of ['x', 'y', 'width', 'height']) {
                    assert.isTrue(Number.isFinite(Number(rect.getAttribute(key))), `Coordenada ${key} finita`);
                }
            }
        });
    }
    test('Redimensionamiento manual', () => {
        const chart = create(host, { data });
        host.style.width = '240px'; chart.resize();
        assert.equal(host.querySelector('svg').viewBox.baseVal.width, 240);
    });
    test('Estado vacío al actualizar', () => {
        const chart = create(host, { data });
        chart.update([]);
        assert.include(host.textContent, 'Sin datos disponibles');
    });
    test('Instancias independientes y destrucción idempotente', () => {
        const first = create(host, { data });
        const another = document.createElement('div'); another.style.width = '280px';
        document.querySelector('#fixtures').append(another);
        create(another, { orientation: 'horizontal', data: [{ label: 'Otra', value: 10 }] });
        assert.notEqual(host.querySelector('title').id, another.querySelector('title').id);
        first.destroy(); first.destroy();
        assert.notExists(host.querySelector('.bar-chart'));
        assert.exists(another.querySelector('svg'));
        assert.throws(() => first.render());
        assert.throws(() => first.update([]));
        assert.throws(() => first.resize());
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
