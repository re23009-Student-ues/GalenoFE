import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { cargarResumen } from '../../../src/js/control/resumen_service.js';
import ConsultaProcedimientoPasoService from '../../../src/js/control/consultaProcedimientoPaso_service.js';
import '../../../src/js/boundary/vistas/consulta_controller.js';
import '../../../src/js/boundary/vistas/resumen_controller.js';
import TarjetaConsulta from '../../../src/js/boundary/componentes/tarjeta_consulta.js';
mocha.setup('tdd');
suite('Paso 5: DTO de estados y dashboard agregado', () => {
    let sandbox, fetchStub, fixture;
    const usuario = { idPersonaRol: 'empleado', idClinica: { idClinica: 'clinica /&', nombre: 'Central' }, idRol: { idRol: 'doctor', nombre: 'Doctor' } };
    const response = (datos, total = Array.isArray(datos) ? datos.length : null) => new Response(JSON.stringify(datos), { headers: total === null ? {} : { 'Total-registros': String(total) } });
    const estado = (id, extra = {}) => ({ idConsulta: id, estado: 'En curso', totalPasos: 0, pasosFinalizados: 0, evaluadoEn: '2026-01-01T05:59:59Z', ...extra });
    const dashboard = () => ({ anio: 2025, evaluadoEn: '2026-01-01T05:59:59Z', zona: 'America/El_Salvador', consultasAnio: 123,
        consultasMes: 123, consultasHoy: 2, pacientesAtendidos: 8, porMes: [...Array(11).fill(0), 123],
        porHorario: { manana: 100, tarde: 20, noche: 3 }, proximas: [{ idConsulta: 'futura', paciente: 'Ana', inicio: '2026-01-01T06:00:00Z', observaciones: '' }],
        recientes: [{ idConsulta: 'pasada', paciente: 'Luis', inicio: '2026-01-01T05:59:58Z', observaciones: '<script>' }] });
    setup(() => { sandbox = sinon.createSandbox(); fetchStub = sandbox.stub(window, 'fetch'); fixture = document.querySelector('#fixtures'); });
    teardown(() => { fixture.replaceChildren(); sandbox.restore(); });
    async function rejects(fn, mensaje = '') { let error; try { await fn(); } catch (e) { error = e; } assert.instanceOf(error, Error); assert.include(error.message, mensaje); }
    async function hasta(fn) { for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 10)); assert.isTrue(!!fn()); }
    test('dashboard hace una petición agregada con clínica, sin descargar consultas o ejecuciones', async () => {
        fetchStub.callsFake(async raw => { const url = new URL(raw); assert.isTrue(url.pathname.endsWith('/consulta/resumen')); assert.equal(url.searchParams.get('clinica'), usuario.idClinica.idClinica); assert.isFalse(url.searchParams.has('inscripcion')); return response(dashboard()); });
        const datos = await cargarResumen(usuario); sinon.assert.calledOnce(fetchStub);
        assert.equal(datos.consultasAnio, 123); assert.notProperty(datos, 'consultas'); assert.equal(datos.clinica, 'Central');
        assert.instanceOf(datos.proximas[0].inicio, Date); assert.equal(datos.recientes[0].observaciones, '<script>');
        assert.deepEqual(datos.porMes, dashboard().porMes);
    });
    test('el contexto paciente conserva intersección clínica e inscripción', async () => {
        fetchStub.callsFake(async () => response(dashboard())); await cargarResumen({ ...usuario, idRol: { nombre: 'Paciente' } });
        const url = new URL(fetchStub.firstCall.args[0]); assert.equal(url.searchParams.get('clinica'), usuario.idClinica.idClinica); assert.equal(url.searchParams.get('inscripcion'), usuario.idPersonaRol);
    });
    test('sin contexto conserva agregado global y un paciente incompleto no pide datos globales', async () => {
        fetchStub.callsFake(async () => response(dashboard())); await cargarResumen(null);
        assert.isFalse(new URL(fetchStub.firstCall.args[0]).searchParams.has('clinica'));
        fetchStub.resetHistory(); await rejects(() => cargarResumen({ idRol: { nombre: 'Paciente' } }), 'incompleto'); sinon.assert.notCalled(fetchStub);
    });
    test('errores HTTP o DTO inválido no producen ceros ni fallback al listado', async () => {
        fetchStub.resolves(new Response('', { status: 500 })); await rejects(() => cargarResumen(usuario), '500');
        const invalidos = [[], { ...dashboard(), porMes: [1] }, { ...dashboard(), consultasHoy: -1 }, { ...dashboard(), porHorario: { manana: 1 } },
            { ...dashboard(), porMes: Array(12).fill(0) }, { ...dashboard(), evaluadoEn: 'ayer' }, { ...dashboard(), zona: 'UTC' }];
        for (const datos of invalidos) { fetchStub.callsFake(async () => response(datos)); await rejects(() => cargarResumen(usuario), 'inválido'); }
        assert.isTrue(fetchStub.getCalls().every(c => new URL(c.args[0]).pathname.endsWith('/consulta/resumen')));
    });
    test('rechaza filas sin fecha y listas que exceden las cinco seleccionadas por backend', async () => {
        for (const datos of [{ ...dashboard(), proximas: Array(6).fill(dashboard().proximas[0]) }, { ...dashboard(), recientes: [{ paciente: 'X', observaciones: '', inicio: null }] }]) {
            fetchStub.callsFake(async () => response(datos)); await rejects(() => cargarResumen(usuario));
        }
    });
    test('dashboard conserva valores vacíos explícitos', async () => {
        const vacio = { ...dashboard(), consultasAnio: 0, consultasMes: 0, consultasHoy: 0, pacientesAtendidos: 0, porMes: Array(12).fill(0), porHorario: { manana: 0, tarde: 0, noche: 0 }, proximas: [], recientes: [] };
        fetchStub.callsFake(async () => response(vacio)); const datos = await cargarResumen(usuario);
        assert.equal(datos.consultasAnio, 0); assert.deepEqual(datos.proximas, []);
    });
    test('123 resúmenes dividen UUID en bloques y nunca solicitan ejecuciones', async () => {
        const ids = Array.from({ length: 123 }, (_, i) => 'consulta-' + i);
        fetchStub.callsFake(async raw => { const url = new URL(raw); assert.isTrue(url.pathname.endsWith('/consulta/estados')); const bloque = url.searchParams.get('consultas').split(','); assert.isAtMost(bloque.length, 50); return response(bloque.map(id => estado(id))); });
        assert.lengthOf(await new ConsultaProcedimientoPasoService().resumirParaConsultas(ids), 123); assert.equal(fetchStub.callCount, 3);
    });
    test('resúmenes vacíos no solicitan ninguna lectura', async () => {
        assert.deepEqual(await new ConsultaProcedimientoPasoService().resumirParaConsultas([]), []); sinon.assert.notCalled(fetchStub);
    });
    test('ausencia de una consulta o datos ajenos impide usar resúmenes parciales', async () => {
        fetchStub.callsFake(async () => response([])); await rejects(() => new ConsultaProcedimientoPasoService().resumirParaConsultas(['a']), 'todas');
        fetchStub.callsFake(async () => response([estado('otra')])); await rejects(() => new ConsultaProcedimientoPasoService().resumirParaConsultas(['a']), 'ajenas');
    });
    test('el DTO valida cero pasos, finalización y estados desconocidos', async () => {
        for (const extra of [{ totalPasos: 0, pasosFinalizados: 0, estado: 'Finalizada' }, { totalPasos: 1, pasosFinalizados: 2 }, { totalPasos: 1, pasosFinalizados: 1, estado: 'En curso' }, { estado: 'DESCONOCIDO' }, { evaluadoEn: 'mal' }]) {
            fetchStub.callsFake(async () => response([estado('a', extra)])); await rejects(() => new ConsultaProcedimientoPasoService().resumirParaConsultas(['a']), 'inválido');
        }
    });
    test('la tarjeta muestra el estado del DTO sin fabricar pasos ni deducirlo de fechaFin', () => {
        const tarjeta = new TarjetaConsulta(); tarjeta.consulta = { idConsulta: 'a', fechaInicio: '2099-01-01T00:00:00Z', fechaFin: '2020-01-01T00:00:00Z' };
        tarjeta.resumenEstado = estado('a', { totalPasos: 124, pasosFinalizados: 124, estado: 'Finalizada' }); fixture.append(tarjeta);
        assert.include(tarjeta.shadowRoot.textContent, 'Finalizada'); assert.deepEqual(tarjeta.pasos, []);
    });
    test('las tarjetas no se montan si fallan las asignaciones', async () => {
        fetchStub.callsFake(async raw => new URL(raw).pathname.endsWith('/consulta') ? response([{ idConsulta: 'a', idPersonaRol: { idClinica: usuario.idClinica } }]) : new Response('', { status: 500 }));
        const vista = document.createElement('consulta-controller'); vista.usuario = usuario; fixture.append(vista); await hasta(() => !!vista.querySelector('.aviso--error'));
        assert.lengthOf(vista.querySelectorAll('tarjeta-consulta'), 0);
        assert.isTrue(fetchStub.getCalls().some(c => String(c.args[0]).includes('/consulta_procedimiento_paso')));
    });
    test('dashboard monta únicamente contexto laboral y consultas por rol sin pedir resumen', async () => {
        fetchStub.callsFake(async () => response([]));
        const vista = document.createElement('resumen-controller'); vista.usuario = usuario; fixture.append(vista);
        assert.deepEqual([...vista.children].map(n => n.localName), ['galeno-selector-contexto', 'galeno-agenda']);
        assert.strictEqual(vista.firstElementChild.usuario, usuario); assert.strictEqual(vista.lastElementChild.usuario, usuario);
        await hasta(() => !vista.querySelector('galeno-agenda [type=submit]').disabled);
        assert.isFalse(fetchStub.getCalls().some(c => String(c.args[0]).includes('/consulta/resumen')));
        assert.isNull(vista.querySelector('.stats,.dash-grid,.dona,svg,table'));
        vista.cargar(); assert.lengthOf(vista.querySelectorAll('galeno-selector-contexto'), 1); assert.lengthOf(vista.querySelectorAll('galeno-agenda'), 1);
    });;
});
mocha.run();
