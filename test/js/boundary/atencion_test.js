import { filtrarRelacionesFixture } from '../control/relaciones_fixture.js';
import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { crearRouter } from '../../../src/js/router.js';
import { Toast } from '../../../src/js/boundary/componentes/feedback/index.js';
import { pruebasProcedimientos } from '../control/atencion_procedimientos_test.js';
import { pruebasDocumentoPaciente } from '../control/atencion_consulta_documento_test.js';
import { pruebasOrdenesExamen } from '../control/ordenes_examen_test.js';
import { pruebasRetrocesoAtencion } from '../control/retroceso_atencion_test.js';
import AtencionFlujo from '../../../src/js/boundary/vistas/atencion_flujo.js';

mocha.setup('tdd');
pruebasProcedimientos();
pruebasDocumentoPaciente();
pruebasOrdenesExamen();
pruebasRetrocesoAtencion();
suite('Consulta → Atención SPA (REST simulado solo en pruebas)', () => {
    let sandbox, fixture, router, consultas, pasos, fetchStub, originalURL, configuraciones, ordenes, resultados, responder, documentos, secuencias, procedimientos, catalogos, confirmacionStub, retrocesoStub, invalidadosCamino;
    const usuario = { idPersonaRol: 'doctor-1', idPersona: { nombres: 'Doctor' }, idRol: { idRol: 'medico', nombre: 'Doctor' }, idClinica: { idClinica: 'clinica-1' } };
    const espera = async predicate => {
        for (let i = 0; i < 50 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.isTrue(!!predicate(), 'La pantalla termina de cargar');
    };
    setup(() => {
        originalURL = location.href;
        sandbox = sinon.createSandbox();
        invalidadosCamino = null;
        confirmacionStub = sandbox.stub(AtencionFlujo.prototype, 'confirmarCompletar').resolves(true);
        retrocesoStub = sandbox.stub(AtencionFlujo.prototype, 'confirmarRetroceso').resolves(true);
        sandbox.spy(Toast, 'success'); sandbox.spy(Toast, 'warning'); sandbox.spy(Toast, 'error');
        consultas = [{ idConsulta: 'consulta-1', fechaInicio: '2026-11-12T08:00:00-06:00',
            idPersonaRol: { idPersonaRol: 'paciente-1', idClinica: { idClinica: 'clinica-1' },
                idPersona: { idPersona: 'persona-1', nombres: 'Ana', apellidos: 'López', fechaNacimiento: `${new Date().getFullYear() - 30}-01-01` } } }];
        pasos = [{ idConsultaProcedimientoPaso: 'paso-1', estado: 'EN_PROCESO',
            idConsultaProcedimiento: { idConsultaProcedimiento: 'cp-1', idConsulta: consultas[0], idProcedimiento: { idProcedimiento: 'proc-1', nombre: 'Control médico' } },
            idPersonaRol: usuario, idProcedimientoPaso: { idProcedimientoPaso: 'def-1', nombre: 'Evaluación', idRol: usuario.idRol } }];
        configuraciones = []; ordenes = []; resultados = []; documentos = []; secuencias = []; procedimientos = null; catalogos = {};
        responder = async (url, options) => {
            const ruta = new URL(url).pathname.split('/resources/v1/')[1];
            const recursos = { consulta: consultas, consulta_procedimiento_paso: pasos, documento: documentos,
                consulta_procedimiento: procedimientos ?? consultas.map(c => ({ idConsultaProcedimiento: c.idConsulta === 'consulta-1' ? 'cp-1' : `cp-${c.idConsulta}`, idConsulta: c, idProcedimiento: { idProcedimiento: 'proc-1', nombre: 'Control médico' } })),
                procedimiento_paso_examen: configuraciones, orden_examen: ordenes, examen_resultado: resultados,
                procedimiento_paso_secuencia: secuencias,
                'procedimiento_paso/procedimiento/proc-1': [{ idProcedimientoPaso: 'def-1', nombre: 'Evaluación', idRol: usuario.idRol }], ...catalogos };
            const [recurso, id] = ruta.split('/');
            if (options.method === 'POST') {
                const body = JSON.parse(options.body);
                if (recurso === 'orden_examen') {
                    assert.deepEqual(Object.keys(body).sort(), ['idConsultaProcedimientoPaso', 'indicaciones']);
                    const data = { ...body, idOrdenExamen: '12345678-1234-1234-1234-' + String(ordenes.length + 1).padStart(12, '0'),
                        idConsultaProcedimientoPaso: pasos.find(p => p.idConsultaProcedimientoPaso === body.idConsultaProcedimientoPaso.idConsultaProcedimientoPaso) };
                    ordenes.push(data);
                    return new Response(null, { status: 201, headers: { Location: `${url}/${data.idOrdenExamen}` } });
                }
                assert.equal(recurso, 'examen_resultado');
                const data = { ...body, idOrdenExamen: ordenes.find(o => o.idOrdenExamen === body.idOrdenExamen.idOrdenExamen), idExamenResultado: options.headers['Idempotency-Key'] }; resultados.push(data);
                return new Response(null, { status: 201, headers: { Location: `${url.replace(/\/atencion$/, '')}/${data.idExamenResultado}` } });
            }
            if (options.method === 'PUT') {
                assert.include(['consulta', 'consulta_procedimiento_paso', 'orden_examen', 'examen_resultado'], recurso);
                const data = JSON.parse(options.body);
                const keys = { consulta: 'idConsulta', consulta_procedimiento_paso: 'idConsultaProcedimientoPaso', orden_examen: 'idOrdenExamen', examen_resultado: 'idExamenResultado' };
                const registro = recursos[recurso].find(r => r[keys[recurso]] === id);
                if (ruta.endsWith('/retroceder')) {
                    assert.equal(recurso, 'consulta_procedimiento_paso');
                    assert.deepEqual(Object.keys(data).sort(), ['consulta', 'contexto', 'desde', 'originales', 'originalesOrigen']);
                    const origen = pasos.find(p => p.idConsultaProcedimientoPaso === data.desde);
                    if (origen.idPersonaRol?.idPersonaRol !== data.contexto) return new Response('', { status: 403 });
                    assert.isTrue(secuencias.some(s => s.idProcedimientoPaso.idProcedimientoPaso === registro.idProcedimientoPaso.idProcedimientoPaso &&
                        s.idProcedimientoPasoReferencia.idProcedimientoPaso === pasos.find(p => p.idConsultaProcedimientoPaso === data.desde).idProcedimientoPaso.idProcedimientoPaso));
                    const coincide = (paso, original) => paso.estado === original.estado && (paso.valor ?? null) === original.valor &&
                        (paso.idPersonaRol?.idPersonaRol ?? null) === original.responsable && (paso.fechaFin ?? null) === original.fechaFin;
                    if (!coincide(registro, data.originales) || !coincide(origen, data.originalesOrigen)) return new Response('', { status: 409 });
                    Object.assign(registro, { estado: 'PENDIENTE', fechaFin: null, idPersonaRol: { ...usuario, idPersonaRol: 'responsable-aleatorio',
                        idRol: registro.idProcedimientoPaso.idRol, idPersona: { idPersona: 'persona-aleatoria', nombres: 'Responsable reasignado' } } });
                    origen.idPersonaRol = { ...usuario, idPersonaRol: 'responsable-actual-nuevo', idRol: origen.idProcedimientoPaso.idRol,
                        idPersona: { idPersona: 'persona-actual-nueva', nombres: 'Responsable nuevo del origen' } };
                    return new Response(JSON.stringify({ origen, destino: registro }));
                }
                if (ruta.endsWith('/completar')) {
                    assert.equal(recurso, 'consulta_procedimiento_paso');
                    assert.deepEqual(Object.keys(data).sort(), data.siguiente ? ['consulta', 'contexto', 'originales', 'siguiente', 'valor'] : ['consulta', 'contexto', 'originales', 'valor']);
                    assert.equal(data.contexto, usuario.idPersonaRol); assert.equal(data.consulta, 'consulta-1');
                    if (registro.estado === 'COMPLETADO') {
                        if (registro.valor !== data.valor || registro.idPersonaRol?.idPersonaRol !== usuario.idPersonaRol) return new Response('', { status: 409 });
                    } else {
                        if ((registro.valor ?? null) !== data.originales.valor || (registro.estado ?? null) !== data.originales.estado) return new Response('', { status: 409 });
                        Object.assign(registro, { valor: data.valor, estado: 'COMPLETADO', idPersonaRol: usuario, fechaInicio: registro.fechaInicio || new Date().toISOString(), fechaFin: new Date().toISOString() });
                    }
                    if (registro.idProcedimientoPaso.indicaFin === true) {
                        const confirmados = pasos.filter(p => p.idConsultaProcedimiento.idConsultaProcedimiento === registro.idConsultaProcedimiento.idConsultaProcedimiento);
                        for (const p of confirmados) if (!['COMPLETADO', 'FINALIZADO'].includes(p.estado)) Object.assign(p, { estado: 'INVALIDO' });
                        return new Response(JSON.stringify({ paso: registro, pasos: confirmados }));
                    }
                    if (data.siguiente) {
                        const elegido = pasos.find(p => p.idConsultaProcedimientoPaso === data.siguiente);
                        const alternativas = secuencias.filter(e => e.idProcedimientoPaso.idProcedimientoPaso === registro.idProcedimientoPaso.idProcedimientoPaso)
                            .map(e => e.idProcedimientoPasoReferencia.idProcedimientoPaso);
                        for (const p of pasos) if ((invalidadosCamino || alternativas.filter(id => id !== elegido.idProcedimientoPaso.idProcedimientoPaso)).includes(p.idProcedimientoPaso.idProcedimientoPaso)) p.estado = 'INVALIDO';
                        return new Response(JSON.stringify({ paso: registro, pasos: pasos.filter(p => p.idConsultaProcedimiento.idConsultaProcedimiento === registro.idConsultaProcedimiento.idConsultaProcedimiento) }));
                    }
                    return new Response(JSON.stringify(registro));
                }
                assert.deepEqual(Object.keys(data).sort(), ['cambios', 'consulta', 'contexto', 'originales']);
                assert.equal(data.contexto, usuario.idPersonaRol); assert.equal(data.consulta, 'consulta-1');
                for (const campo of Object.keys(data.cambios)) {
                    if ((registro[campo] ?? null) !== data.originales[campo] && registro[campo] !== data.cambios[campo]) return new Response('', { status: 409 });
                }
                Object.assign(registro, data.cambios);
                return new Response(JSON.stringify(registro));
            }
            assert.equal(options.method, 'GET');
            let data = ruta === 'procedimiento_paso' ? Object.entries(recursos)
                .filter(([path]) => path.startsWith('procedimiento_paso/procedimiento/'))
                .flatMap(([path, defs]) => defs.map(d => ({ ...d, idProcedimiento: { idProcedimiento: path.split('/').pop() } }))) : recursos[ruta];
            if (data === undefined && recursos[recurso]) data = recursos[recurso].find(r => Object.values(r).includes(id));
            if (recurso === 'consulta' && id && data === undefined) return new Response(null, { status: 404 });
            if (ruta === 'documento') {
                const params = new URL(url).searchParams;
                const filtrados = params.has('persona') ? data.filter(d => d.idPersona?.idPersona === params.get('persona')) : data;
                const first = Number(params.get('first') || 0), max = Number(params.get('max') || 50);
                return new Response(JSON.stringify(filtrados.slice(first, first + max)), { headers: { 'Total-registros': String(filtrados.length) } });
            }
            assert.exists(data, `Endpoint existente simulado: ${ruta}`);
            if (!Array.isArray(data)) return new Response(JSON.stringify(data));
            data = filtrarRelacionesFixture(url, data);
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Total-registros': String(data.length) } });
        };
        fetchStub = sandbox.stub(window, 'fetch').callsFake(responder);
        fixture = document.createElement('div');
        document.querySelector('#fixtures').append(fixture);
        const tituloEl = document.createElement('h1'), contenedor = document.createElement('main');
        fixture.append(tituloEl, contenedor);
        router = crearRouter({ contenedor, tituloEl, obtenerUsuario: () => usuario });
    });
    teardown(() => { router.detener(); fixture.remove(); Toast.dismissAll(); sandbox.restore(); history.replaceState({}, '', originalURL); });

    // Las pruebas del antiguo Wizard de siete apartados se sustituyen por el flujo real.
    async function cargar(pasoInicial) {
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        const controller = fixture.querySelector('atencion-controller');
        if (pasoInicial) {
            await espera(() => !controller.flujo.wizard.busy());
            await controller.flujo.wizard.goToStep(pasoInicial);
            controller.flujo.actualizarControles();
        }
        return controller;
    }
    function cadena(cantidad = 3) {
        const p = pasos[0].idConsultaProcedimiento;
        const defs = Array.from({ length: cantidad }, (_, i) => ({ idProcedimientoPaso: `def-${i + 1}`, nombre: `Atención ${i + 1}`, idRol: usuario.idRol }));
        catalogos['procedimiento_paso/procedimiento/proc-1'] = defs;
        pasos = defs.map((d, i) => ({ idConsultaProcedimientoPaso: `paso-${i + 1}`, idConsultaProcedimiento: p, idProcedimientoPaso: d,
            idPersonaRol: usuario, estado: i === 0 ? 'COMPLETADO' : 'PENDIENTE', valor: `Valor ${i + 1}` }));
        secuencias = defs.slice(1).map((d, i) => ({ idProcedimientoPasoSecuencia: `s-${i}`, idProcedimientoPaso: defs[i], idProcedimientoPasoReferencia: d, tipoSecuencia: 'DEPENDIENTE' }));
    }
    const escrituras = () => fetchStub.getCalls().filter(c => c.args[1].method !== 'GET');
    test('Indicador muestra responsable entre nombre y estado y actualiza las reasignaciones', async () => {
        cadena(2); pasos[0].idPersonaRol = { ...usuario, idPersona: { nombres: '<b>Ana</b>', apellidos: 'Pérez' } };
        pasos[1].idPersonaRol = null;
        const c = await cargar('paso-1'), f = c.flujo;
        const linea = f.wizard.steps[0].button.querySelector('.atencion__paso-responsable');
        assert.equal(linea.textContent, '<b>Ana</b> Pérez'); assert.isNull(linea.querySelector('b'));
        const titulo = f.wizard.steps[0].button.querySelector('.wizard__step-title');
        assert.isTrue(!!(titulo.compareDocumentPosition(linea) & Node.DOCUMENT_POSITION_FOLLOWING));
        assert.strictEqual(linea.nextElementSibling, f.wizard.steps[0].stateLabel);
        assert.equal(f.wizard.steps[1].button.querySelector('.atencion__paso-responsable').textContent, 'Sin responsable asignado');
        f.modelos.get('paso-1').paso.idPersonaRol = { ...usuario, idPersona: { nombres: 'Luis', apellidos: 'Gómez' } };
        f.actualizarControles(); f.actualizarControles();
        assert.equal(linea.textContent, 'Luis Gómez'); assert.lengthOf(f.wizard.steps[0].button.querySelectorAll('.atencion__paso-responsable'), 1);
        assert.lengthOf(escrituras(), 0);
    });
    test('Ruta directa abre el paso solicitado y conserva bloqueo por predecesores', async () => {
        cadena(3); router.manejarRuta('/atencion/consulta-1/paso/paso-3');
        await espera(() => fixture.querySelector('atencion-controller')?.flujo?.wizard?.getCurrentStep().id === 'paso-3');
        const c = fixture.querySelector('atencion-controller');
        assert.equal(c.parametros.idPaso, 'paso-3'); assert.isFalse(c.flujo.actual().editable);
        assert.lengthOf(escrituras(), 0);
    });
    test('Ruta directa selecciona el procedimiento al que pertenece la ejecución', async () => {
        cadena(2); const base = pasos[0].idConsultaProcedimiento;
        const otro = { ...base, idConsultaProcedimiento: 'cp-2', idProcedimiento: { idProcedimiento: 'proc-2', nombre: 'Otro procedimiento' } };
        const definicion = { idProcedimientoPaso: 'def-otro', nombre: 'Paso destino', idRol: usuario.idRol };
        procedimientos = [base, otro]; catalogos['procedimiento_paso/procedimiento/proc-2'] = [definicion];
        pasos.push({ idConsultaProcedimientoPaso: 'paso-otro', idConsultaProcedimiento: otro, idProcedimientoPaso: definicion,
            idPersonaRol: usuario, estado: 'PENDIENTE', valor: '' });
        router.manejarRuta('/atencion/consulta-1/paso/paso-otro');
        await espera(() => fixture.querySelector('atencion-controller')?.flujo?.wizard?.getCurrentStep().id === 'paso-otro');
        const c = fixture.querySelector('atencion-controller');
        assert.equal(c.procedimientoSeleccionado, 'cp-2'); assert.equal(c.querySelector('.atencion__elegir-procedimiento').value, 'cp-2');
        assert.lengthOf(escrituras(), 0);
    });
    test('Ruta directa permite revisar completado propio sin reabrirlo', async () => {
        cadena(3); router.manejarRuta('/atencion/consulta-1/paso/paso-1');
        await espera(() => fixture.querySelector('atencion-controller')?.flujo?.wizard);
        const c = fixture.querySelector('atencion-controller'); await espera(() => !c.flujo.wizard.busy());
        assert.equal(c.flujo.actual().paso.idConsultaProcedimientoPaso, 'paso-1'); assert.isFalse(c.flujo.actual().editable);
        assert.lengthOf(escrituras(), 0);
    });
    test('Ruta directa rechaza ejecución ajena, inexistente o invalidada', async () => {
        for (const tipo of ['ajeno', 'ausente', 'invalidado']) {
            cadena(3); if (tipo === 'ajeno') pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro' };
            if (tipo === 'invalidado') pasos[1].estado = 'INVALIDO';
            router.manejarRuta('/atencion/consulta-1/paso/' + (tipo === 'ausente' ? 'no-existe' : 'paso-2'));
            await espera(() => fixture.querySelector('atencion-controller')?.detalle);
            const c = fixture.querySelector('atencion-controller');
            assert.include(c.selectorHost.textContent, 'no está disponible'); assert.notExists(c.flujo.wizard);
        }
        assert.lengthOf(escrituras(), 0);
    });
    test('Ruta directa revela rama del paso propio sin confirmar caminos ni habilitar edición', async () => {
        cadena(3); secuencias = [2,3].map(i => ({ idProcedimientoPasoSecuencia: 'rama-' + i,
            idProcedimientoPaso: pasos[0].idProcedimientoPaso, idProcedimientoPasoReferencia: pasos[i-1].idProcedimientoPaso }));
        router.manejarRuta('/atencion/consulta-1/paso/paso-3');
        await espera(() => fixture.querySelector('atencion-controller')?.flujo?.wizard?.getCurrentStep().id === 'paso-3');
        const c = fixture.querySelector('atencion-controller'); assert.isFalse(c.flujo.actual().editable); assert.lengthOf(escrituras(), 0);
    });
    test('Al abrir prioriza el pendiente propio habilitado sobre un paso propio ya completado', async () => {
        cadena(3);
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-2');
        assert.equal(f.actual().paso.idPersonaRol.idPersonaRol, usuario.idPersonaRol);
        assert.isTrue(f.actual().editable); assert.isFalse(f.actual().valor.control.readOnly);
        assert.equal(c.querySelector('.atencion__estado-atencion').textContent, 'PENDIENTE');
        assert.lengthOf(escrituras(), 0);
    });
    test('Al abrir una consulta completada selecciona el paso propio más avanzado según la secuencia', async () => {
        cadena(3); pasos.forEach(p => { p.estado = 'COMPLETADO'; });
        pasos[0].fechaFin = '2026-11-17T12:00:00Z'; pasos[2].fechaFin = '2026-11-16T12:00:00Z';
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-3');
        assert.isFalse(f.actual().editable); assert.isTrue(f.actual().valor.control.readOnly);
        assert.isTrue(f.guardarBoton.disabled); assert.isTrue(f.wizard.back.disabled);
        assert.isTrue(f.puedeVerReporte('paso-1')); assert.isTrue(f.puedeVerReporte('paso-2'));
        assert.lengthOf(escrituras(), 0);
    });
    for (const tipo of ['ajeno', 'invalidado']) test(`La selección del último completado excluye el paso más avanzado ${tipo}`, async () => {
        cadena(3); pasos.forEach(p => { p.estado = 'COMPLETADO'; });
        if (tipo === 'ajeno') pasos[2].idPersonaRol = { ...usuario, idPersonaRol: 'otro' };
        else pasos[2].estado = 'INVALIDO';
        const c = await cargar(); await espera(() => c.flujo.wizard.getCurrentStep().id === 'paso-2');
        assert.lengthOf(escrituras(), 0);
    });
    test('Al abrir muestra el paso asignado si sus predecesores de otros responsables ya finalizaron', async () => {
        cadena(3); pasos[1].estado = 'COMPLETADO';
        pasos[0].idPersonaRol = pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro-empleado' };
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-3');
        assert.isTrue(f.actual().editable); assert.isFalse(f.wizard.forward.disabled);
        assert.lengthOf(escrituras(), 0);
    });
    test('Al abrir no selecciona un pendiente propio bloqueado por su predecesor', async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE';
        pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro-empleado' };
        const c = await cargar(), f = c.flujo;
        assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.isTrue(f.wizard.steps[2].button.disabled); assert.isFalse(await f.ir('paso-3'));
        assert.lengthOf(escrituras(), 0);
    });
    test('Paso propio espera al responsable anterior y bloquea atención, exámenes y acciones', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE';
        pasos[0].idPersonaRol = { ...usuario, idPersonaRol: 'anterior', idPersona: { nombres: 'Ana', apellidos: 'Pérez' } };
        configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[1].idProcedimientoPaso,
            idExamen: { idExamen: 'ex', nombre: 'Hemograma', activo: true } }];
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[1], indicaciones: 'Indicaciones propias' }];
        resultados = [{ idExamenResultado: 'res', idOrdenExamen: ordenes[0], resultado: 'Resultado propio', interpretacion: '' }];
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-2');
        const m = f.actual();
        assert.isFalse(m.espera.hidden); assert.equal(m.espera.getAttribute('role'), 'status');
        assert.include(m.espera.textContent, 'Estás esperando al responsable del paso anterior');
        assert.include(m.espera.textContent, 'Ana Pérez'); assert.include(m.espera.textContent, 'Atención 1');
        assert.isFalse(m.editable); assert.isTrue(m.valor.control.readOnly);
        assert.isTrue(m.examenes[0].checkbox.control.disabled);
        assert.isTrue(m.ordenes[0].campo.control.readOnly); assert.isTrue(m.resultados[0].valor.control.readOnly);
        assert.isTrue(f.guardarBoton.disabled); assert.isTrue(f.wizard.forward.disabled); assert.isTrue(f.wizard.back.disabled);
        assert.isFalse(await f.guardarActual()); assert.isFalse(await f.siguiente()); assert.isFalse(await f.anterior());
        sinon.assert.notCalled(confirmacionStub); assert.lengthOf(escrituras(), 0);
        pasos[0].estado = 'COMPLETADO';
        const recargada = await cargar();
        await espera(() => recargada.flujo.wizard.getCurrentStep().id === 'paso-2');
        assert.isTrue(recargada.flujo.actual().espera.hidden);
        assert.isFalse(recargada.flujo.actual().valor.control.readOnly);
        assert.isFalse(recargada.flujo.wizard.forward.disabled);
        assert.lengthOf(escrituras(), 0);
    });
    test('Espera informa un predecesor sin responsable sin inventar una asignación', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; pasos[0].idPersonaRol = null;
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-2');
        assert.include(f.actual().espera.textContent, 'sin responsable registrado');
        assert.isTrue(f.guardarBoton.disabled); assert.isFalse(await f.siguiente()); assert.lengthOf(escrituras(), 0);
    });
    test('Espera todas las ramas anteriores e identifica solo los responsables pendientes', async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE'; pasos[1].estado = 'COMPLETADO';
        pasos[0].idPersonaRol = { ...usuario, idPersonaRol: 'anterior', idPersona: { nombres: 'Ana' } };
        pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro', idPersona: { nombres: 'Luis' } };
        secuencias[0].idProcedimientoPasoReferencia = pasos[2].idProcedimientoPaso;
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-3');
        assert.include(f.actual().espera.textContent, 'Ana'); assert.notInclude(f.actual().espera.textContent, 'Luis');
        assert.isFalse(await f.guardarActual()); assert.isFalse(await f.siguiente()); assert.lengthOf(escrituras(), 0);
    });
    test('Mismo rol no permite editar otro paso; un anterior completado ofrece reporte', async () => {
        cadena(); pasos[0].idPersonaRol = { ...usuario, idPersonaRol: 'otro-doctor' };
        pasos[0].valor = 'Contenido privado';
        const c = await cargar(), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-2');
        assert.lengthOf(f.wizard.getSteps(), 3);
        assert.isFalse(f.wizard.steps[0].button.disabled);
        assert.notInclude(f.wizard.root.textContent, 'Contenido privado');
        assert.isFalse(await f.ir('paso-1'));
        assert.lengthOf(escrituras(), 0);
    });
    test('Sin responsable no muestra atención ni permite guardar o completar', async () => {
        pasos[0].idPersonaRol = null; pasos[0].valor = 'Contenido privado';
        const c = await cargar(), f = c.flujo;
        assert.notInclude(f.wizard.root.textContent, 'Contenido privado');
        assert.isTrue(f.guardarBoton.disabled); assert.isTrue(f.wizard.forward.disabled);
        assert.isFalse(await f.guardarActual()); assert.isFalse(await f.siguiente());
        assert.lengthOf(escrituras(), 0);
    });
    test('Guardar y avanzar confirmado actualiza Consultas y una nueva asignación devuelve En curso', async () => {
        confirmacionStub.restore(); cadena(2); pasos[0].estado = 'PENDIENTE';
        pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro-responsable' };
        history.replaceState({}, '', '#/atencion/consulta-1'); router.iniciar();
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        const c = fixture.querySelector('atencion-controller'), f = c.flujo;
        f.actual().valor.setValue('Atención confirmada');
        assert.equal(f.wizard.forward.textContent, 'Guardar y avanzar');
        const guardado = f.siguiente();
        await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
        document.querySelector('.confirm-dialog__confirm').click();
        assert.isTrue(await guardado);
        assert.equal(pasos[0].estado, 'COMPLETADO');
        await espera(() => !!fixture.querySelector('tarjeta-consulta'));
        assert.equal(location.hash, '#/consultas'); assert.isFalse(c.isConnected);
        assert.include(fixture.querySelector('tarjeta-consulta').shadowRoot.textContent, 'Completado');
        pasos[1].idPersonaRol = usuario;
        await fixture.querySelector('consulta-controller').cargar();
        assert.include(fixture.querySelector('tarjeta-consulta').shadowRoot.textContent, 'En curso');
    });
    test('Completar el último pendiente vuelve automáticamente a Consultas', async () => {
        confirmacionStub.restore();
        history.replaceState({}, '', '#/atencion/consulta-1'); router.iniciar();
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        const c = fixture.querySelector('atencion-controller'), f = c.flujo;
        f.actual().valor.setValue('Última atención');
        const guardado = f.siguiente();
        await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
        document.querySelector('.confirm-dialog__confirm').click();
        assert.isTrue(await guardado);
        await espera(() => !!fixture.querySelector('tarjeta-consulta'));
        assert.equal(location.hash, '#/consultas'); assert.isFalse(c.isConnected);
        assert.include(fixture.querySelector('tarjeta-consulta').shadowRoot.textContent, 'Completado');
        assert.equal(pasos[0].valor, 'Última atención'); assert.equal(pasos[0].estado, 'COMPLETADO');
    });
    test('Sucesor ajeno vuelve a Consultas aunque haya un paso propio más adelante', async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE';
        pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro-responsable' };
        const c = await cargar(), salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        assert.isTrue(await c.flujo.siguiente());
        sinon.assert.calledOnce(salida); assert.equal(location.hash, '#/consultas');
        assert.equal(pasos[2].estado, 'PENDIENTE');
    });
    test('Sucesor propio pendiente permanece en Atención sin emitir salida', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE';
        const c = await cargar(), salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        assert.isTrue(await c.flujo.siguiente());
        assert.equal(c.flujo.wizard.getCurrentStep().id, 'paso-2'); sinon.assert.notCalled(salida);
    });
    test('Guardar sin avanzar no sale aunque sea el último paso propio', async () => {
        const c = await cargar(), salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        c.flujo.actual().valor.setValue('Borrador guardado');
        assert.isTrue(await c.flujo.guardarActual()); sinon.assert.notCalled(salida);
        assert.equal(pasos[0].estado, 'EN_PROCESO');
    });
    test('Sin selección no consulta ni crea registros', () => {
        router.manejarRuta('/atencion'); assert.include(fixture.textContent, 'Selecciona un registro'); assert.isFalse(fetchStub.called);
    });
    test('Atención obtiene solo consulta/{id}, sin descargar el listado de consultas', async () => {
        await cargar();
        const lecturas = fetchStub.getCalls().map(call => new URL(call.args[0]));
        assert.equal(lecturas.filter(url => url.pathname.endsWith('/consulta/consulta-1')).length, 1);
        assert.isFalse(lecturas.some(url => url.pathname.endsWith('/consulta')));
        const documentosPaciente = lecturas.filter(url => url.pathname.endsWith('/documento'));
        assert.isTrue(documentosPaciente.every(url => url.searchParams.get('persona') === 'persona-1'));
    });
    test('Consulta inexistente devuelve aviso sin cargar otras colecciones', async () => {
        consultas = [];
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.textContent.includes('no está disponible'));
        assert.equal(fetchStub.callCount, 1); assert.notExists(fixture.querySelector('galeno-wizard'));
    });
    test('Consulta inexistente o de otra clínica no carga su detalle', async () => {
        consultas[0].idPersonaRol.idClinica.idClinica = 'otra';
        router.manejarRuta('/atencion/consulta-1'); await espera(() => fixture.textContent.includes('no está disponible'));
        assert.equal(fetchStub.callCount, 1); assert.notExists(fixture.querySelector('galeno-wizard'));
    });
    test('Una asignación se abre directamente y cada paso del Wizard es una ejecución real', async () => {
        cadena(3); const controller = await cargar();
        assert.notExists(controller.querySelector('.atencion__elegir-procedimiento'));
        assert.deepEqual(controller.flujo.wizard.getSteps().map(p => p.id), ['paso-1', 'paso-2', 'paso-3']);
        assert.deepEqual(controller.flujo.wizard.getSteps().map(p => p.title), ['Atención 1', 'Atención 2', 'Atención 3']);
        assert.equal(controller.flujo.wizard.progress.value, 1); assert.lengthOf(escrituras(), 0);
    });
    test('Ordena por secuencias aunque catálogo y ejecuciones lleguen invertidos', async () => {
        cadena(3); pasos.reverse(); catalogos['procedimiento_paso/procedimiento/proc-1'].reverse();
        const controller = await cargar(); assert.deepEqual(controller.flujo.wizard.getSteps().map(p => p.id), ['paso-1', 'paso-2', 'paso-3']);
    });
    test('Registro omite UUID, finalización, paciente y edad; encabezado conserva la identidad', async () => {
        cadena(2); const c = await cargar('paso-1');
        const registro = c.querySelector('.atencion__registro');
        const etiquetas = [...registro.querySelectorAll('dt')].map(n => n.textContent);
        for (const etiqueta of ['Consulta', 'Paciente', 'Edad', 'Fecha de finalización']) assert.notInclude(etiquetas, etiqueta);
        assert.notInclude(registro.textContent, consultas[0].idConsulta);
        assert.notInclude(registro.textContent, 'Ana López');
        assert.notInclude(registro.textContent, '30 años');
        assert.include(etiquetas, 'Fecha de inicio');
        const inicio = [...registro.querySelectorAll('dt')].find(n => n.textContent === 'Fecha de inicio').nextElementSibling;
        const fecha = new Date(consultas[0].fechaInicio);
        assert.deepEqual([...inicio.childNodes].map(n => n.nodeName === 'BR' ? 'BR' : n.textContent), [
            fecha.toLocaleDateString('es-SV', { dateStyle: 'full' }),
            'BR',
            fecha.toLocaleTimeString('es-SV', { timeStyle: 'short' })
        ]);
        assert.equal(c.querySelector('.atencion__paciente-avatar').textContent, 'AL');
        assert.include(c.querySelector('.atencion__paciente').textContent, 'Ana López');
        assert.include(c.querySelector('.atencion__paciente').textContent, '30 años');
        assert.equal(getComputedStyle(c.querySelector('.atencion__paciente-identidad')).flexDirection, 'column');
        assert.equal(c.querySelector('.atencion__procedimiento-actual').textContent, 'Control médico');
        assert.equal(c.querySelector('.atencion__responsables').textContent, 'Doctor');
        await c.flujo.siguiente(); assert.isFalse(c.querySelector('.atencion__paciente').hidden);
        assert.equal(c.querySelector('.atencion__estado-atencion').textContent, 'PENDIENTE');
    });
    test('Documento corresponde a la persona y no al empleado, y errores opcionales se pueden reintentar', async () => {
        documentos = [{ idDocumento: 'ajeno', idPersona: { idPersona: 'otro' }, valor: 'NO MOSTRAR' },
            { idDocumento: 'propio', idPersona: { idPersona: 'persona-1' }, idTipoDocumento: { nombre: 'DUI' }, valor: '12345678-9' }];
        const c = await cargar(); await espera(() => c.querySelector('.atencion__paciente-documento').textContent.includes('12345678-9'));
        assert.notInclude(c.querySelector('.atencion__paciente').textContent, 'NO MOSTRAR');
        fetchStub.withArgs(sinon.match('/documento?')).resolves(new Response('', { status: 500 }));
        await c.cargar(); assert.exists(c.querySelector('.atencion__paciente-reintentar'));
        fetchStub.withArgs(sinon.match('/documento?')).callsFake(responder); c.querySelector('.atencion__paciente-reintentar').click();
        await espera(() => c.querySelector('.atencion__paciente-documento').textContent.includes('12345678-9'));
    });
    test('Guardar atención usa PUT y Toast; no completa, cambia fechas ni crea resultados u órdenes', async () => {
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención registrada');
        assert.isTrue(await f.guardarActual());
        assert.equal(pasos[0].valor, 'Atención registrada'); assert.equal(pasos[0].estado, 'EN_PROCESO');
        assert.lengthOf(escrituras(), 1); assert.equal(escrituras()[0].args[1].method, 'PUT');
        sinon.assert.calledWithMatch(Toast.success, 'Atención guardada');
        assert.notExists(pasos[0].fechaFin); assert.lengthOf(ordenes, 0); assert.lengthOf(resultados, 0);
    });
    test('Guardar dos veces no repite PUT si no hubo nuevos cambios', async () => {
        const c = await cargar(); c.flujo.actual().valor.setValue('Un cambio');
        await c.flujo.guardarActual(); await c.flujo.guardarActual(); assert.lengthOf(escrituras(), 1);
    });
    test('Siguiente guarda borrador y espera confirmación antes de avanzar', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar('paso-1'), f = c.flujo; f.actual().valor.setValue('Atención actualizada');
        let resolver;
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).callsFake((url, opciones) => new Promise(resolve => { resolver = () => responder(url, opciones).then(resolve); }));
        const pendiente = f.siguiente(); await espera(() => resolver);
        assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        resolver(); assert.isTrue(await pendiente); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
        assert.equal(pasos[0].valor, 'Atención actualizada');
    });
    test('Un fallo de guardado impide avanzar y conserva el borrador para reintentar', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar('paso-1'), f = c.flujo; f.actual().valor.setValue('Borrador');
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).resolves(new Response('', { status: 500 }));
        assert.isFalse(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-1'); assert.equal(f.actual().valor.getValue(), 'Borrador');
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).callsFake(responder);
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
    });
    test('Tras completar y avanzar el indicador y la llamada directa no vuelven al paso completado', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE';
        const c = await cargar(), f = c.flujo;
        assert.isTrue(await f.siguiente());
        assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
        assert.isFalse(f.wizard.steps[0].button.disabled);
        assert.isFalse(await f.ir('paso-1', false));
        assert.isFalse(f.modelos.get('paso-1').editable);
        assert.isTrue(f.modelos.get('paso-1').valor.control.readOnly);
        assert.lengthOf(escrituras(), 1);
    });
    test('Reporte de un paso anterior muestra atención y todos sus resultados sin guardar el borrador actual', async () => {
        cadena(2); pasos[0].idPersonaRol = { ...usuario, idPersonaRol: 'otro', idPersona: { nombres: 'Ana', apellidos: 'Pérez' } };
        pasos[0].valor = '<img src=x onerror=alert(1)>Atención previa';
        pasos[0].fechaFin = '2026-11-17T10:00:00Z';
        ordenes = [{ idOrdenExamen: 'orden-previa', idConsultaProcedimientoPaso: pasos[0], indicaciones: '[Atención 1] [Hemograma] En ayunas' },
            { idOrdenExamen: 'orden-actual', idConsultaProcedimientoPaso: pasos[1], indicaciones: 'No pertenece al reporte' }];
        resultados = [{ idExamenResultado: 'r1', idOrdenExamen: ordenes[0], resultado: 'Hemoglobina 14', interpretacion: 'Normal', rutaAtestado: 'https://ejemplo.test/resultado.pdf' },
            { idExamenResultado: 'r2', idOrdenExamen: ordenes[0], resultado: 'Resultado histórico', interpretacion: '<b>Sin HTML</b>', rutaAtestado: 'javascript:alert(1)' },
            { idExamenResultado: 'r3', idOrdenExamen: ordenes[1], resultado: 'Resultado de otro paso' }];
        const c = await cargar(), f = c.flujo; await espera(() => f.actual().paso.idConsultaProcedimientoPaso === 'paso-2');
        f.actual().valor.setValue('Borrador conservado');
        f.wizard.steps[0].button.click();
        const reporte = document.querySelector('galeno-reporte-paso'); assert.exists(reporte);
        for (const texto of ['Atención previa', 'Ana Pérez', 'Hemograma', 'En ayunas', 'Hemoglobina 14', 'Normal', 'Resultado histórico', '<b>Sin HTML</b>']) assert.include(reporte.textContent, texto);
        assert.notInclude(reporte.textContent, 'Resultado de otro paso'); assert.isNull(reporte.querySelector('img, b, input, textarea, select'));
        assert.lengthOf(reporte.querySelectorAll('a'), 1); assert.equal(reporte.querySelector('a').protocol, 'https:');
        assert.include(reporte.textContent, 'Referencia del adjunto');
        assert.equal(f.actual().paso.idConsultaProcedimientoPaso, 'paso-2'); assert.equal(f.actual().valor.getValue(), 'Borrador conservado');
        assert.lengthOf(escrituras(), 0); assert.equal(pasos[0].estado, 'COMPLETADO');
        assert.isFalse(f.verReporte('paso-1'));
        f.reporte.footer.querySelector('button').click(); assert.notExists(document.querySelector('galeno-reporte-paso'));
        assert.isNull(f.reporte); assert.equal(f.actual().valor.getValue(), 'Borrador conservado');
    });
    test('Reporte sin exámenes informa su ausencia y se destruye al desconectar', async () => {
        cadena(2); const c = await cargar(), f = c.flujo; await espera(() => f.actual().paso.idConsultaProcedimientoPaso === 'paso-2');
        assert.isTrue(f.verReporte('paso-1')); assert.include(document.querySelector('galeno-reporte-paso').textContent, 'no tiene exámenes registrados');
        f.reporte.close();
        f.detalle.ordenes.push({ idOrdenExamen: 'sin-resultados', idConsultaProcedimientoPaso: f.modelos.get('paso-1').paso, indicaciones: '[Atención 1] [Examen histórico] Preparación' });
        assert.isTrue(f.verReporte('paso-1'));
        assert.include(document.querySelector('galeno-reporte-paso').textContent, 'Sin resultados registrados.');
        c.remove(); assert.notExists(document.querySelector('galeno-reporte-paso')); assert.lengthOf(escrituras(), 0);
    });
    test('Reporte excluye pasos pendientes, invalidados, posteriores y un contexto que no sea responsable actual', async () => {
        cadena(3); const c = await cargar('paso-2'), f = c.flujo;
        assert.isFalse(f.verReporte('paso-3'));
        f.modelos.get('paso-3').paso.estado = 'COMPLETADO'; assert.isFalse(f.verReporte('paso-3'));
        f.modelos.get('paso-1').paso.estado = 'INVALIDO'; assert.isFalse(f.verReporte('paso-1'));
        f.modelos.get('paso-1').paso.estado = 'COMPLETADO';
        f.actual().paso.idPersonaRol = { ...usuario, idPersonaRol: 'otro' }; assert.isFalse(f.verReporte('paso-1'));
        assert.notExists(document.querySelector('galeno-reporte-paso')); assert.lengthOf(escrituras(), 0);
    });
    test('Un paso ya completado no permite guardar ni Anterior aunque siga asignado al usuario', async () => {
        cadena(3); pasos.forEach(p => p.estado = 'COMPLETADO');
        const c = await cargar('paso-2'), f = c.flujo;
        assert.isTrue(f.wizard.back.disabled); assert.isTrue(f.guardarBoton.disabled);
        assert.isTrue(f.actual().valor.control.readOnly);
        assert.notInclude(f.actual().root.textContent, 'Solo el responsable del siguiente paso');
        assert.isFalse(await f.anterior()); assert.isFalse(await f.guardarActual());
        sinon.assert.notCalled(retrocesoStub); assert.lengthOf(escrituras(), 0);
    });
    test('Anterior pide confirmación y cancelar conserva estado, responsables y borrador', async () => {
        retrocesoStub.restore(); cadena(2);
        const c = await cargar(), f = c.flujo;
        f.actual().valor.setValue('Borrador del siguiente');
        const pendiente = f.anterior();
        await espera(() => !!document.querySelector('.confirm-dialog__cancel'));
        assert.include(document.querySelector('.confirm-dialog__message').textContent, 'Atención 1');
        assert.include(document.querySelector('.confirm-dialog__message').textContent, 'reasignarán');
        assert.isTrue(f.wizard.back.disabled); assert.isFalse(await f.anterior());
        assert.isFalse(await f.ir('paso-1')); assert.lengthOf(document.querySelectorAll('.confirm-dialog'), 1);
        assert.lengthOf(escrituras(), 0); document.querySelector('.confirm-dialog__cancel').click();
        assert.isFalse(await pendiente); assert.equal(pasos[0].estado, 'COMPLETADO');
        assert.equal(pasos[0].idPersonaRol.idPersonaRol, usuario.idPersonaRol);
        assert.equal(f.actual().valor.getValue(), 'Borrador del siguiente');
        assert.lengthOf(escrituras(), 0); assert.isFalse(f.ocupado);
    });
    test('Escape en la confirmación de Anterior no reabre ni reasigna', async () => {
        retrocesoStub.restore(); cadena(2);
        const c = await cargar(), f = c.flujo;
        const pendiente = f.anterior(); await espera(() => !!document.querySelector('.confirm-dialog'));
        document.querySelector('.confirm-dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isFalse(await pendiente); assert.equal(pasos[0].estado, 'COMPLETADO');
        assert.lengthOf(escrituras(), 0); assert.isFalse(f.ocupado);
    });
    test('Confirmar Anterior después de perder la asignación no envía el retroceso', async () => {
        retrocesoStub.restore(); cadena(2);
        const c = await cargar(), f = c.flujo;
        const pendiente = f.anterior(); await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
        f.actual().paso.idPersonaRol = { ...usuario, idPersonaRol: 'otro-responsable' };
        document.querySelector('.confirm-dialog__confirm').click();
        assert.isFalse(await pendiente); assert.lengthOf(escrituras(), 0);
        assert.equal(pasos[0].estado, 'COMPLETADO');
    });
    test('Confirmar Anterior reabre y habilita el paso solo después de la respuesta del servidor', async () => {
        retrocesoStub.restore(); cadena(2);
        const c = await cargar(), f = c.flujo;
        fetchStub.withArgs(sinon.match('/retroceder'), sinon.match({ method: 'PUT' })).resolves(new Response(JSON.stringify({
            origen: { ...pasos[1], idPersonaRol: { ...usuario, idPersonaRol: 'otro-responsable' } },
            destino: { ...pasos[0], estado: 'PENDIENTE', fechaFin: null, idPersonaRol: usuario }
        })));
        const salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        const pendiente = f.anterior();
        await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
        assert.lengthOf(escrituras(), 0); assert.equal(pasos[0].estado, 'COMPLETADO');
        document.querySelector('.confirm-dialog__confirm').click();
        assert.isTrue(await pendiente); assert.lengthOf(escrituras(), 1);
        assert.equal(f.wizard.getCurrentStep().id, 'paso-1'); assert.equal(f.actual().paso.estado, 'PENDIENTE');
        assert.isTrue(f.actual().editable); assert.isFalse(f.actual().valor.control.readOnly);
        sinon.assert.notCalled(salida); assert.notExists(document.querySelector('.confirm-dialog'));
    });
    test('Desconectar durante la confirmación de Anterior impide cualquier reapertura tardía', async () => {
        retrocesoStub.restore(); cadena(2);
        const c = await cargar(), f = c.flujo;
        const pendiente = f.anterior(); await espera(() => !!document.querySelector('.confirm-dialog'));
        router.detener(); assert.isFalse(await pendiente);
        assert.lengthOf(escrituras(), 0); assert.notExists(document.querySelector('.confirm-dialog'));
    });
    test('Anterior conserva nodos y borradores y está deshabilitado en el primer paso', async () => {
        cadena(2); const c = await cargar('paso-1'), f = c.flujo;
        assert.isTrue(f.wizard.back.disabled); await f.siguiente(); const campo = f.actual().valor;
        campo.setValue('Borrador del segundo'); assert.isTrue(await f.anterior());
        assert.isTrue(f.wizard.back.disabled); await f.siguiente();
        assert.strictEqual(f.actual().valor, campo); assert.equal(campo.getValue(), 'Borrador del segundo');
    });
    test('Visitar pasos mediante el indicador nunca marca completado ni reabre un paso', async () => {
        cadena(2); const c = await cargar('paso-1'), f = c.flujo;
        await f.siguiente(); assert.isFalse(await f.ir('paso-1', false));
        assert.equal(f.wizard.progress.value, 1); assert.equal(pasos[1].estado, 'PENDIENTE');
        assert.isFalse(f.wizard.getSteps()[1].completed); assert.lengthOf(escrituras(), 0);
    });
    test('Confirmar Anterior con destino ajeno vuelve a Consultas y el receptor lo ve En curso', async () => {
        retrocesoStub.restore(); cadena(2);
        const receptor = { ...usuario, idPersonaRol: 'responsable-aleatorio', idPersona: { nombres: 'Responsable reasignado' } };
        pasos[0].idPersonaRol = receptor;
        const tarjetaAntes = document.createElement('tarjeta-consulta');
        tarjetaAntes.consulta = consultas[0]; tarjetaAntes.pasos = [pasos[0]]; tarjetaAntes.responsable = receptor;
        fixture.append(tarjetaAntes); assert.include(tarjetaAntes.shadowRoot.textContent, 'Completado'); tarjetaAntes.remove();
        history.replaceState({}, '', '#/atencion/consulta-1'); router.iniciar();
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        const c = fixture.querySelector('atencion-controller'), f = c.flujo;
        await espera(() => f.wizard.getCurrentStep().id === 'paso-2');
        const pendiente = f.anterior();
        await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
        assert.lengthOf(escrituras(), 0); assert.isTrue(c.isConnected);
        document.querySelector('.confirm-dialog__confirm').click(); assert.isTrue(await pendiente);
        await espera(() => fixture.querySelector('consulta-controller')?.textContent.includes('No hay consultas con pasos asignados a tu contexto activo'));
        assert.notExists(fixture.querySelector('tarjeta-consulta'));
        assert.equal(location.hash, '#/consultas'); assert.isFalse(c.isConnected);
        assert.equal(pasos[0].estado, 'PENDIENTE'); assert.equal(pasos[0].idPersonaRol.idPersonaRol, receptor.idPersonaRol);
        router.detener();
        router = crearRouter({ contenedor: fixture.querySelector('main'), tituloEl: fixture.querySelector('h1'), obtenerUsuario: () => receptor });
        router.manejarRuta('/consultas'); await espera(() => !!fixture.querySelector('tarjeta-consulta'));
        assert.include(fixture.querySelector('tarjeta-consulta').shadowRoot.textContent, 'En curso');
        assert.notInclude(fixture.querySelector('tarjeta-consulta').shadowRoot.textContent, 'Completado');
        assert.lengthOf(escrituras(), 1); assert.isTrue(escrituras()[0].args[0].endsWith('/retroceder'));
    });
    test('Anterior reabre el predecesor y actualiza responsable conservando contenido y borradores', async () => {
        cadena(2); pasos[0].fechaFin = '2026-11-15T10:00:00Z';
        const c = await cargar('paso-1'), f = c.flujo; await f.siguiente(); const campo = f.actual().valor;
        assert.include(f.wizard.back.getAttribute('aria-label'), 'reasignar responsable');
        const salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        campo.setValue('Borrador del segundo'); assert.isTrue(await f.anterior());
        sinon.assert.calledOnce(salida); assert.equal(location.hash, '#/consultas');
        assert.equal(f.wizard.getCurrentStep().id, 'paso-2'); assert.equal(pasos[0].estado, 'PENDIENTE');
        assert.isNull(pasos[0].fechaFin); assert.equal(pasos[0].idPersonaRol.idPersonaRol, 'responsable-aleatorio');
        assert.notInclude(f.wizard.root.textContent, 'Valor 1');
        assert.isFalse(await f.ir('paso-1')); assert.isFalse(await f.guardarActual());
        assert.equal(campo.getValue(), 'Borrador del segundo'); assert.isFalse(f.wizard.getSteps()[0].completed);
        assert.equal(pasos[1].idPersonaRol.idPersonaRol, 'responsable-actual-nuevo');
        assert.equal(pasos[1].estado, 'PENDIENTE'); assert.equal(pasos[1].valor, 'Valor 2');
        assert.lengthOf(escrituras(), 1); assert.isTrue(escrituras()[0].args[0].endsWith('/retroceder'));
        assert.isTrue(f.wizard.back.disabled); assert.isFalse(await f.anterior()); assert.lengthOf(escrituras(), 1);
    });
    test('Anterior con conflicto no navega ni altera responsable o borradores', async () => {
        cadena(2); const c = await cargar('paso-1'), f = c.flujo; await f.siguiente(); f.actual().valor.setValue('Borrador');
        const salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        fetchStub.withArgs(sinon.match('/retroceder'), sinon.match({ method: 'PUT' })).resolves(new Response('', { status: 409 }));
        assert.isFalse(await f.anterior()); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
        assert.equal(f.actual().valor.getValue(), 'Borrador'); assert.equal(pasos[0].estado, 'COMPLETADO'); assert.equal(pasos[0].idPersonaRol.idPersonaRol, usuario.idPersonaRol);
        assert.isFalse(f.ocupado); assert.isFalse(f.wizard.back.disabled); sinon.assert.notCalled(salida);
    });
    test('Doble clic en Anterior espera una sola reapertura', async () => {
        cadena(2); const c = await cargar('paso-1'), f = c.flujo; await f.siguiente();
        let resolver; fetchStub.withArgs(sinon.match('/retroceder'), sinon.match({ method: 'PUT' })).callsFake((url, opciones) => new Promise(r => { resolver = async () => r(await responder(url, opciones)); }));
        const pendiente = f.anterior(); await espera(() => !!resolver); assert.isTrue(f.wizard.back.disabled); assert.isFalse(await f.anterior());
        await resolver(); assert.isTrue(await pendiente); assert.lengthOf(escrituras(), 1);
    });
    test('Reintentar Anterior tras perder la respuesta no reasigna si ya cambió el responsable actual', async () => {
        cadena(2); const c = await cargar('paso-1'), f = c.flujo; await f.siguiente();
        fetchStub.withArgs(sinon.match('/retroceder'), sinon.match({ method: 'PUT' })).callsFake(async (url, opciones) => { await responder(url, opciones); throw new Error('Respuesta perdida'); });
        assert.isFalse(await f.anterior()); const responsable = pasos[0].idPersonaRol.idPersonaRol;
        fetchStub.withArgs(sinon.match('/retroceder'), sinon.match({ method: 'PUT' })).callsFake(responder);
        assert.isFalse(await f.anterior()); assert.equal(pasos[0].idPersonaRol.idPersonaRol, responsable);
        assert.equal(pasos[1].idPersonaRol.idPersonaRol, 'responsable-actual-nuevo'); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
        assert.isTrue(f.wizard.back.disabled); assert.isFalse(await f.anterior()); assert.lengthOf(escrituras(), 2);
    });
    test('Anterior está deshabilitado para otro empleado con el mismo rol y no permite invocación directa', async () => {
        cadena(2); pasos[1].idPersonaRol = { ...usuario, idPersonaRol: 'otro-empleado' };
        const c = await cargar(), f = c.flujo; await f.siguiente();
        assert.isTrue(f.wizard.back.disabled); assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.isTrue(f.wizard.steps[1].button.disabled); assert.isFalse(await f.ir('paso-2'));
        assert.isFalse(await f.anterior()); assert.lengthOf(escrituras(), 0);
    });
    test('Anterior está deshabilitado cuando el paso actual no tiene responsable', async () => {
        cadena(2); pasos[1].idPersonaRol = null;
        const c = await cargar(), f = c.flujo; await f.siguiente();
        assert.isTrue(f.wizard.back.disabled); assert.isFalse(await f.anterior()); assert.lengthOf(escrituras(), 0);
    });
    test('Completar exige atención, la guarda con el estado y habilita el siguiente paso', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar(), f = c.flujo;
        f.actual().valor.setValue(' '); assert.isFalse(await f.siguiente()); sinon.assert.calledWithMatch(Toast.warning, 'obligatoria');
        assert.lengthOf(escrituras(), 0); const actual = f.actual();
        actual.valor.setValue('Registrada'); assert.isTrue(await f.siguiente());
        assert.equal(f.wizard.getCurrentStep().id, 'paso-2'); assert.equal(pasos[0].estado, 'COMPLETADO'); assert.equal(pasos[0].valor, 'Registrada');
        assert.exists(pasos[0].fechaFin); assert.equal(pasos[0].idPersonaRol.idPersonaRol, usuario.idPersonaRol);
        assert.isTrue(f.actual().editable); assert.isFalse(f.actual().valor.control.readOnly);
        assert.lengthOf(escrituras(), 1); assert.isTrue(escrituras()[0].args[0].endsWith('/completar'));
        assert.isTrue(f.wizard.getSteps()[0].completed);
    });
    test('Cancelar completar conserva el borrador y un doble clic no abre otro diálogo', async () => {
        confirmacionStub.restore(); cadena(2); pasos[0].estado = 'PENDIENTE';
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención sin guardar');
        const salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        const pendiente = f.siguiente(); await espera(() => !!document.querySelector('.confirm-dialog__cancel'));
        assert.include(document.querySelector('.confirm-dialog__message').textContent, 'Atención 1');
        assert.lengthOf(escrituras(), 0); assert.isTrue(f.wizard.forward.disabled);
        assert.isFalse(await f.siguiente()); assert.lengthOf(document.querySelectorAll('.confirm-dialog'), 1);
        document.querySelector('.confirm-dialog__cancel').click(); assert.isFalse(await pendiente); sinon.assert.notCalled(salida);
        assert.equal(f.wizard.getCurrentStep().id, 'paso-1'); assert.equal(pasos[0].estado, 'PENDIENTE');
        assert.equal(f.actual().valor.getValue(), 'Atención sin guardar'); assert.lengthOf(escrituras(), 0);
        assert.notExists(document.querySelector('.confirm-dialog')); assert.isFalse(f.ocupado);
    });
    for (const ultimo of [false, true]) {
        test(`Confirmar guarda y completa ${ultimo ? 'el último paso' : 'antes de avanzar al siguiente'}`, async () => {
            confirmacionStub.restore(); cadena(ultimo ? 1 : 2); pasos[0].estado = 'PENDIENTE';
            const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención confirmada');
            assert.equal(f.wizard.forward.textContent, 'Guardar y avanzar');
            const pendiente = f.siguiente(); await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
            assert.equal(document.querySelector('.confirm-dialog__confirm').textContent, 'Guardar y avanzar');
            assert.lengthOf(escrituras(), 0); document.querySelector('.confirm-dialog__confirm').click();
            assert.isTrue(await pendiente); assert.equal(pasos[0].estado, 'COMPLETADO'); assert.equal(pasos[0].valor, 'Atención confirmada');
            assert.equal(f.wizard.getCurrentStep().id, ultimo ? 'paso-1' : 'paso-2');
            assert.lengthOf(escrituras(), 1); assert.notExists(document.querySelector('.confirm-dialog'));
        });
    }
    test('indicaFin muestra Completar en el botón y la confirmación; cancelar conserva el paso', async () => {
        confirmacionStub.restore(); pasos[0].idProcedimientoPaso.indicaFin = true;
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención final');
        assert.equal(f.wizard.forward.textContent, 'Completar');
        assert.notInclude(f.actual().root.textContent, 'Completar guarda la atención');
        const pendiente = f.siguiente(); await espera(() => !!document.querySelector('.confirm-dialog__confirm'));
        assert.equal(document.querySelector('.confirm-dialog__confirm').textContent, 'Completar');
        document.querySelector('.confirm-dialog__cancel').click();
        assert.isFalse(await pendiente); assert.lengthOf(escrituras(), 0);
        assert.equal(pasos[0].estado, 'EN_PROCESO'); assert.equal(f.actual().valor.getValue(), 'Atención final');
    });
    for (const estadoRama of ['PENDIENTE', 'INVALIDO']) test(`indicaFin invalida la rama ${estadoRama} y regresa sin pedir sucesor`, async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE'; pasos[0].idProcedimientoPaso.indicaFin = true;
        secuencias[1].idProcedimientoPaso = pasos[0].idProcedimientoPaso;
        pasos[2].estado = estadoRama;
        const c = await cargar(), f = c.flujo, salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        assert.equal(f.wizard.forward.textContent, 'Completar'); assert.isFalse(f.wizard.forward.disabled);
        f.actual().valor.setValue('Cierre'); assert.isTrue(await f.siguiente());
        assert.equal(pasos[0].estado, 'COMPLETADO');
        assert.isTrue(pasos.slice(1).every(p => p.estado === 'INVALIDO'));
        assert.equal(c.pasosConsulta[0].estado, 'COMPLETADO');
        assert.isTrue(c.pasosConsulta.slice(1).every(p => p.estado === 'INVALIDO'));
        assert.isFalse(f.hayCambios());
        sinon.assert.calledOnce(salida); assert.lengthOf(escrituras(), 1);
        assert.notProperty(JSON.parse(escrituras()[0].args[1].body), 'siguiente');
    });
    test('Cerrar la confirmación con Escape no completa ni guarda', async () => {
        confirmacionStub.restore(); const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Borrador');
        const pendiente = f.siguiente(); await espera(() => !!document.querySelector('.confirm-dialog'));
        document.querySelector('.confirm-dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isFalse(await pendiente); assert.lengthOf(escrituras(), 0); assert.equal(f.actual().valor.getValue(), 'Borrador');
    });
    test('Desconectar durante la confirmación destruye el diálogo sin completar tarde', async () => {
        confirmacionStub.restore(); const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Borrador');
        const pendiente = f.siguiente(); await espera(() => !!document.querySelector('.confirm-dialog'));
        c.remove(); assert.isFalse(await pendiente); assert.notExists(document.querySelector('.confirm-dialog')); assert.lengthOf(escrituras(), 0);
    });
    test('Siguiente de un paso ya completado navega sin solicitar confirmación', async () => {
        confirmacionStub.restore(); cadena(2); const c = await cargar('paso-1');
        assert.isTrue(await c.flujo.siguiente()); assert.equal(c.flujo.wizard.getCurrentStep().id, 'paso-2');
        assert.notExists(document.querySelector('.confirm-dialog')); assert.lengthOf(escrituras(), 0);
    });
    test('Solo revela la rama elegida y sus descendientes sin escribir al cambiar el selector', async () => {
        cadena(6); pasos[0].estado = 'PENDIENTE';
        const enlace = (a, b) => ({ idProcedimientoPasoSecuencia: `s-${a}-${b}`, idProcedimientoPaso: pasos[a - 1].idProcedimientoPaso, idProcedimientoPasoReferencia: pasos[b - 1].idProcedimientoPaso });
        secuencias = [enlace(1, 2), enlace(1, 3), enlace(2, 4), enlace(3, 5), enlace(4, 6), enlace(5, 6)];
        const c = await cargar(), f = c.flujo;
        assert.deepEqual(f.wizard.steps.map(p => p.item.hidden), [false, true, true, true, true, true]);
        assert.isFalse(await f.ir('paso-2')); assert.isTrue(f.wizard.forward.disabled);
        const elegir = id => { f.actual().sucesor.select.value = id; f.actual().sucesor.select.dispatchEvent(new Event('change', { bubbles: true })); };
        elegir('paso-2');
        assert.deepEqual(f.wizard.steps.map(p => p.item.hidden), [false, false, true, false, true, false]);
        const campo = f.modelos.get('paso-4').valor; campo.setValue('Borrador de la rama');
        elegir('paso-3');
        assert.deepEqual(f.wizard.steps.map(p => p.item.hidden), [false, true, false, true, false, false]);
        elegir('paso-2'); assert.strictEqual(f.modelos.get('paso-4').valor, campo); assert.equal(campo.getValue(), 'Borrador de la rama');
        assert.lengthOf(escrituras(), 0); assert.isTrue(pasos.slice(1).every(p => p.estado === 'PENDIENTE'));
    });
    test('Confirmar persiste INVALIDO, oculta la alternativa al recargar y conserva la convergencia', async () => {
        cadena(6); pasos[0].estado = 'PENDIENTE';
        const enlace = (a, b) => ({ idProcedimientoPasoSecuencia: `s-${a}-${b}`, idProcedimientoPaso: pasos[a - 1].idProcedimientoPaso, idProcedimientoPasoReferencia: pasos[b - 1].idProcedimientoPaso });
        secuencias = [enlace(1, 2), enlace(1, 3), enlace(2, 4), enlace(3, 5), enlace(4, 6), enlace(5, 6)];
        invalidadosCamino = ['def-3', 'def-5'];
        const c = await cargar(), f = c.flujo;
        f.actual().sucesor.select.value = 'paso-2'; f.actual().sucesor.select.dispatchEvent(new Event('change', { bubbles: true }));
        assert.isTrue(await f.siguiente());
        assert.equal(pasos[2].estado, 'INVALIDO'); assert.equal(pasos[4].estado, 'INVALIDO'); assert.equal(pasos[5].estado, 'PENDIENTE');
        assert.equal(JSON.parse(escrituras()[0].args[1].body).siguiente, 'paso-2');
        const recargada = await cargar();
        await espera(() => recargada.flujo.wizard.getCurrentStep().id === 'paso-2');
        assert.deepEqual(recargada.flujo.wizard.steps.map(p => p.item.hidden), [false, false, true, false, true, false]);
        assert.isFalse(await recargada.flujo.ir('paso-3')); assert.equal(recargada.flujo.wizard.progress.max, 4);
        assert.lengthOf(escrituras(), 1);
    });
    test('Cancelar la elección de una bifurcación no invalida ningún paso', async () => {
        confirmacionStub.restore(); cadena(3); pasos[0].estado = 'PENDIENTE'; secuencias[1].idProcedimientoPaso = pasos[0].idProcedimientoPaso;
        const c = await cargar(), f = c.flujo;
        f.actual().sucesor.select.value = 'paso-3'; f.actual().sucesor.select.dispatchEvent(new Event('change', { bubbles: true }));
        const pendiente = f.siguiente(); await espera(() => !!document.querySelector('.confirm-dialog__cancel'));
        document.querySelector('.confirm-dialog__cancel').click(); assert.isFalse(await pendiente);
        assert.isTrue(pasos.every(p => p.estado === 'PENDIENTE')); assert.lengthOf(escrituras(), 0);
        const recargada = await cargar(); assert.deepEqual(recargada.flujo.wizard.steps.map(p => p.item.hidden), [false, true, true]);
    });
    test('Bifurcaciones permiten elegir sucesor habilitado sin completar la otra rama', async () => {
        cadena(3); pasos[0].fechaFin = '2026-11-15T10:00:00Z'; secuencias[1].idProcedimientoPaso = pasos[0].idProcedimientoPaso;
        const c = await cargar('paso-1'), f = c.flujo;
        assert.isTrue(f.wizard.forward.disabled); assert.isFalse(f.actual().sucesor.wrapper.hidden);
        f.actual().sucesor.select.value = 'paso-3'; f.actual().sucesor.select.dispatchEvent(new Event('change', { bubbles: true }));
        assert.isFalse(await f.ir('paso-3'));
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-3');
        assert.equal(pasos[1].estado, 'INVALIDO'); assert.equal(f.wizard.progress.value, 1);
    });
    test('Pasos con predecesores sin completar no pueden abrirse mediante el indicador', async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE'; const c = await cargar();
        assert.isTrue(c.flujo.wizard.steps[1].button.disabled); assert.isFalse(await c.flujo.ir('paso-3'));
        assert.lengthOf(escrituras(), 0);
    });
    test('Solo presenta exámenes activos del paso; ninguno viene seleccionado automáticamente', async () => {
        configuraciones = [
            { idProcedimientoPasoExamen: 'permitido', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Examen permitido', activo: true } },
            { idProcedimientoPasoExamen: 'inactivo', activo: false, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex2', nombre: 'NO MOSTRAR', activo: true } },
            { idProcedimientoPasoExamen: 'ajeno', activo: true, idProcedimientoPaso: { idProcedimientoPaso: 'fuera' }, idExamen: { idExamen: 'ex3', nombre: 'NO MOSTRAR', activo: true } }
        ];
        const c = await cargar(), m = c.flujo.actual();
        assert.lengthOf(m.examenes, 1); assert.equal(m.examenes[0].checkbox.root.localName, 'galeno-checkbox');
        assert.isFalse(m.examenes[0].checkbox.getChecked()); assert.notInclude(m.root.textContent, 'NO MOSTRAR');
    });
    test('Sin exámenes disponibles se oculta toda la sección', async () => {
        const c = await cargar(); assert.notExists(c.flujo.actual().root.querySelector('.atencion__examenes-paso'));
    });
    test('Checkbox e indicaciones se conservan al volver y crean una sola orden con prefijo', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Examen', activo: true } }];
        const c = await cargar('paso-1'), f = c.flujo, m = f.actual(), e = m.examenes[0];
        e.checkbox.control.click(); e.indicaciones.setValue('Borrador de indicaciones'); m.valor.setValue('Borrador valor');
        assert.isFalse(await f.ir('paso-2', false));
        assert.isTrue(e.checkbox.getChecked()); assert.equal(e.indicaciones.getValue(), 'Borrador de indicaciones');
        assert.isTrue(await f.guardarActual()); assert.equal(pasos[0].valor, 'Borrador valor');
        assert.equal(ordenes[0].indicaciones, '[Atención 1] [Examen] Borrador de indicaciones');
        assert.lengthOf(m.resultados, 1);
        const resultado = m.resultados[0];
        assert.isTrue(m.root.querySelector('.atencion__resultado-paso').open);
        assert.isFalse(resultado.valor.control.disabled); assert.isFalse(resultado.valor.control.readOnly);
        assert.strictEqual(m.valor, f.actual().valor); assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.isTrue(await f.guardarActual()); assert.lengthOf(ordenes, 1);
        assert.lengthOf(m.resultados, 1); assert.strictEqual(m.resultados[0], resultado);
        assert.lengthOf(resultados, 0);
        assert.lengthOf(escrituras().filter(c => c.args[1].method === 'POST'), 1);
        e.checkbox.control.click(); assert.isTrue(e.checkbox.getChecked());
        const recargada = await cargar('paso-1'), seleccion = recargada.flujo.actual().examenes[0];
        assert.isTrue(seleccion.checkbox.getChecked()); assert.equal(seleccion.indicaciones.getValue(), 'Borrador de indicaciones');
        seleccion.indicaciones.setValue('Actualizadas'); assert.isTrue(await recargada.flujo.guardarActual());
        assert.equal(ordenes[0].indicaciones, '[Atención 1] [Examen] Actualizadas');
    });
    test('Una orden recién guardada permite registrar su resultado sin recargar la consulta', async () => {
        configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Hemograma', activo: true } }];
        const c = await cargar(), f = c.flujo, m = f.actual();
        m.examenes[0].checkbox.control.click(); m.examenes[0].indicaciones.setValue('En ayunas');
        assert.isTrue(await f.guardarActual()); assert.lengthOf(m.resultados, 1); assert.lengthOf(resultados, 0);
        m.resultados[0].valor.setValue('Hemoglobina 14'); m.resultados[0].interpretacion.setValue('Normal');
        assert.isTrue(await f.guardarActual());
        assert.lengthOf(ordenes, 1); assert.lengthOf(resultados, 1);
        assert.equal(resultados[0].resultado, 'Hemoglobina 14'); assert.equal(resultados[0].interpretacion, 'Normal');
        assert.equal(resultados[0].idOrdenExamen.idOrdenExamen, ordenes[0].idOrdenExamen);
        assert.strictEqual(c.flujo, f); assert.strictEqual(f.actual(), m);
    });
    test('Órdenes sin examen identificable se conservan sin atribuirlas a una casilla', async () => {
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: 'Indicaciones guardadas' }];
        const c = await cargar(), m = c.flujo.actual();
        assert.lengthOf(m.ordenes, 1); assert.include(m.root.textContent, 'no tiene una asociación única');
        m.ordenes[0].campo.setValue('Actualizadas'); await c.flujo.guardarActual(); await c.flujo.guardarActual();
        assert.equal(ordenes[0].indicaciones, 'Actualizadas'); assert.lengthOf(escrituras(), 1); assert.equal(escrituras()[0].args[1].method, 'PUT');
    });
    test('Órdenes duplicadas con prefijo quedan visibles y bloquean crear otra selección', async () => {
        configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Examen', activo: true } }];
        ordenes = ['uno', 'dos'].map(id => ({ idOrdenExamen: id, idConsultaProcedimientoPaso: pasos[0], indicaciones: '[Evaluación] [Examen] Previas' }));
        const c = await cargar(), m = c.flujo.actual();
        assert.isFalse(m.examenes[0].checkbox.getChecked()); assert.lengthOf(m.ordenes, 2);
        m.examenes[0].checkbox.setChecked(true); assert.isFalse(await c.flujo.guardarActual()); assert.lengthOf(escrituras(), 0);
    });
    test('Nombres de examen repetidos no se vinculan ni crean órdenes por posición', async () => {
        configuraciones = ['uno', 'dos'].map(id => ({ idProcedimientoPasoExamen: id, activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: id, nombre: 'Examen', activo: true } }));
        const c = await cargar(), m = c.flujo.actual(); m.examenes[0].checkbox.setChecked(true);
        assert.isFalse(await c.flujo.guardarActual()); assert.lengthOf(escrituras(), 0);
    });
    test('Guardado parcial conserva los campos pendientes y el reintento no repite lo ya confirmado', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: 'Inicial' }];
        const c = await cargar('paso-1'), m = c.flujo.actual(); m.valor.setValue('Atención nueva'); m.ordenes[0].campo.setValue('Indicación nueva');
        fetchStub.withArgs(sinon.match('/orden_examen/orden'), sinon.match({ method: 'PUT' })).resolves(new Response('', { status: 500 }));
        assert.isFalse(await c.flujo.guardarActual()); assert.equal(pasos[0].valor, 'Atención nueva'); assert.equal(ordenes[0].indicaciones, 'Inicial');
        fetchStub.withArgs(sinon.match('/orden_examen/orden'), sinon.match({ method: 'PUT' })).callsFake(responder);
        assert.isTrue(await c.flujo.guardarActual());
        assert.equal(escrituras().filter(c => c.args[0].includes('/consulta_procedimiento_paso/')).length, 1);
    });
    test('Resultados se muestran solo si existen, con interpretación y adjuntos seguros', async () => {
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '' }];
        resultados = [{ idExamenResultado: 'res', idOrdenExamen: ordenes[0], resultado: '<img src=x>', interpretacion: 'Interpretación', rutaAtestado: 'javascript:alert(1)' }];
        const c = await cargar(), root = c.flujo.actual().root;
        assert.exists(root.querySelector('.atencion__resultado-paso')); assert.notExists(root.querySelector('img'));
        assert.notExists(root.querySelector('a')); assert.include(root.textContent, 'javascript:alert(1)');
        assert.equal(root.querySelector('.atencion__resultado-paso h4').textContent, 'Resultado de Orden sin examen identificado');
        assert.lengthOf(escrituras(), 0);
    });
    test('Resultados existentes y nuevos muestran paso y examen del prefijo sin UUID ni indicaciones', async () => {
        pasos[0].idProcedimientoPaso.nombre = 'Evaluación (A+B)?';
        configuraciones = ['Hemograma [I].*', 'Glucosa'].map((nombre, i) => ({ idProcedimientoPasoExamen: `config-${i}`, activo: true,
            idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: `ex-${i}`, nombre, activo: true } }));
        ordenes = configuraciones.map((e, i) => ({ idOrdenExamen: `uuid-orden-${i}`, idConsultaProcedimientoPaso: pasos[0],
            indicaciones: `[Evaluación (A+B)?] [${e.idExamen.nombre}] Ayuno [8 horas]` }));
        resultados = [{ idExamenResultado: 'resultado', idOrdenExamen: ordenes[0], resultado: 'Registrado', interpretacion: '' }];
        const c = await cargar(), root = c.flujo.actual().root;
        assert.equal(root.querySelector('.atencion__resultado-paso h4').textContent, 'Resultado de [Evaluación (A+B)?] [Hemograma [I].*]');
        assert.equal(root.querySelector('.atencion__resultado-paso summary').textContent, 'Registrar resultado (opcional) de [Evaluación (A+B)?] [Glucosa]');
        assert.isFalse([...root.querySelectorAll('.atencion__resultado-paso h4, .atencion__resultado-paso summary')].some(h => /uuid-orden|Ayuno/.test(h.textContent)));
        assert.lengthOf(escrituras(), 0);
    });
    test('Una orden sin configuración activa conserva su prefijo como título sin asociar una selección', async () => {
        ordenes = [{ idOrdenExamen: 'uuid-orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '[Evaluación] [Examen retirado] Ayuno [8 horas]' }];
        const c = await cargar(), m = c.flujo.actual();
        assert.lengthOf(m.examenes, 0); assert.equal(m.root.querySelector('.atencion__item h4').textContent, '[Evaluación] [Examen retirado]');
        assert.equal(m.root.querySelector('.atencion__resultado-paso summary').textContent, 'Registrar resultado (opcional) de [Evaluación] [Examen retirado]');
        assert.lengthOf(escrituras(), 0);
    });
    test('No crea resultados vacíos al cargar ni al guardar atención', async () => {
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '' }];
        const c = await cargar(); c.flujo.actual().valor.setValue('Atendido'); await c.flujo.guardarActual();
        assert.lengthOf(resultados, 0); assert.isFalse(escrituras().some(c => c.args[1].method === 'POST'));
    });
    test('Guarda resultado e interpretación existentes sin alterar adjunto o crear duplicados', async () => {
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '' }];
        resultados = [{ idExamenResultado: 'res', idOrdenExamen: ordenes[0], resultado: 'Anterior', interpretacion: 'Anterior', rutaAtestado: 'https://example.test/archivo.pdf' }];
        const c = await cargar(), r = c.flujo.actual().resultados[0];
        r.valor.setValue('Actualizado'); r.interpretacion.setValue('Interpretación actualizada');
        assert.isTrue(await c.flujo.guardarActual()); assert.isTrue(await c.flujo.guardarActual());
        assert.equal(resultados[0].resultado, 'Actualizado'); assert.equal(resultados[0].interpretacion, 'Interpretación actualizada');
        assert.equal(resultados[0].rutaAtestado, 'https://example.test/archivo.pdf'); assert.lengthOf(escrituras(), 1);
        assert.equal(c.flujo.actual().root.querySelector('.atencion__adjunto a').getAttribute('rel'), 'noopener noreferrer');
    });
    test('Registrar un resultado nuevo exige contenido y un segundo guardado no duplica el POST', async () => {
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '' }];
        const c = await cargar(), r = c.flujo.actual().resultados[0];
        r.interpretacion.setValue('Sin resultado'); assert.isFalse(await c.flujo.guardarActual()); assert.lengthOf(escrituras(), 0);
        r.valor.setValue('Resultado registrado'); assert.isTrue(await c.flujo.guardarActual()); assert.isTrue(await c.flujo.guardarActual());
        assert.lengthOf(resultados, 1); assert.equal(escrituras().filter(c => c.args[1].method === 'POST').length, 1);
    });
    test('Estados cancelados o desconocidos se muestran sin edición de contenido', async () => {
        for (const estado of ['CANCELADO', 'NUEVO_ESTADO']) {
            pasos[0].estado = estado;
            const c = await cargar(), m = c.flujo.actual();
            assert.isTrue(m.valor.control.readOnly); assert.isTrue(c.flujo.guardarBoton.disabled);
        }
        assert.lengthOf(escrituras(), 0);
    });
    test('Resultados de pasos de otro rol no muestran su contenido', async () => {
        cadena(2); pasos[0].idProcedimientoPaso.idRol = { idRol: 'otro' };
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '' }];
        resultados = [{ idExamenResultado: 'res', idOrdenExamen: ordenes[0], resultado: 'Resultado privado', interpretacion: 'Interpretación privada' }];
        const c = await cargar(), f = c.flujo;
        assert.notInclude(f.wizard.root.textContent, 'Resultado privado');
        assert.notInclude(f.wizard.root.textContent, 'Interpretación privada');
        assert.isFalse(await f.ir('paso-1')); assert.lengthOf(escrituras(), 0);
    });
    test('Observaciones generales y de procedimiento se muestran una sola vez fuera del Wizard', async () => {
        cadena(3); consultas[0].observaciones = 'Observación general';
        procedimientos = [{ ...pasos[0].idConsultaProcedimiento, observaciones: 'Observación del procedimiento' }];
        const c = await cargar(); assert.equal(c.observaciones.getValue(), 'Observación general');
        assert.equal(c.observacionesProcedimiento.getValue(), 'Observación del procedimiento');
        assert.notExists(c.flujo.wizard.root.querySelector('[name=observaciones]'));
        assert.lengthOf(c.querySelectorAll('[name=observaciones]'), 1);
        assert.isTrue(c.observaciones.control.readOnly);
        assert.notInclude(c.detallesGenerales.textContent, 'guardar observaciones requiere una operación del servidor');
        assert.notExists(c.detallesGenerales.querySelector('button'));
        assert.lengthOf(escrituras(), 0);
    });
    test('Varios procedimientos conservan sus propios borradores al cambiar de selección', async () => {
        const otro = { ...pasos[0].idConsultaProcedimiento, idConsultaProcedimiento: 'cp-2', idProcedimiento: { idProcedimiento: 'proc-2', nombre: 'Procedimiento dos' } };
        procedimientos = [pasos[0].idConsultaProcedimiento, otro];
        const d = { idProcedimientoPaso: 'def-2', nombre: 'Paso propio del segundo', idRol: usuario.idRol };
        catalogos['procedimiento_paso/procedimiento/proc-2'] = [d]; pasos.push({ ...pasos[0], idConsultaProcedimientoPaso: 'paso-2', idConsultaProcedimiento: otro, idProcedimientoPaso: d });
        const c = await cargar(); assert.exists(c.querySelector('.atencion__elegir-procedimiento')); assert.notExists(c.flujo.wizard);
        assert.isTrue(c.seleccionarProcedimiento('cp-1')); c.flujo.actual().valor.setValue('Borrador uno');
        assert.isTrue(c.seleccionarProcedimiento('cp-2')); c.flujo.actual().valor.setValue('Borrador dos');
        c.seleccionarProcedimiento('cp-1'); assert.equal(c.flujo.actual().valor.getValue(), 'Borrador uno');
        c.seleccionarProcedimiento('cp-2'); assert.equal(c.flujo.actual().valor.getValue(), 'Borrador dos'); assert.lengthOf(escrituras(), 0);
    });
    test('Completar el último paso conserva la consulta y procedimiento abiertos', async () => {
        const c = await cargar(); assert.equal(c.flujo.wizard.forward.textContent, 'Guardar y avanzar'); assert.isFalse(c.flujo.wizard.forward.disabled);
        const salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        c.flujo.actual().valor.setValue('Atención final'); assert.isTrue(await c.flujo.siguiente());
        sinon.assert.calledOnce(salida);
        assert.equal(c.flujo.wizard.forward.textContent, 'Paso completado'); assert.isTrue(c.flujo.wizard.forward.disabled);
        assert.equal(pasos[0].estado, 'COMPLETADO'); assert.notExists(consultas[0].fechaFin); assert.notExists(pasos[0].idConsultaProcedimiento.fechaFin);
        assert.lengthOf(escrituras(), 1);
    });
    test('Conflicto al completar conserva el borrador y no navega', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar(), f = c.flujo;
        const salida = sandbox.spy(); c.addEventListener('volver-consultas', salida);
        f.actual().valor.setValue('Borrador clínico');
        fetchStub.withArgs(sinon.match('/completar'), sinon.match({ method: 'PUT' })).resolves(new Response('', { status: 409 }));
        assert.isFalse(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.equal(f.actual().valor.getValue(), 'Borrador clínico'); assert.equal(f.actual().paso.estado, 'PENDIENTE');
        assert.equal(pasos[0].valor, 'Valor 1'); assert.isFalse(f.ocupado); assert.isFalse(f.wizard.forward.disabled);
        sinon.assert.notCalled(salida);
    });
    test('Completar respeta el rol del sucesor y no habilita su edición a otro empleado', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; pasos[1].idProcedimientoPaso.idRol = { idRol: 'laboratorio' };
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención del doctor');
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.isFalse(await f.ir('paso-2')); assert.isTrue(f.wizard.steps[1].button.disabled);
        assert.isTrue(f.wizard.forward.disabled);
        assert.equal(pasos[1].estado, 'PENDIENTE');
    });
    test('Completar una rama no salta un sucesor que depende de otra rama pendiente', async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE';
        secuencias = [
            { idProcedimientoPasoSecuencia: 'a', idProcedimientoPaso: pasos[0].idProcedimientoPaso, idProcedimientoPasoReferencia: pasos[2].idProcedimientoPaso },
            { idProcedimientoPasoSecuencia: 'b', idProcedimientoPaso: pasos[1].idProcedimientoPaso, idProcedimientoPasoReferencia: pasos[2].idProcedimientoPaso }
        ];
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Rama atendida');
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.equal(pasos[0].estado, 'COMPLETADO'); assert.equal(pasos[1].estado, 'PENDIENTE');
        assert.isTrue(f.wizard.steps[2].button.disabled); assert.isFalse(await f.ir('paso-3'));
    });
    test('Completar permite elegir un sucesor de una bifurcación sin completar la otra rama', async () => {
        cadena(3); pasos[0].estado = 'PENDIENTE'; secuencias[1].idProcedimientoPaso = pasos[0].idProcedimientoPaso;
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención de origen');
        assert.isFalse(f.actual().sucesor.wrapper.hidden); f.actual().sucesor.select.value = 'paso-3';
        f.actual().sucesor.select.dispatchEvent(new Event('change', { bubbles: true }));
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-3');
        assert.equal(pasos[0].estado, 'COMPLETADO'); assert.equal(pasos[1].estado, 'INVALIDO'); assert.equal(pasos[2].estado, 'PENDIENTE');
    });
    test('No completa ni avanza si falla guardar un examen seleccionado', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Examen', activo: true } }];
        const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Nueva atención'); f.actual().examenes[0].checkbox.setChecked(true);
        fetchStub.withArgs(sinon.match(/\/orden_examen$/), sinon.match({ method: 'POST' })).resolves(new Response('', { status: 500 }));
        assert.isFalse(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        assert.equal(pasos[0].estado, 'PENDIENTE'); assert.equal(pasos[0].valor, 'Valor 1');
        assert.isFalse(escrituras().some(c => c.args[0].endsWith('/completar')));
    });
    test('Doble clic espera una sola confirmación antes de avanzar', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención');
        let resolver; fetchStub.withArgs(sinon.match('/completar'), sinon.match({ method: 'PUT' })).callsFake((url, opciones) => new Promise(r => { resolver = async () => r(await responder(url, opciones)); }));
        const pendiente = f.siguiente(); await espera(() => !!resolver);
        assert.isTrue(f.wizard.forward.disabled); assert.isTrue(f.actual().valor.control.disabled);
        assert.isFalse(await f.siguiente()); await resolver(); assert.isTrue(await pendiente);
        assert.equal(f.wizard.getCurrentStep().id, 'paso-2'); assert.lengthOf(escrituras(), 1);
    });
    test('Respuesta de completar perdida se reintenta sin cambiar fecha de finalización', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención');
        fetchStub.withArgs(sinon.match('/completar'), sinon.match({ method: 'PUT' })).callsFake(async (url, opciones) => { await responder(url, opciones); throw new Error('Respuesta perdida'); });
        assert.isFalse(await f.siguiente()); const fecha = pasos[0].fechaFin; assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        fetchStub.withArgs(sinon.match('/completar'), sinon.match({ method: 'PUT' })).callsFake(responder);
        assert.isTrue(await f.siguiente()); assert.equal(pasos[0].fechaFin, fecha); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
    });
    test('Salir con borradores usa ConfirmDialog; cancelar conserva datos y confirmar permite salir', async () => {
        history.replaceState({}, '', '#/atencion/consulta-1'); router.iniciar();
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        const c = fixture.querySelector('atencion-controller'); c.flujo.actual().valor.setValue('Borrador');
        const salida = c.salir(); await espera(() => document.querySelector('.confirm-dialog__cancel'));
        document.querySelector('.confirm-dialog__cancel').click(); await salida; assert.isTrue(c.isConnected); assert.equal(c.flujo.actual().valor.getValue(), 'Borrador');
        const segunda = c.salir(); await espera(() => document.querySelector('.confirm-dialog__confirm'));
        document.querySelector('.confirm-dialog__confirm').click(); await segunda; await espera(() => !c.isConnected);
    });
    test('Fallo REST y respuesta tardía no crean un Wizard vacío ni reemplazan otra pantalla', async () => {
        fetchStub.onSecondCall().resolves(new Response('', { status: 500 }));
        router.manejarRuta('/atencion/consulta-1'); await espera(() => fixture.querySelector('.aviso--error'));
        assert.notExists(fixture.querySelector('galeno-wizard'));
        let resolver; fetchStub.onCall(fetchStub.callCount).returns(new Promise(r => { resolver = r; }));
        const c = fixture.querySelector('atencion-controller'); const pendiente = c.cargar(); router.manejarRuta('/citas');
        resolver(new Response(JSON.stringify(consultas))); await pendiente; assert.notExists(fixture.querySelector('atencion-controller'));
    });
    test('Procedimiento sin ejecuciones muestra un aviso sin pasos inventados', async () => {
        pasos = []; const c = await cargar(); assert.notExists(c.flujo.wizard); assert.include(c.flujoHost.textContent, 'no tiene ejecuciones');
    });
    test('Errores de grafo bloquean el flujo sin escrituras', async () => {
        cadena(2); secuencias.push({ idProcedimientoPasoSecuencia: 'ciclo', idProcedimientoPaso: pasos[1].idProcedimientoPaso, idProcedimientoPasoReferencia: pasos[0].idProcedimientoPaso });
        const c = await cargar(); assert.notExists(c.flujo.wizard); sinon.assert.calledWithMatch(Toast.error, 'ciclo'); assert.lengthOf(escrituras(), 0);
    });
    test('Desconectar destruye Wizard, TextAreas, Checkbox y confirmaciones pendientes', async () => {
        configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Examen', activo: true } }];
        const c = await cargar(), flujo = c.flujo, wizard = flujo.wizard, campos = [...flujo.campos], checkbox = flujo.checkboxes[0];
        router.detener(); assert.isTrue(wizard.destroyed); assert.isTrue(campos.every(campo => campo.destroyed)); assert.isTrue(checkbox.destroyed);
        assert.isNull(c.flujo);
    });
    test('Consulta sin procedimientos muestra un aviso sin crear un Wizard vacío', async () => {
        procedimientos = []; const c = await cargar();
        assert.notExists(c.flujo.wizard); assert.include(c.selectorHost.textContent, 'No hay procedimientos'); assert.lengthOf(escrituras(), 0);
    });
    test('Un rol ajeno no obtiene formularios editables del procedimiento', async () => {
        catalogos['procedimiento_paso/procedimiento/proc-1'] = [{ idProcedimientoPaso: 'def-1', nombre: 'Otro rol', idRol: { idRol: 'otro' } }];
        const c = await cargar(); assert.notExists(c.flujo.wizard); assert.isTrue(c.observaciones.control.readOnly); assert.lengthOf(escrituras(), 0);
    });
    test('Valores nulos al cargar no se convierten en escrituras vacías al guardar otro registro', async () => {
        pasos[0].valor = null;
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: null }];
        resultados = [{ idExamenResultado: 'res', idOrdenExamen: ordenes[0], resultado: null, interpretacion: null }];
        const c = await cargar(); assert.isTrue(await c.flujo.guardarActual());
        assert.lengthOf(escrituras(), 0); assert.isNull(pasos[0].valor); assert.isNull(ordenes[0].indicaciones); assert.isNull(resultados[0].resultado);
    });
    test('Navegación de menú con borrador exige confirmación y solo reenvía el destino confirmado', async () => {
        const c = await cargar(); c.flujo.actual().valor.setValue('Borrador');
        const target = document.createElement('button'); fixture.append(target);
        const destinos = [], handler = e => destinos.push(e.detail.ruta);
        document.addEventListener('galeno-navegar', handler);
        try {
            target.dispatchEvent(new CustomEvent('galeno-navegar', { detail: { ruta: '/dashboard' }, bubbles: true }));
            await espera(() => c.confirmacion); c.confirmacion.footer.firstElementChild.click();
            await espera(() => !c.confirmacion); assert.deepEqual(destinos, []);
            target.dispatchEvent(new CustomEvent('galeno-navegar', { detail: { ruta: '/dashboard' }, bubbles: true }));
            await espera(() => c.confirmacion); c.confirmacion.footer.lastElementChild.click();
            await espera(() => destinos.length === 1); assert.deepEqual(destinos, ['/dashboard']);
        } finally { document.removeEventListener('galeno-navegar', handler); }
    });
    test('Veinte pasos aprovechan el carrusel sin desbordar el contenedor en móvil', async () => {
        cadena(20); pasos.forEach(p => p.estado = 'COMPLETADO'); pasos[19].estado = 'PENDIENTE';
        const c = await cargar(), f = c.flujo; await f.ir('paso-20');
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        assert.isTrue(f.wizard.carouselActive); assert.isAtMost(f.wizard.root.scrollWidth, f.wizard.root.clientWidth + 1);
        assert.isAtMost(c.scrollWidth, c.clientWidth + 1); assert.equal(f.wizard.getCurrentStep().id, 'paso-20');
        assert.lengthOf(escrituras(), 0);
    });
    test('El estado visual se sincroniza con la respuesta releída al guardar, sin imponer una transición', async () => {
        const c = await cargar(), m = c.flujo.actual(); m.valor.setValue('Actualizado'); pasos[0].estado = 'COMPLETADO';
        assert.isTrue(await c.flujo.guardarActual()); assert.equal(pasos[0].valor, 'Actualizado');
        assert.equal(c.querySelector('.atencion__estado-atencion').textContent, 'COMPLETADO');
    });
    test('No sobrescribe la atención de un paso completado con un valor vacío', async () => {
        cadena(2); const c = await cargar('paso-1'); c.flujo.actual().valor.setValue(' ');
        assert.isFalse(await c.flujo.guardarActual()); assert.equal(pasos[0].valor, 'Valor 1'); assert.lengthOf(escrituras(), 0);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
