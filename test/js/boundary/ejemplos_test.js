import { assert } from '../lib/chai/index.js';

mocha.setup('tdd');
suite('Ejemplos restaurados', () => {
    let frame;
    const base = new URL('../../../src/ejemplos/', import.meta.url);
    async function load(name, selector) {
        frame = document.createElement('iframe'); frame.style.width = '360px'; frame.style.height = '700px';
        const loaded = new Promise(resolve => { frame.onload = resolve; });
        const url = new URL(`${name}.html`, base);
        url.searchParams.set('test', String(Date.now())); // No reutilizar documentos anteriores a la restauración.
        frame.src = url; document.querySelector('#fixtures').append(frame);
        await loaded;
        const doc = frame.contentDocument;
        assert.exists(doc.querySelector(selector), `Se renderiza ${name}`);
        assert.exists(doc.querySelector('a[href="./index.html"]'), 'Permite volver al catálogo');
        const resources = frame.contentWindow.performance.getEntriesByType('resource');
        assert.isFalse(resources.some(resource => resource.responseStatus >= 400), 'Recursos sin errores HTTP');
        assert.isFalse(resources.some(resource => resource.name.includes('/resources/v1/')), 'Sin solicitudes REST automáticas');
        return doc;
    }
    teardown(() => { frame?.remove(); frame = null; });
    test('Catálogo: los doce ejemplos enlazados existen', async () => {
        const response = await fetch(new URL('index.html', base)); assert.isTrue(response.ok);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const links = [...doc.querySelectorAll('tbody a')]; assert.lengthOf(links, 12);
        const responses = await Promise.all(links.map(link => fetch(new URL(link.getAttribute('href'), base))));
        assert.isTrue(responses.every(item => item.ok));
    });
    test('BarChart: dos orientaciones y actualización de valores', async () => {
        const doc = await load('bar-chart', '#patientsChart svg');
        assert.exists(doc.querySelector('#patientsHorizontal svg'));
        const previous = doc.querySelector('#patientsChart').textContent;
        doc.querySelector('#update').click();
        assert.notEqual(doc.querySelector('#patientsChart').textContent, previous);
    });
    test('PieChart: actualización y destrucción de ambas instancias', async () => {
        const doc = await load('pie-chart', '#appointmentsChart svg');
        const previous = doc.querySelector('#appointmentsChart').textContent;
        doc.querySelector('#update').click();
        assert.notEqual(doc.querySelector('#appointmentsChart').textContent, previous);
        doc.querySelector('#destroy').click();
        assert.notExists(doc.querySelector('#appointmentsChart svg, #specialtiesChart svg'));
        assert.isTrue(doc.querySelector('#update').disabled);
    });
    test('DataTable: búsqueda, selección y actualización de registros', async () => {
        const doc = await load('data-table', '#patientsTable table');
        doc.querySelector('#patientsTable input[type=checkbox][data-command=select]').click();
        doc.querySelector('#selected').click(); assert.include(doc.querySelector('#feedback').textContent, 'Juan Pérez');
        doc.querySelector('#update').click();
        const input = doc.querySelector('#patientsTable input[type=search]');
        input.value = 'Lucía'; input.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 400));
        assert.include(doc.querySelector('#patientsTable tbody').textContent, 'Lucía Flores');
        assert.exists(doc.querySelector('#specialtiesTable table'));
    });
    test('Calendar: eventos, eliminación y limpieza de instancias', async () => {
        const doc = await load('calendar', '#appointmentsCalendar .calendar');
        doc.querySelector('#appointmentsCalendar [data-date="2026-11-12"]').click();
        doc.querySelector('#add-event').click(); assert.include(doc.querySelector('#appointmentsCalendar').textContent, 'Nueva cita ficticia');
        doc.querySelector('#remove-event').click(); assert.notInclude(doc.querySelector('#appointmentsCalendar').textContent, 'Nueva cita ficticia');
        doc.querySelector('#update-events').click();
        assert.exists(doc.querySelector('#agendaCalendar .calendar'));
        doc.querySelector('#destroy-calendars').click();
        assert.notExists(doc.querySelector('.calendar'));
        assert.isTrue([...doc.querySelectorAll('.calendar-demo__controls button')].every(button => button.disabled));
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
