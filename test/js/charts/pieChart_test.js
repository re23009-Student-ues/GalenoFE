import { assert } from '../lib/chai/index.js';
import { PieChart } from '../../../src/js/boundary/componentes/charts/index.js';
import { checkGeometry } from './pie_geometry_cases.js';

mocha.setup('tdd');
suite('PieChart', () => {
    let host, charts;
    setup(() => {
        host = document.createElement('div'); host.style.width = '400px';
        document.querySelector('#fixtures').append(host); charts = [];
    });
    teardown(() => { charts.forEach(chart => chart.destroy()); document.querySelector('#fixtures').replaceChildren(); });
    const create = (host, options = {}) => {
        const chart = new PieChart(host, { animated: false, ...options }); charts.push(chart); return chart.render();
    };
    test('Geometría y validación', () => checkGeometry(assert.isTrue));
    test('Círculo completo, datos cero y estado vacío', () => {
        const chart = create(host, { data: [{ label: 'Único', value: 10 }, { label: 'Cero', value: 0 }] });
        assert.lengthOf(host.querySelectorAll('path'), 1);
        assert.include(host.querySelector('path').getAttribute('aria-label'), '100 %');
        chart.update([{ label: 'Cero', value: 0 }]);
        assert.exists(host.querySelector('.pie-chart__empty'));
        assert.lengthOf(host.querySelectorAll('path'), 0);
        chart.update([]); assert.include(host.textContent, 'No hay datos disponibles');
    });
    test('Actualizaciones consecutivas, render idempotente y error transaccional', () => {
        const chart = create(host);
        for (let i = 1; i <= 5; i++) chart.update([{ label: 'A', value: i }, { label: 'B', value: i }]);
        chart.render(); assert.lengthOf(host.querySelectorAll('.pie-chart'), 1);
        assert.lengthOf(host.querySelectorAll('path'), 2);
        assert.throws(() => chart.update([{ label: 'Inválido', value: -1 }]), TypeError);
        assert.lengthOf(host.querySelectorAll('path'), 2);
    });
    test('Opciones y texto seguro', () => {
        create(host, { showLegend: false, showLabels: false, showPercentages: false, data: [{ label: '<img src=x>', value: 5 }] });
        assert.notExists(host.querySelector('img'));
        assert.notExists(host.querySelector('.pie-chart__legend'));
        assert.notExists(host.querySelector('.pie-chart__label'));
        assert.include(host.querySelector('desc').textContent, '<img src=x>');
        assert.throws(() => new PieChart('#missing-pie'));
        assert.throws(() => new PieChart(host, { height: 0 }));
    });
    test('Teclado, Escape y tooltip acotado', () => {
        create(host, { data: [{ label: 'Pacientes', value: 12 }] });
        const path = host.querySelector('path'); path.focus();
        const tooltip = host.querySelector('.pie-chart__tooltip'); assert.isFalse(tooltip.hidden);
        assert.include(tooltip.textContent, '100 %');
        const rect = host.querySelector('.pie-chart').getBoundingClientRect();
        const tip = tooltip.getBoundingClientRect();
        assert.isAtLeast(tip.left, rect.left); assert.isAtMost(tip.right, rect.right + 1);
        path.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); assert.isTrue(tooltip.hidden);
    });
    test('Observador responde al ancho y conserva foco', async () => {
        create(host, { data: [{ label: 'A', value: 1 }] });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const original = host.querySelector('svg'); host.querySelector('path').focus();
        host.style.height = '600px';
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        assert.strictEqual(host.querySelector('svg'), original);
        host.style.width = '220px';
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        assert.equal(host.querySelector('svg').viewBox.baseVal.width, 220);
        assert.strictEqual(document.activeElement, host.querySelector('path'));
    });
    test('Instancias independientes y destrucción', () => {
        const first = create(host, { data: [{ label: 'A', value: 1 }] });
        const another = document.createElement('div'); document.querySelector('#fixtures').append(another);
        create(another, { data: [{ label: 'B', value: 2 }] });
        assert.notEqual(host.querySelector('title').id, another.querySelector('title').id);
        first.destroy(); first.destroy();
        assert.notExists(host.querySelector('.pie-chart'));
        assert.exists(another.querySelector('svg'));
        assert.throws(() => first.render()); assert.throws(() => first.resize()); assert.throws(() => first.update([]));
    });
    test('Respeta movimiento reducido y desconecta observadores', () => {
        const originalMatchMedia = window.matchMedia;
        const OriginalObserver = window.ResizeObserver;
        let disconnected = false;
        try {
            window.matchMedia = () => ({ matches: true });
            window.ResizeObserver = class {
                observe() {}
                disconnect() { disconnected = true; }
            };
            const chart = create(host, { animated: true, data: [{ label: 'A', value: 1 }] });
            assert.lengthOf(host.getAnimations({ subtree: true }), 0);
            chart.destroy(); assert.isTrue(disconnected);
        } finally {
            window.matchMedia = originalMatchMedia;
            window.ResizeObserver = OriginalObserver;
        }
    });
    test('Sin animaciones cuando animated es false', () => {
        create(host, { data: [{ label: 'A', value: 1 }] });
        assert.lengthOf(host.getAnimations({ subtree: true }), 0);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
