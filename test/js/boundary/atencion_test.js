import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { crearRouter } from '../../../src/js/router.js';
import { calcularEdad, estadoConsulta } from '../../../src/js/control/fechas.js';
import { guardarCamposAtencion } from '../../../src/js/control/atencion_service.js';

mocha.setup('tdd');
suite('Consulta → Atención SPA (REST simulado solo en pruebas)', () => {
    let sandbox, fixture, router, consultas, pasos, fetchStub, originalURL, configuraciones, ordenes, resultados, responder, documentos;
    const usuario = { idPersonaRol: 'doctor-1', idPersona: { nombres: 'Doctor' }, idRol: { idRol: 'medico', nombre: 'Doctor' }, idClinica: { idClinica: 'clinica-1' } };
    const espera = async predicate => {
        for (let i = 0; i < 50 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.isTrue(!!predicate(), 'La pantalla termina de cargar');
    };
    setup(() => {
        originalURL = location.href;
        sandbox = sinon.createSandbox();
        consultas = [{ idConsulta: 'consulta-1', fechaInicio: '2026-11-12T08:00:00-06:00',
            idPersonaRol: { idPersonaRol: 'paciente-1', idClinica: { idClinica: 'clinica-1' },
                idPersona: { idPersona: 'persona-1', nombres: 'Ana', apellidos: 'López', fechaNacimiento: `${new Date().getFullYear() - 30}-01-01` } } }];
        pasos = [{ idConsultaProcedimientoPaso: 'paso-1', estado: 'EN_CURSO',
            idConsultaProcedimiento: { idConsultaProcedimiento: 'cp-1', idConsulta: consultas[0], idProcedimiento: { idProcedimiento: 'proc-1', nombre: 'Control médico' } },
            idPersonaRol: usuario, idProcedimientoPaso: { idProcedimientoPaso: 'def-1', nombre: 'Evaluación', idRol: usuario.idRol } }];
        configuraciones = []; ordenes = []; resultados = []; documentos = [];
        responder = async (url, options) => {
            const ruta = new URL(url).pathname.split('/resources/v1/')[1];
            const recursos = { consulta: consultas, consulta_procedimiento_paso: pasos, documento: documentos,
                consulta_procedimiento: consultas.map(c => ({ idConsultaProcedimiento: `cp-${c.idConsulta}`, idConsulta: c, idProcedimiento: { idProcedimiento: 'proc-1', nombre: 'Control médico' } })),
                procedimiento_paso_examen: configuraciones, orden_examen: ordenes, examen_resultado: resultados,
                'procedimiento_paso/procedimiento/proc-1': [{ idProcedimientoPaso: 'def-1', nombre: 'Evaluación', idRol: usuario.idRol }] };
            const [recurso, id] = ruta.split('/');
            if (options.method === 'POST') {
                assert.equal(recurso, 'examen_resultado');
                const body = JSON.parse(options.body);
                const data = { ...body, idOrdenExamen: ordenes.find(o => o.idOrdenExamen === body.idOrdenExamen.idOrdenExamen), idExamenResultado: 'nuevo-resultado' }; resultados.push(data);
                return new Response(null, { status: 201 });
            }
            if (options.method === 'PUT') {
                assert.include(['consulta', 'consulta_procedimiento_paso', 'orden_examen', 'examen_resultado'], recurso);
                const data = JSON.parse(options.body);
                const keys = { consulta: 'idConsulta', consulta_procedimiento_paso: 'idConsultaProcedimientoPaso', orden_examen: 'idOrdenExamen', examen_resultado: 'idExamenResultado' };
                const registro = recursos[recurso].find(r => r[keys[recurso]] === id); Object.assign(registro, data);
                return new Response(JSON.stringify(data));
            }
            assert.equal(options.method, 'GET');
            let data = recursos[ruta];
            if (data === undefined && recursos[recurso]) data = recursos[recurso].find(r => Object.values(r).includes(id));
            assert.exists(data, `Endpoint existente simulado: ${ruta}`);
            if (!Array.isArray(data)) return new Response(JSON.stringify(data));
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Total-registros': String(data.length) } });
        };
        fetchStub = sandbox.stub(window, 'fetch').callsFake(responder);
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
        assert.include(fixture.textContent, 'Ana López'); assert.notExists(fixture.querySelector('.atencion__tabla'));
    });
    test('Respuesta tardía no reemplaza la siguiente pantalla', async () => {
        let resolve;
        fetchStub.onFirstCall().returns(new Promise(done => { resolve = done; }));
        router.manejarRuta('/atencion/consulta-1');
        router.manejarRuta('/citas');
        resolve(new Response(JSON.stringify(consultas), { status: 200 }));
        await new Promise(done => setTimeout(done, 20));
        assert.exists(fixture.querySelector('galeno-citas')); assert.notExists(fixture.querySelector('atencion-controller'));
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
        assert.equal(fetchStub.getCalls().filter(c => new URL(c.args[0]).pathname.endsWith('/consulta_procedimiento_paso')).length, 1, 'Una carga paginada de pasos para toda la agenda');
    });
    test('Espera todas las páginas: un pendiente en la segunda impide finalizar', async () => {
        pasos[0].estado = 'COMPLETADO';
        fetchStub.callsFake(async (url, options) => {
            const u = new URL(url);
            if (!u.pathname.endsWith('/consulta_procedimiento_paso')) return responder(url, options);
            const first = Number(u.searchParams.get('first'));
            const page = first === 0 ? pasos : [{ ...pasos[0], idConsultaProcedimientoPaso: 'paso-final', estado: 'PENDIENTE' }];
            return new Response(JSON.stringify(page), { status: 200, headers: { 'Total-registros': '2' } });
        });
        router.manejarRuta('/consultas');
        await espera(() => fixture.querySelector('tarjeta-consulta'));
        const card = fixture.querySelector('tarjeta-consulta');
        assert.notEqual(card.shadowRoot.querySelector('.estado').textContent, 'Finalizada');
        assert.equal(card.pasos.length, 2);
        assert.equal(fetchStub.getCalls().filter(c => new URL(c.args[0]).pathname.endsWith('/consulta_procedimiento_paso')).length, 2);
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
    test('Observaciones se cargan desde consulta y son editables para el rol participante', async () => {
        consultas[0].observaciones = 'Primera línea\nSegunda línea <img src=x onerror=alert(1)>';
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        const field = fixture.querySelector('atencion-controller').observaciones;
        assert.equal(field.getValue(), consultas[0].observaciones);
        assert.equal(field.control.value, consultas[0].observaciones);
        assert.equal(field.control.name, 'observaciones');
        assert.isFalse(field.control.readOnly); assert.isFalse(field.control.disabled);
        assert.equal(field.label.firstElementChild.textContent, 'Observaciones de la consulta');
        assert.isTrue(field.required.hidden);
        assert.equal(field.counter.textContent, `${consultas[0].observaciones.length} caracteres`);
        assert.notExists(fixture.querySelector('img'));
        assert.isTrue(fetchStub.getCalls().every(c => c.args[1].method === 'GET'), 'Cargar no guarda registros');
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
        assert.lengthOf(fixture.querySelectorAll('.atencion__observaciones galeno-textarea'), 1);
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
    async function cargar() {
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        return fixture.querySelector('atencion-controller');
    }
    test('Encabezado encima del Wizard muestra iniciales, nombre y edad del paciente', async () => {
        Object.assign(consultas[0].idPersonaRol.idPersona, { nombres: '  Ana María ', apellidos: ' López Pérez ' });
        const controller = await cargar(), header = controller.querySelector('.atencion__paciente');
        assert.equal(header.querySelector('.atencion__paciente-avatar').textContent, 'AL');
        assert.equal(header.querySelector('.atencion__paciente-avatar').getAttribute('aria-hidden'), 'true');
        assert.include(header.querySelector('.atencion__paciente-nombre').textContent, 'Ana María');
        assert.equal(header.querySelector('.atencion__paciente-edad').textContent, 'Edad: 30 años');
        assert.strictEqual(header.nextElementSibling, controller.querySelector('.atencion__wizard'));
        assert.equal(getComputedStyle(header.querySelector('.atencion__paciente-identidad')).flexDirection, 'column');
        await controller.wizard.goToStep('cierre'); assert.isFalse(header.hidden);
    });
    test('Documento opcional muestra solo uno que pertenezca al paciente, con tipo y valor seguros', async () => {
        documentos = [{ idDocumento: 'ajeno', idPersona: { idPersona: 'doctor-1' }, valor: 'NO MOSTRAR' },
            { idDocumento: 'vacio', idPersona: { idPersona: 'persona-1' }, valor: ' ' },
            { idDocumento: 'dui', idPersona: { idPersona: 'persona-1' }, idTipoDocumento: { nombre: 'DUI' }, valor: '12345678-9' },
            { idDocumento: 'otro', idPersona: { idPersona: 'persona-1' }, valor: 'OTRO DOCUMENTO' }];
        const controller = await cargar();
        await espera(() => controller.querySelector('.atencion__paciente-documento').textContent.includes('12345678-9'));
        assert.equal(controller.querySelector('.atencion__paciente-documento').textContent, 'DUI: 12345678-9');
        assert.notInclude(controller.querySelector('.atencion__paciente').textContent, 'NO MOSTRAR');
        assert.notInclude(controller.querySelector('.atencion__paciente').textContent, 'OTRO DOCUMENTO');
    });
    test('Sin documento o si falla su carga, el encabezado y la atención siguen disponibles', async () => {
        const controller = await cargar(); assert.equal(controller.querySelector('.atencion__paciente-documento').textContent, 'Sin documentos registrados.');
        fetchStub.withArgs(sinon.match('/documento?')).resolves(new Response('', { status: 500 }));
        await controller.cargar();
        assert.exists(controller.wizard); assert.exists(controller.detalle);
        assert.equal(controller.querySelector('.atencion__paciente-documento').textContent, 'No se pudo cargar el documento.');
        assert.exists(controller.querySelector('.atencion__paciente-reintentar'));
        assert.notExists(controller.querySelector('.aviso--error[role=alert]'));
    });
    test('Identidad incompleta no inventa nombre, edad ni documentos', async () => {
        consultas[0].idPersonaRol.idPersona = {};
        const controller = await cargar(), header = controller.querySelector('.atencion__paciente');
        assert.equal(header.querySelector('.atencion__paciente-avatar').textContent, '?');
        assert.equal(header.querySelector('.atencion__paciente-nombre').textContent, 'Nombre no disponible');
        assert.equal(header.querySelector('.atencion__paciente-edad').textContent, 'Edad: No disponible');
        assert.isFalse(fetchStub.getCalls().some(c => new URL(c.args[0]).pathname.endsWith('/documento')));
    });
    test('Respuesta tardía de documentos no reemplaza la identidad de la nueva carga', async () => {
        let resolver;
        fetchStub.withArgs(sinon.match('/documento?')).onFirstCall().returns(new Promise(resolve => { resolver = resolve; }));
        const controller = await cargar();
        consultas[0].idPersonaRol.idPersona = { idPersona: 'persona-2', nombres: 'Luis', apellidos: 'Pérez' };
        await controller.cargar();
        resolver(new Response(JSON.stringify([{ idDocumento: 'viejo', idPersona: { idPersona: 'persona-1' }, valor: 'DOCUMENTO ANTERIOR' }])));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(controller.querySelector('.atencion__paciente-avatar').textContent, 'LP');
        assert.equal(controller.querySelector('.atencion__paciente-documento').textContent, 'Sin documentos registrados.');
        assert.notInclude(controller.querySelector('.atencion__paciente').textContent, 'DOCUMENTO ANTERIOR');
    });
    test('Documento encontrado no espera otras páginas que podrían fallar', async () => {
        fetchStub.withArgs(sinon.match('/documento?')).callsFake(async url => {
            assert.equal(new URL(url).searchParams.get('first'), '0');
            return new Response(JSON.stringify([{ idDocumento: 'dui', idPersona: { idPersona: 'persona-1' }, valor: '12345678-9' }]), { headers: { 'Total-registros': '100' } });
        });
        const controller = await cargar();
        await espera(() => controller.querySelector('.atencion__paciente-documento').textContent.includes('12345678-9'));
        assert.lengthOf(fetchStub.getCalls().filter(c => c.args[0].includes('/documento?')), 1);
    });
    test('Busca en páginas siguientes y admite la relación de persona como UUID', async () => {
        fetchStub.withArgs(sinon.match('/documento?')).callsFake(async url => {
            const first = Number(new URL(url).searchParams.get('first'));
            const rows = first === 0 ? Array.from({ length: 50 }, (_, i) => ({ idDocumento: `ajeno-${i}`, idPersona: 'otra-persona', valor: 'NO MOSTRAR' })) :
                [{ idDocumento: 'propio', idPersona: ' PERSONA-1 ', valor: '98765432-1' }];
            return new Response(JSON.stringify(rows), { headers: { 'Total-registros': '51' } });
        });
        const controller = await cargar();
        await espera(() => controller.querySelector('.atencion__paciente-documento').textContent.includes('98765432-1'));
        assert.notInclude(controller.querySelector('.atencion__paciente').textContent, 'NO MOSTRAR');
    });
    test('Reintentar documento recupera el dato sin reconstruir Wizard ni perder borradores', async () => {
        fetchStub.withArgs(sinon.match('/documento?')).resolves(new Response('', { status: 500 }));
        const controller = await cargar(), wizard = controller.wizard;
        controller.observaciones.setValue('Mi borrador');
        fetchStub.withArgs(sinon.match('/documento?')).resolves(new Response(JSON.stringify([{ idDocumento: 'dui', idPersona: { idPersona: 'persona-1' }, valor: '12345678-9' }])));
        controller.querySelector('.atencion__paciente-reintentar').click();
        await espera(() => controller.querySelector('.atencion__paciente-documento').textContent.includes('12345678-9'));
        assert.strictEqual(controller.wizard, wizard); assert.equal(controller.observaciones.getValue(), 'Mi borrador');
        assert.notExists(controller.querySelector('.atencion__paciente-reintentar'));
    });
    function examenes() {
        configuraciones = [{ idProcedimientoPasoExamen: 'config-1', activo: true,
            idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex-1', nombre: 'Hemograma', activo: true } }];
        ordenes = [{ idOrdenExamen: 'orden-1', fechaCreacion: '2026-11-12T08:00:00-06:00', indicaciones: 'Indicaciones existentes', idConsultaProcedimientoPaso: pasos[0] }];
        resultados = [{ idExamenResultado: 'resultado-1', idOrdenExamen: ordenes[0], resultado: 'Resultado existente', interpretacion: 'Interpretación existente', rutaAtestado: 'archivo.pdf' }];
    }
    test('Wizard contiene los siete apartados en orden y conserva el contenido al navegar', async () => {
        const controller = await cargar(), wizard = controller.wizard;
        assert.deepEqual(wizard.getSteps().map(s => s.title), ['Información general', 'Procedimientos', 'Pasos de atención',
            'Exámenes disponibles', 'Órdenes de examen', 'Resultados de exámenes', 'Observaciones y cierre']);
        assert.equal(wizard.getCurrentStep().id, 'registro');
        assert.equal(wizard.forward.textContent, 'Siguiente');
        const valor = controller.querySelector('.atencion__pasos textarea'); valor.value = 'Borrador';
        await wizard.goToStep('pasos'); await wizard.goToStep('cierre'); await wizard.previous(); await wizard.goToStep('pasos');
        assert.strictEqual(controller.querySelector('.atencion__pasos textarea'), valor); assert.equal(valor.value, 'Borrador');
        assert.isTrue(fetchStub.getCalls().every(c => c.args[1].method === 'GET'));
    });
    test('Información general muestra fechas, referencia y responsable del registro, no al paciente como empleado', async () => {
        consultas[0].referenciaExterna = 'REF-123'; consultas[0].fechaFin = '2026-11-12T09:00:00-06:00';
        const controller = await cargar();
        assert.include(controller.apartados[0].textContent, 'REF-123');
        assert.include(controller.apartados[0].textContent, 'Fecha de finalización');
        assert.equal(controller.querySelector('.atencion__responsables').textContent, 'Doctor');
    });
    test('Procedimientos sin ejecución se cargan del recurso de asignaciones', async () => {
        pasos = [];
        const controller = await cargar();
        assert.include(controller.apartados[1].textContent, 'Control médico');
        assert.notExists(controller.querySelector('.atencion__pasos tbody'));
    });
    test('Solo muestra configuraciones activas relacionadas, y órdenes y resultados de la consulta', async () => {
        examenes();
        configuraciones.push({ ...configuraciones[0], idProcedimientoPasoExamen: 'inactiva', activo: false },
            { ...configuraciones[0], idProcedimientoPasoExamen: 'otro', idProcedimientoPaso: { idProcedimientoPaso: 'otro' } },
            { ...configuraciones[0], idProcedimientoPasoExamen: 'ex-inactivo', idExamen: { ...configuraciones[0].idExamen, activo: false } });
        ordenes.push({ idOrdenExamen: 'ajena', idConsultaProcedimientoPaso: { idConsultaProcedimiento: { idConsulta: { idConsulta: 'otra' } } } });
        resultados.push({ idExamenResultado: 'ajeno', idOrdenExamen: ordenes[1], resultado: 'NO MOSTRAR' });
        const controller = await cargar();
        assert.lengthOf(controller.apartados[3].querySelectorAll('input[type=checkbox]'), 1);
        assert.include(controller.apartados[4].textContent, 'Orden orden-1'); assert.notInclude(controller.apartados[4].textContent, 'Orden ajena');
        assert.notInclude(controller.apartados[5].textContent, 'NO MOSTRAR');
        assert.isTrue(controller.apartados[5].querySelector('input[type=file]').disabled);
    });
    test('Checkbox genera borrador de indicaciones y conserva texto al desmarcar, sin enviar órdenes incompletas', async () => {
        examenes(); const controller = await cargar();
        const checkbox = controller.apartados[3].querySelector('input'); checkbox.click();
        const texto = controller.borradores.querySelector('textarea'); texto.value = 'Indicación local';
        checkbox.click(); assert.isTrue(controller.borradores.firstElementChild.hidden);
        checkbox.click(); assert.equal(controller.borradores.querySelector('textarea').value, 'Indicación local');
        assert.isFalse(controller.validarCierre().valid);
        assert.isTrue(fetchStub.getCalls().every(c => c.args[1].method === 'GET'));
    });
    test('Guardar valor conserva responsable, fechas y estado, sin duplicar solicitudes por doble clic', async () => {
        pasos[0].fechaInicio = '2026-11-12T08:00:00-06:00';
        const controller = await cargar();
        const campo = controller.apartados[2].querySelector('textarea'); campo.value = 'Atención brindada';
        const button = controller.apartados[2].querySelector('.atencion__boton'); button.click(); button.click();
        await espera(() => controller.apartados[2].textContent.includes('Cambios guardados'));
        const puts = fetchStub.getCalls().filter(c => c.args[1].method === 'PUT'); assert.lengthOf(puts, 1);
        const payload = JSON.parse(puts[0].args[1].body);
        assert.equal(payload.valor, 'Atención brindada'); assert.equal(payload.estado, 'EN_CURSO');
        assert.equal(payload.idPersonaRol.idPersonaRol, 'doctor-1'); assert.equal(payload.fechaInicio, pasos[0].fechaInicio);
    });
    test('Guarda indicaciones, resultado e interpretación de registros existentes', async () => {
        examenes(); const controller = await cargar();
        controller.apartados[4].querySelector('textarea').value = 'Nuevas indicaciones';
        controller.apartados[4].querySelector('.atencion__boton').click();
        await espera(() => controller.apartados[4].textContent.includes('Cambios guardados'));
        const fields = controller.apartados[5].querySelectorAll('textarea'); fields[0].value = 'Nuevo resultado'; fields[1].value = 'Nueva interpretación';
        controller.apartados[5].querySelector('.atencion__boton').click();
        await espera(() => controller.apartados[5].textContent.includes('Cambios guardados'));
        assert.equal(ordenes[0].indicaciones, 'Nuevas indicaciones');
        assert.equal(resultados[0].resultado, 'Nuevo resultado'); assert.equal(resultados[0].interpretacion, 'Nueva interpretación');
        assert.equal(resultados[0].rutaAtestado, 'archivo.pdf');
    });
    test('Registra resultado para una orden existente y luego permite editarlo con PUT', async () => {
        examenes(); resultados = []; const controller = await cargar();
        const fields = controller.apartados[5].querySelectorAll('textarea');
        fields[0].value = 'Resultado nuevo'; fields[1].value = 'Interpretación nueva';
        const button = controller.apartados[5].querySelector('.atencion__boton'); button.click();
        await espera(() => controller.apartados[5].textContent.includes('Cambios guardados'));
        assert.lengthOf(resultados, 1); assert.equal(resultados[0].idOrdenExamen.idOrdenExamen, 'orden-1');
        fields[0].value = 'Resultado corregido'; button.click();
        await espera(() => resultados[0].resultado === 'Resultado corregido' && !button.disabled);
        assert.lengthOf(fetchStub.getCalls().filter(c => c.args[1].method === 'POST'), 1);
        assert.lengthOf(fetchStub.getCalls().filter(c => c.args[1].method === 'PUT'), 1);
    });
    test('POST confirmado sin poder recuperar UUID no ofrece repetir la creación', async () => {
        examenes(); resultados = []; const controller = await cargar();
        let creado = false;
        fetchStub.callsFake(async (url, options) => {
            if (new URL(url).pathname.endsWith('/examen_resultado') && options.method === 'GET' && creado) return new Response('', { status: 500 });
            const response = await responder(url, options);
            if (options.method === 'POST') creado = true;
            return response;
        });
        controller.apartados[5].querySelector('textarea').value = 'Resultado confirmado';
        const button = controller.apartados[5].querySelector('.atencion__boton'); button.click();
        await espera(() => controller.apartados[5].textContent.includes('Resultado registrado. Vuelve'));
        assert.isTrue(button.disabled); assert.lengthOf(resultados, 1);
        button.click(); assert.lengthOf(fetchStub.getCalls().filter(c => c.args[1].method === 'POST'), 1);
    });
    test('Guarda observaciones sin cambiar otros campos de consulta y bloquea cierre con borradores', async () => {
        consultas[0].referenciaExterna = 'REF'; const controller = await cargar();
        controller.observaciones.setValue('Observaciones actualizadas'); assert.isFalse(controller.validarCierre().valid);
        controller.apartados[6].querySelector('.atencion__boton').click();
        await espera(() => controller.apartados[6].textContent.includes('Cambios guardados'));
        assert.equal(consultas[0].observaciones, 'Observaciones actualizadas'); assert.equal(consultas[0].referenciaExterna, 'REF');
        assert.isTrue(controller.validarCierre().valid);
    });
    test('Error al guardar conserva texto y permite reintentar sin anunciar éxito', async () => {
        const controller = await cargar();
        controller.observaciones.setValue('Borrador conservado');
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).resolves(new Response('', { status: 500 }));
        const boton = controller.apartados[6].querySelector('.atencion__boton'); boton.click();
        await espera(() => controller.apartados[6].textContent.includes('Error del servidor'));
        assert.equal(controller.observaciones.getValue(), 'Borrador conservado'); assert.isFalse(boton.disabled);
        assert.isFalse(controller.validarCierre().valid);
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).callsFake(responder);
        boton.click(); await espera(() => controller.apartados[6].textContent.includes('Cambios guardados'));
    });
    test('Campos de otros roles se muestran solo lectura y el servicio rechaza escribirlos', async () => {
        pasos[0].idProcedimientoPaso.idRol = { idRol: 'otro' }; const controller = await cargar();
        assert.isTrue(controller.apartados[2].querySelector('textarea').readOnly);
        assert.notExists(controller.apartados[2].querySelector('.atencion__boton'));
        let error;
        try { await guardarCamposAtencion('consulta_procedimiento_paso', pasos[0], { valor: 'No permitido' }, usuario, 'consulta-1'); } catch (e) { error = e; }
        assert.include(error.message, 'rol o a la clínica');
        assert.isFalse(fetchStub.getCalls().some(c => c.args[1].method === 'PUT'));
    });
    test('El guardado rechaza otra clínica y campos ajenos al contrato', async () => {
        for (const [cambios, contexto] of [[{ valor: 'No permitido' }, { ...usuario, idClinica: { idClinica: 'otra' } }],
            [{ estado: 'COMPLETADO' }, usuario]]) {
            let error;
            try { await guardarCamposAtencion('consulta_procedimiento_paso', pasos[0], cambios, contexto, 'consulta-1'); } catch (e) { error = e; }
            assert.instanceOf(error, Error);
        }
        assert.isFalse(fetchStub.getCalls().some(c => c.args[1].method === 'PUT'));
    });
    test('El Wizard y la tabla no provocan desbordamiento horizontal de la vista', async () => {
        examenes(); const controller = await cargar();
        controller.parentElement.style.maxWidth = '100%';
        await controller.wizard.goToStep('pasos');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        assert.isAtMost(controller.scrollWidth, controller.clientWidth + 1);
        assert.isAtMost(controller.wizard.root.scrollWidth, controller.wizard.root.clientWidth + 1);
        assert.equal(getComputedStyle(controller.querySelector('.atencion__tabla')).overflowX, 'auto');
    });
    test('Conflicto concurrente no sobrescribe un valor cambiado en el servidor', async () => {
        pasos[0].valor = 'Inicial'; const controller = await cargar();
        controller.apartados[2].querySelector('textarea').value = 'Mi cambio'; pasos[0].valor = 'Cambio de otra sesión';
        controller.apartados[2].querySelector('.atencion__boton').click();
        await espera(() => controller.apartados[2].textContent.includes('cambió en el servidor'));
        assert.equal(pasos[0].valor, 'Cambio de otra sesión');
        assert.isFalse(fetchStub.getCalls().some(c => c.args[1].method === 'PUT'));
    });
    test('Fallo de complementos conserva pasos verificados y bloquea el cierre', async () => {
        fetchStub.withArgs(sinon.match('/procedimiento_paso_examen?')).resolves(new Response('', { status: 500 }));
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('[role=alert]'));
        const controller = fixture.querySelector('atencion-controller');
        assert.exists(controller.querySelector('.atencion__tabla'));
        assert.equal(controller.querySelector('.atencion__estado').textContent, 'En curso');
        assert.isFalse(controller.validarCierre().valid); assert.isTrue(controller.observaciones.control.readOnly);
    });
    test('Finalizar vuelve a verificar pasos y no cierra pendientes ni inventa estados', async () => {
        const controller = await cargar();
        await controller.wizard.goToStep('cierre'); assert.isFalse(await controller.wizard.next());
        assert.include(controller.mensajeCierre.textContent, 'Completa todos los pasos');
        assert.notExists(consultas[0].fechaFin);
        assert.isFalse(fetchStub.getCalls().some(c => c.args[1].method === 'PUT'));
    });
    test('Finalizar guarda fechaFin con todos los pasos completos y bloquea doble finalización', async () => {
        pasos[0].estado = 'COMPLETADO'; const controller = await cargar();
        await controller.wizard.goToStep('cierre'); assert.isTrue(await controller.wizard.next());
        assert.isTrue(Number.isFinite(Date.parse(consultas[0].fechaFin)));
        assert.include(controller.mensajeCierre.textContent, 'Consulta finalizada');
        assert.equal(pasos[0].estado, 'COMPLETADO'); assert.isFalse(await controller.wizard.next());
        assert.lengthOf(fetchStub.getCalls().filter(c => c.args[1].method === 'PUT'), 1);
    });
    test('Salir destruye Wizard y todos los TextAreas sin respuesta tardía sobre otra vista', async () => {
        examenes(); const controller = await cargar(), wizard = controller.wizard, campos = [...controller.campos];
        router.manejarRuta('/citas');
        assert.isTrue(wizard.destroyed); assert.isNull(wizard.carouselObserver);
        assert.isTrue(campos.every(c => c.destroyed && c.observer === null));
        assert.isNull(controller.wizard); assert.notExists(fixture.querySelector('galeno-wizard'));
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
