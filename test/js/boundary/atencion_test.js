import { filtrarRelacionesFixture } from '../control/relaciones_fixture.js';
import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { crearRouter } from '../../../src/js/router.js';
import { Toast } from '../../../src/js/boundary/componentes/feedback/index.js';
import { pruebasProcedimientos } from '../control/atencion_procedimientos_test.js';
import { pruebasDocumentoPaciente } from '../control/atencion_consulta_documento_test.js';

mocha.setup('tdd');
pruebasProcedimientos();
pruebasDocumentoPaciente();
suite('Consulta → Atención SPA (REST simulado solo en pruebas)', () => {
    let sandbox, fixture, router, consultas, pasos, fetchStub, originalURL, configuraciones, ordenes, resultados, responder, documentos, secuencias, procedimientos, catalogos;
    const usuario = { idPersonaRol: 'doctor-1', idPersona: { nombres: 'Doctor' }, idRol: { idRol: 'medico', nombre: 'Doctor' }, idClinica: { idClinica: 'clinica-1' } };
    const espera = async predicate => {
        for (let i = 0; i < 50 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.isTrue(!!predicate(), 'La pantalla termina de cargar');
    };
    setup(() => {
        originalURL = location.href;
        sandbox = sinon.createSandbox();
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
                assert.equal(recurso, 'examen_resultado');
                const body = JSON.parse(options.body);
                const data = { ...body, idOrdenExamen: ordenes.find(o => o.idOrdenExamen === body.idOrdenExamen.idOrdenExamen), idExamenResultado: options.headers['Idempotency-Key'] }; resultados.push(data);
                return new Response(null, { status: 201, headers: { Location: `${url.replace(/\/atencion$/, '')}/${data.idExamenResultado}` } });
            }
            if (options.method === 'PUT') {
                assert.include(['consulta', 'consulta_procedimiento_paso', 'orden_examen', 'examen_resultado'], recurso);
                const data = JSON.parse(options.body);
                const keys = { consulta: 'idConsulta', consulta_procedimiento_paso: 'idConsultaProcedimientoPaso', orden_examen: 'idOrdenExamen', examen_resultado: 'idExamenResultado' };
                const registro = recursos[recurso].find(r => r[keys[recurso]] === id);
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
    async function cargar() {
        router.manejarRuta('/atencion/consulta-1');
        await espera(() => fixture.querySelector('atencion-controller')?.detalle);
        return fixture.querySelector('atencion-controller');
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
        cadena(2); const c = await cargar();
        const registro = c.querySelector('.atencion__registro');
        const etiquetas = [...registro.querySelectorAll('dt')].map(n => n.textContent);
        for (const etiqueta of ['Consulta', 'Paciente', 'Edad', 'Fecha de finalización']) assert.notInclude(etiquetas, etiqueta);
        assert.notInclude(registro.textContent, consultas[0].idConsulta);
        assert.notInclude(registro.textContent, 'Ana López');
        assert.notInclude(registro.textContent, '30 años');
        assert.include(etiquetas, 'Fecha de inicio');
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
        cadena(2); const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Atención actualizada');
        let resolver;
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).callsFake((url, opciones) => new Promise(resolve => { resolver = () => responder(url, opciones).then(resolve); }));
        const pendiente = f.siguiente(); await espera(() => resolver);
        assert.equal(f.wizard.getCurrentStep().id, 'paso-1');
        resolver(); assert.isTrue(await pendiente); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
        assert.equal(pasos[0].valor, 'Atención actualizada');
    });
    test('Un fallo de guardado impide avanzar y conserva el borrador para reintentar', async () => {
        cadena(2); const c = await cargar(), f = c.flujo; f.actual().valor.setValue('Borrador');
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).resolves(new Response('', { status: 500 }));
        assert.isFalse(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-1'); assert.equal(f.actual().valor.getValue(), 'Borrador');
        fetchStub.withArgs(sinon.match.any, sinon.match({ method: 'PUT' })).callsFake(responder);
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-2');
    });
    test('Anterior conserva nodos y borradores y está deshabilitado en el primer paso', async () => {
        cadena(2); const c = await cargar(), f = c.flujo;
        assert.isTrue(f.wizard.back.disabled); await f.siguiente(); const campo = f.actual().valor;
        campo.setValue('Borrador del segundo'); assert.isTrue(await f.anterior());
        assert.isTrue(f.wizard.back.disabled); await f.siguiente();
        assert.strictEqual(f.actual().valor, campo); assert.equal(campo.getValue(), 'Borrador del segundo');
    });
    test('Visitar y retroceder nunca marca completado un paso pendiente', async () => {
        cadena(2); const c = await cargar(), f = c.flujo;
        await f.siguiente(); await f.anterior(); await f.siguiente();
        assert.equal(f.wizard.progress.value, 1); assert.equal(pasos[1].estado, 'PENDIENTE');
        assert.isFalse(f.wizard.getSteps()[1].completed); assert.lengthOf(escrituras(), 0);
    });
    test('No avanza desde un pendiente sin operación backend y exige atención para solicitar completar', async () => {
        cadena(2); pasos[0].estado = 'PENDIENTE'; const c = await cargar(), f = c.flujo;
        f.actual().valor.setValue(' '); assert.isFalse(await f.siguiente()); sinon.assert.calledWithMatch(Toast.warning, 'obligatoria');
        f.actual().valor.setValue('Registrada'); assert.isFalse(await f.siguiente());
        assert.equal(f.wizard.getCurrentStep().id, 'paso-1'); assert.isTrue(f.wizard.forward.disabled); assert.lengthOf(escrituras(), 0);
    });
    test('Bifurcaciones permiten elegir sucesor habilitado sin completar la otra rama', async () => {
        cadena(3); secuencias[1].idProcedimientoPaso = pasos[0].idProcedimientoPaso;
        const c = await cargar(), f = c.flujo;
        assert.isTrue(f.wizard.forward.disabled); assert.isFalse(f.actual().sucesor.wrapper.hidden);
        f.actual().sucesor.select.value = 'paso-3'; f.actual().sucesor.select.dispatchEvent(new Event('change', { bubbles: true }));
        assert.isTrue(await f.siguiente()); assert.equal(f.wizard.getCurrentStep().id, 'paso-3');
        assert.equal(pasos[1].estado, 'PENDIENTE'); assert.equal(f.wizard.progress.value, 1);
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
    test('Checkbox e indicaciones se conservan al volver; selección sin relación REST no produce órdenes', async () => {
        cadena(2); configuraciones = [{ idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: pasos[0].idProcedimientoPaso, idExamen: { idExamen: 'ex', nombre: 'Examen', activo: true } }];
        const c = await cargar(), f = c.flujo, m = f.actual(), e = m.examenes[0];
        e.checkbox.control.click(); e.indicaciones.setValue('Borrador de indicaciones'); m.valor.setValue('Borrador valor');
        assert.isFalse(await f.guardarActual()); assert.lengthOf(escrituras(), 0);
        await f.ir('paso-2', false); await f.anterior();
        assert.isTrue(e.checkbox.getChecked()); assert.equal(e.indicaciones.getValue(), 'Borrador de indicaciones');
        e.checkbox.setChecked(false); assert.isTrue(await f.guardarActual()); assert.equal(pasos[0].valor, 'Borrador valor');
    });
    test('Órdenes sin examen identificable se conservan sin atribuirlas a una casilla', async () => {
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: 'Indicaciones guardadas' }];
        const c = await cargar(), m = c.flujo.actual();
        assert.lengthOf(m.ordenes, 1); assert.include(m.root.textContent, 'no identifica el examen');
        m.ordenes[0].campo.setValue('Actualizadas'); await c.flujo.guardarActual(); await c.flujo.guardarActual();
        assert.equal(ordenes[0].indicaciones, 'Actualizadas'); assert.lengthOf(escrituras(), 1); assert.equal(escrituras()[0].args[1].method, 'PUT');
    });
    test('Guardado parcial conserva los campos pendientes y el reintento no repite lo ya confirmado', async () => {
        cadena(2); ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: 'Inicial' }];
        const c = await cargar(), m = c.flujo.actual(); m.valor.setValue('Atención nueva'); m.ordenes[0].campo.setValue('Indicación nueva');
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
    test('Resultados de pasos de otro rol son de solo lectura', async () => {
        cadena(2); pasos[0].idProcedimientoPaso.idRol = { idRol: 'otro' };
        ordenes = [{ idOrdenExamen: 'orden', idConsultaProcedimientoPaso: pasos[0], indicaciones: '' }];
        resultados = [{ idExamenResultado: 'res', idOrdenExamen: ordenes[0], resultado: 'Resultado', interpretacion: 'Interpretación' }];
        const c = await cargar(), r = c.flujo.actual().resultados[0];
        assert.isTrue(r.valor.control.readOnly); assert.isTrue(r.interpretacion.control.readOnly);
        assert.isTrue(c.flujo.guardarBoton.disabled); assert.lengthOf(escrituras(), 0);
    });
    test('Observaciones generales y de procedimiento se muestran una sola vez fuera del Wizard', async () => {
        cadena(3); consultas[0].observaciones = 'Observación general';
        procedimientos = [{ ...pasos[0].idConsultaProcedimiento, observaciones: 'Observación del procedimiento' }];
        const c = await cargar(); assert.equal(c.observaciones.getValue(), 'Observación general');
        assert.equal(c.observacionesProcedimiento.getValue(), 'Observación del procedimiento');
        assert.notExists(c.flujo.wizard.root.querySelector('[name=observaciones]'));
        assert.lengthOf(c.querySelectorAll('[name=observaciones]'), 1);
        assert.isTrue(c.observaciones.control.readOnly);
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
    test('Finalizar permanece bloqueado y nunca cierra toda la consulta u otros procedimientos', async () => {
        const c = await cargar(); assert.equal(c.flujo.wizard.forward.textContent, 'Finalizar procedimiento'); assert.isTrue(c.flujo.wizard.forward.disabled);
        c.flujo.wizard.forward.click(); assert.lengthOf(escrituras(), 0); assert.notExists(consultas[0].fechaFin);
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
        cadena(20); pasos.forEach(p => p.estado = 'COMPLETADO');
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
        cadena(2); const c = await cargar(); c.flujo.actual().valor.setValue(' ');
        assert.isFalse(await c.flujo.guardarActual()); assert.equal(pasos[0].valor, 'Valor 1'); assert.lengthOf(escrituras(), 0);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
