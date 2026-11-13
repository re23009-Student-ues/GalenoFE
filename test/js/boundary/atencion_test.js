import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { crearRouter } from '../../../src/js/router.js';
import { calcularEdad, estadoConsulta } from '../../../src/js/control/fechas.js';

mocha.setup('tdd');
suite('Consulta → Atención SPA (REST simulado solo en pruebas)', () => {
    let sandbox, fixture, router, consultas, pasos, fetchStub, originalURL;
    const usuario = { idRol: { nombre: 'Doctor' }, idClinica: { idClinica: 'clinica-1' } };
    const espera = async predicate => {
        for (let i = 0; i < 50 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.isTrue(!!predicate(), 'La pantalla termina de cargar');
    };
    setup(() => {
        originalURL = location.href;
        sandbox = sinon.createSandbox();
        consultas = [{ idConsulta: 'consulta-1', fechaInicio: '2026-11-12T08:00:00-06:00',
            idPersonaRol: { idPersonaRol: 'paciente-1', idClinica: { idClinica: 'clinica-1' },
                idPersona: { nombres: 'Ana', apellidos: 'López', fechaNacimiento: `${new Date().getFullYear() - 30}-01-01` } } }];
        pasos = [{ idConsultaProcedimientoPaso: 'paso-1', estado: 'EN_CURSO',
            idConsultaProcedimiento: { idConsulta: { idConsulta: 'consulta-1' }, idProcedimiento: { nombre: 'Control médico' } },
            idProcedimientoPaso: { nombre: 'Evaluación' } }];
        fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url, options) => {
            assert.equal(options.method, 'GET');
            const resource = new URL(url).pathname.split('/').pop();
            assert.include(['consulta', 'consulta_procedimiento_paso'], resource, 'Solo endpoints existentes');
            const data = resource === 'consulta' ? consultas : pasos;
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Total-registros': String(data.length) } });
        });
        fixture = document.createElement('div');
        document.querySelector('#fixtures').append(fixture);
        const tituloEl = document.createElement('h1'), contenedor = document.createElement('main');
        fixture.append(tituloEl, contenedor);
        router = crearRouter({ contenedor, tituloEl, obtenerUsuario: () => usuario });
    });
    teardown(() => { router.detener(); fixture.remove(); sandbox.restore(); history.replaceState({}, '', originalURL); });

    test('Seleccionar consulta abre atención SPA con paciente, edad, procedimiento y paso', async () => {
        history.replaceState({}, '', '#/consultas');
        router.iniciar();
        await espera(() => fixture.querySelector('.consulta__seleccionar'));
        fixture.querySelector('.consulta__seleccionar').click();
        await espera(() => fixture.querySelector('.atencion__tabla'));
        assert.equal(location.hash, '#/atencion/consulta-1');
        assert.include(fixture.textContent, 'Ana López'); assert.include(fixture.textContent, '30 años');
        assert.include(fixture.textContent, 'Control médico'); assert.include(fixture.textContent, 'Paso en curso: Evaluación');
        assert.lengthOf(fixture.querySelectorAll('atencion-controller'), 1);
        assert.notExists(fixture.querySelector('consulta-controller'));
        fixture.querySelector('.atencion__boton').click();
        await espera(() => fixture.querySelector('.consulta__seleccionar'));
        assert.equal(location.hash, '#/consultas');
    });
    test('Sin selección no hace peticiones ni crea registros', () => {
        router.manejarRuta('/atencion');
        assert.include(fixture.textContent, 'Selecciona un registro'); assert.isFalse(fetchStub.called);
    });
    test('Consulta ajena a clínica no carga pasos', async () => {
        consultas[0].idPersonaRol.idClinica.idClinica = 'otra-clinica';
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.textContent.includes('no está disponible'));
        assert.equal(fetchStub.callCount, 1); assert.notInclude(fixture.textContent, 'Ana López');
    });
    test('Campos ausentes y sin pasos: no inventa datos', async () => {
        delete consultas[0].idPersonaRol.idPersona.fechaNacimiento; pasos = [];
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.textContent.includes('no devuelve procedimientos'));
        assert.include(fixture.textContent, 'No disponible'); assert.notExists(fixture.querySelector('tbody'));
    });
    test('Pendiente no se presenta como paso actual y texto REST se muestra seguro', async () => {
        pasos[0].estado = 'PENDIENTE'; pasos[0].idProcedimientoPaso.nombre = '<img src=x onerror=alert(1)>';
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('tbody'));
        assert.include(fixture.textContent, 'no indica un paso en curso');
        assert.include(fixture.textContent, '<img src=x'); assert.notExists(fixture.querySelector('img'));
    });
    test('Error REST no filtra detalles y permite reintentar', async () => {
        fetchStub.onFirstCall().rejects(new Error('detalle privado del servidor'));
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('[role=alert]'));
        assert.notInclude(fixture.textContent, 'detalle privado');
        [...fixture.querySelectorAll('button')].find(button => button.textContent === 'Reintentar').click();
        await espera(() => fixture.querySelector('tbody'));
    });
    test('Error al cargar pasos conserva paciente y no presenta pasos incompletos', async () => {
        fetchStub.onSecondCall().resolves(new Response('', { status: 500 }));
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('[role=alert]'));
        assert.include(fixture.textContent, 'Ana López'); assert.notExists(fixture.querySelector('.atencion__pasos'));
    });
    test('Respuesta tardía no reemplaza la siguiente pantalla', async () => {
        let resolve;
        fetchStub.onFirstCall().returns(new Promise(done => { resolve = done; }));
        router.manejarRuta('/atencion/consulta-1');
        router.manejarRuta('/citas');
        resolve(new Response(JSON.stringify(consultas), { status: 200 }));
        await new Promise(done => setTimeout(done, 20));
        assert.include(fixture.textContent, 'en construcción'); assert.notExists(fixture.querySelector('atencion-controller'));
    });
    test('Edad: cumpleaños, recién nacido, fecha bisiesta y formato REST sin desfase horario', () => {
        const hoy = new Date(2026, 10, 12);
        assert.equal(calcularEdad('1996-11-13', hoy), 29);
        assert.equal(calcularEdad('1996-11-12', hoy), 30);
        assert.equal(calcularEdad('1996-11-11', hoy), 30);
        assert.equal(calcularEdad('2026-11-12', hoy), 0);
        assert.equal(calcularEdad('1996-11-12T00:00:00Z', hoy), 30);
        assert.equal(calcularEdad('2000-02-29', new Date(2026, 1, 28)), 25);
        assert.equal(calcularEdad('2000-02-29', new Date(2026, 2, 1)), 26);
        for (const fecha of [null, undefined, '', 'sin fecha', '2025-02-29', '2000-13-01', '2000-04-31', '2026-11-13']) {
            assert.isNull(calcularEdad(fecha, hoy));
        }
    });
    test('Finalización exige pasos no vacíos y todos completos; ignora fechaFin', () => {
        const hoy = new Date(2026, 10, 12);
        const consulta = { fechaInicio: '2026-11-01T08:00:00', fechaFin: '2026-11-02T08:00:00' };
        for (const pendientes of [[], null, [{ estado: 'PENDIENTE' }], [{ estado: 'EN_CURSO' }],
            [{ estado: 'CANCELADO' }], [{ estado: 'DESCONOCIDO' }], [{}], [null],
            [{ estado: 'COMPLETADO' }, { estado: 'PENDIENTE' }]]) {
            assert.equal(estadoConsulta(consulta, hoy, pendientes), 'En curso');
        }
        const completos = [{ estado: ' completado ' }, { estado: 'FINALIZADO' }];
        assert.equal(estadoConsulta({ ...consulta, fechaFin: null }, hoy, completos), 'Finalizada');
        assert.equal(estadoConsulta({ ...consulta, fechaFin: '2030-01-01' }, hoy, completos), 'Finalizada');
        assert.equal(estadoConsulta({ ...consulta, fechaInicio: '2030-01-01' }, hoy, []), 'Programada');
    });
    test('Agenda y atención muestran Finalizada con todos los pasos reales completados', async () => {
        consultas[0].fechaFin = null;
        pasos[0].estado = 'COMPLETADO';
        pasos.push({ ...pasos[0], idConsultaProcedimientoPaso: 'paso-2', estado: 'FINALIZADO' });
        router.manejarRuta('/consultas');
        await espera(() => fixture.querySelector('tarjeta-consulta'));
        const tarjeta = fixture.querySelector('tarjeta-consulta');
        assert.equal(tarjeta.shadowRoot.querySelector('.estado').textContent, 'Finalizada');
        assert.equal(tarjeta.pasos.length, 2);
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('.atencion__tabla'));
        assert.equal(fixture.querySelector('.atencion__estado').textContent, 'Finalizada');
    });
    test('Fecha de fin pasada no finaliza agenda ni atención con pasos pendientes', async () => {
        consultas[0].fechaFin = '2020-01-01T08:00:00';
        pasos[0].estado = 'PENDIENTE';
        router.manejarRuta('/consultas');
        await espera(() => fixture.querySelector('tarjeta-consulta'));
        assert.notEqual(fixture.querySelector('tarjeta-consulta').shadowRoot.querySelector('.estado').textContent, 'Finalizada');
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('.atencion__tabla'));
        assert.notEqual(fixture.querySelector('.atencion__estado').textContent, 'Finalizada');
    });
    test('Agrupa por consulta e incluye pasos de todos sus procedimientos', async () => {
        consultas.push({ ...consultas[0], idConsulta: 'consulta-2' });
        pasos[0].estado = 'COMPLETADO';
        pasos.push({ ...pasos[0], idConsultaProcedimientoPaso: 'paso-2', estado: 'PENDIENTE',
            idConsultaProcedimiento: { idConsulta: { idConsulta: 'consulta-1' }, idProcedimiento: { nombre: 'Otro procedimiento' } } });
        pasos.push({ ...pasos[0], idConsultaProcedimientoPaso: 'paso-3',
            idConsultaProcedimiento: { idConsulta: { idConsulta: 'consulta-2' }, idProcedimiento: { nombre: 'Control' } } });
        router.manejarRuta('/consultas');
        await espera(() => fixture.querySelectorAll('tarjeta-consulta').length === 2);
        const tarjetas = [...fixture.querySelectorAll('tarjeta-consulta')];
        assert.notEqual(tarjetas.find(card => card.consulta.idConsulta === 'consulta-1').shadowRoot.querySelector('.estado').textContent, 'Finalizada');
        assert.equal(tarjetas.find(card => card.consulta.idConsulta === 'consulta-2').shadowRoot.querySelector('.estado').textContent, 'Finalizada');
        assert.equal(fetchStub.callCount, 2, 'Una carga paginada de pasos para toda la agenda');
    });
    test('Espera todas las páginas: un pendiente en la segunda impide finalizar', async () => {
        pasos[0].estado = 'COMPLETADO';
        fetchStub.callsFake(async url => {
            const u = new URL(url);
            if (u.pathname.endsWith('/consulta')) return new Response(JSON.stringify(consultas), { status: 200 });
            const first = Number(u.searchParams.get('first'));
            const page = first === 0 ? pasos : [{ ...pasos[0], idConsultaProcedimientoPaso: 'paso-final', estado: 'PENDIENTE' }];
            return new Response(JSON.stringify(page), { status: 200, headers: { 'Total-registros': '2' } });
        });
        router.manejarRuta('/consultas');
        await espera(() => fixture.querySelector('tarjeta-consulta'));
        const card = fixture.querySelector('tarjeta-consulta');
        assert.notEqual(card.shadowRoot.querySelector('.estado').textContent, 'Finalizada');
        assert.equal(card.pasos.length, 2); assert.equal(fetchStub.callCount, 3);
    });
    test('Fallo del REST de pasos no muestra una finalización basada en fechas', async () => {
        consultas[0].fechaFin = '2020-01-01T08:00:00';
        fetchStub.onSecondCall().resolves(new Response('', { status: 500 }));
        router.manejarRuta('/consultas');
        await espera(() => fixture.querySelector('.aviso--error'));
        assert.notExists(fixture.querySelector('tarjeta-consulta'));
    });
    test('Fallo de verificación en atención deja el estado no disponible', async () => {
        consultas[0].fechaFin = '2020-01-01T08:00:00';
        fetchStub.onSecondCall().resolves(new Response('', { status: 500 }));
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('[role=alert]'));
        assert.equal(fixture.querySelector('.atencion__estado').textContent, 'No se pudo verificar');
    });
    test('Observaciones se cargan desde consulta en TextArea nativo de solo lectura', async () => {
        consultas[0].observaciones = 'Primera línea\nSegunda línea <img src=x onerror=alert(1)>';
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('.atencion__tabla'));
        const field = fixture.querySelector('atencion-controller').observaciones;
        assert.equal(field.getValue(), consultas[0].observaciones);
        assert.equal(field.control.value, consultas[0].observaciones);
        assert.equal(field.control.name, 'observaciones');
        assert.isTrue(field.control.readOnly); assert.isFalse(field.control.disabled);
        assert.equal(field.label.firstElementChild.textContent, 'Observaciones de la consulta');
        assert.isTrue(field.required.hidden);
        assert.equal(field.counter.textContent, `${consultas[0].observaciones.length} caracteres`);
        assert.notExists(fixture.querySelector('img'));
        assert.equal(fetchStub.callCount, 2, 'Solo los GET existentes de consulta y pasos');
    });
    test('Observaciones nulas o ausentes muestran campo vacío sin texto inventado', async () => {
        for (const value of [null, undefined, '']) {
            consultas[0].observaciones = value;
            router.manejarRuta('/atencion/consulta-1');
            await espera(() => fixture.querySelector('.atencion__tabla'));
            const field = fixture.querySelector('atencion-controller').observaciones;
            assert.equal(field.getValue(), ''); assert.equal(field.control.placeholder, 'Sin observaciones registradas.');
            assert.equal(field.counter.textContent, '0 caracteres');
        }
    });
    test('Reintentar conserva las observaciones si falla la carga de pasos y reemplaza la instancia', async () => {
        consultas[0].observaciones = 'Observación recibida del servicio';
        fetchStub.onSecondCall().resolves(new Response('', { status: 500 }));
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('[role=alert]'));
        const controller = fixture.querySelector('atencion-controller'), previous = controller.observaciones;
        assert.equal(previous.getValue(), consultas[0].observaciones);
        [...fixture.querySelectorAll('button')].find(button => button.textContent === 'Reintentar').click();
        await espera(() => fixture.querySelector('.atencion__tabla'));
        assert.isTrue(previous.destroyed); assert.isNull(previous.observer);
        assert.notStrictEqual(controller.observaciones, previous);
        assert.equal(controller.observaciones.getValue(), consultas[0].observaciones);
        assert.lengthOf(fixture.querySelectorAll('galeno-textarea'), 1);
    });
    test('Salir de atención destruye el TextArea y libera su observador', async () => {
        consultas[0].observaciones = 'Nota del servicio';
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('.atencion__tabla'));
        const controller = fixture.querySelector('atencion-controller'), field = controller.observaciones;
        router.manejarRuta('/citas');
        assert.isTrue(field.destroyed); assert.isNull(field.observer); assert.isNull(controller.observaciones);
        assert.notExists(fixture.querySelector('galeno-textarea'));
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
