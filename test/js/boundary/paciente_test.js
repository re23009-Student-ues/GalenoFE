import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { establecerContexto, obtenerContexto } from '../../../src/js/control/sesion_service.js';
import { esPaciente } from '../../../src/js/control/roles.js';
import { iniciarMenu } from '../../../src/js/boundary/menu_lateral.js';
import { crearRouter } from '../../../src/js/router.js';
import { cargarResumen, listarConsultas } from '../../../src/js/control/resumen_service.js';
import ConsultaService from '../../../src/js/control/consulta_service.js';
import ConsultaProcedimientoPasoService from '../../../src/js/control/consultaProcedimientoPaso_service.js';
import { todayKey, addDays } from '../../../src/js/boundary/componentes/calendar/calendar_dates.js';

const paciente = { idPersonaRol: 'paciente-1', idRol: {idRol:'paciente',nombre:'Paciente'}, idPersona:{idPersona:'persona-1',nombres:'Ana'}, idClinica:{idClinica:'clinica-1',nombre:'Clínica Central'} };
const otro = { ...paciente, idPersonaRol:'paciente-2', idPersona:{idPersona:'persona-2',nombres:'Luis'} };
const medico = { ...paciente, idPersonaRol:'medico-1', idRol:{idRol:'medico',nombre:'Médico'} };
const otraClinica = { ...paciente, idPersonaRol:'paciente-otra', idClinica:{idClinica:'clinica-2',nombre:'Otra clínica'} };
const consultas = [
    { idConsulta:'propia', idPersonaRol:paciente, fechaInicio:new Date(Date.now()+86400000).toISOString(), observaciones:'Consulta personal' },
    { idConsulta:'ajena', idPersonaRol:otro, fechaInicio:new Date(Date.now()+86400000).toISOString(), observaciones:'Información de otro paciente' },
    { idConsulta:'externa', idPersonaRol:otraClinica, fechaInicio:new Date(Date.now()+86400000).toISOString(), observaciones:'Otra clínica' }
];
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

mocha.setup('tdd');
suite('Contexto y portal del paciente', () => {
    let fixture, sandbox, router, actual, sesionPrevia;
    setup(() => {
        sesionPrevia = sessionStorage.getItem('sesionPersonaRol'); sessionStorage.removeItem('sesionPersonaRol');
        sandbox = sinon.createSandbox();
        sandbox.stub(ConsultaService.prototype, 'findAll').resolves(consultas);
        sandbox.stub(ConsultaProcedimientoPasoService.prototype, 'listarParaConsultas').resolves([]);
        fixture = document.querySelector('#fixtures');
        fixture.innerHTML = `<aside class="sidebar"><nav id="menu-lateral">
            <a data-route="/dashboard">Inicio</a><a data-route="/personas">Gestión de Personas</a>
            <a data-route="/consultas">Agenda Médica</a><a data-route="/configuracion">Configuración</a>
            </nav></aside><h1 id="test-title"></h1><div id="test-root"></div><div id="pantalla-login" hidden></div>`;
        actual = paciente;
        router = crearRouter({ contenedor:fixture.querySelector('#test-root'), tituloEl:fixture.querySelector('#test-title'), obtenerUsuario:()=>actual });
    });
    teardown(() => {
        router.detener(); fixture.replaceChildren(); sandbox.restore();
        if (sesionPrevia === null) sessionStorage.removeItem('sesionPersonaRol');
        else sessionStorage.setItem('sesionPersonaRol', sesionPrevia);
    });
    test('El contexto conserva el persona_rol usado por el portal', () => {
        establecerContexto(paciente);
        assert.equal(obtenerContexto(), paciente.idPersonaRol);
        establecerContexto(medico);
        assert.equal(obtenerContexto(), medico.idPersonaRol);
    });
    test('Detección de rol tolera mayúsculas y espacios', () => {
        assert.isTrue(esPaciente({...paciente,idRol:{nombre:' PACIENTE '}}));
        assert.isFalse(esPaciente(medico)); assert.isFalse(esPaciente(null));
    });
    test('El paciente solo recibe sus consultas y su clínica', async () => {
        const propias = await listarConsultas(paciente);
        assert.deepEqual(propias.map(consulta=>consulta.idConsulta), ['propia']);
        assert.lengthOf(await listarConsultas(medico), 2);
        assert.lengthOf(await listarConsultas({...paciente,idPersonaRol:null}), 0);
        assert.lengthOf(await listarConsultas({...paciente,idClinica:null}), 0);
        const resumen = await cargarResumen(paciente);
        assert.equal(resumen.proximas[0].observaciones, 'Consulta personal');
    });
    test('Inicio personal en lugar del resumen de gestión', async () => {
        router.manejarRuta('/dashboard'); await settle();
        assert.equal(fixture.querySelector('#test-title').textContent, 'Mi inicio');
        assert.exists(fixture.querySelector('paciente-controller'));
        assert.notExists(fixture.querySelector('resumen-controller'));
        assert.include(fixture.textContent, 'Hola, Ana');
        assert.include(fixture.textContent, 'Consulta personal');
        assert.notInclude(fixture.textContent, 'Información de otro paciente');
    });
    test('Mis consultas muestra tabla personal sin acciones de gestión', async () => {
        router.manejarRuta('/consultas'); await settle();
        assert.equal(fixture.querySelector('#test-title').textContent, 'Mis consultas');
        assert.lengthOf(fixture.querySelectorAll('tbody tr'), 1);
        assert.include(fixture.querySelector('tbody').textContent, 'Consulta personal');
        assert.notExists(fixture.querySelector('.data-table__actions'));
    });
    test('Rutas de gestión vuelven al inicio personal', async () => {
        router.manejarRuta('/personas'); await settle();
        assert.equal(fixture.querySelector('#test-title').textContent, 'Mi inicio');
        assert.exists(fixture.querySelector('paciente-controller'));
    });
    test('Menú personal y restauración de enlaces de otros roles', () => {
        const menu = iniciarMenu({onNavegar:()=>{}}); menu.configurarUsuario(paciente);
        assert.isTrue(fixture.querySelector('[data-route="/personas"]').hidden);
        assert.equal(fixture.querySelector('[data-route="/consultas"]').textContent, 'Mis consultas');
        menu.configurarUsuario(medico);
        assert.isFalse(fixture.querySelector('[data-route="/personas"]').hidden);
        assert.equal(fixture.querySelector('[data-route="/consultas"]').textContent, 'Agenda Médica');
    });
    test('Otros roles conservan el resumen y agenda existentes', async () => {
        actual = medico; router.manejarRuta('/dashboard'); await settle();
        assert.exists(fixture.querySelector('resumen-controller'));
        assert.equal(fixture.querySelector('#test-title').textContent, 'Resumen');
        router.manejarRuta('/consultas'); await settle();
        assert.exists(fixture.querySelector('consulta-controller'));
        assert.equal(fixture.querySelector('#test-title').textContent, 'Agenda Médica');
    });
    test('Errores permiten reintentar y salir limpia la tabla', async () => {
        ConsultaService.prototype.findAll.rejects({mensaje:'Error de prueba'});
        router.manejarRuta('/consultas'); await settle();
        assert.include(fixture.textContent, 'Error de prueba');
        ConsultaService.prototype.findAll.resolves(consultas);
        fixture.querySelector('.paciente__reintentar').click(); await settle();
        const pantalla = fixture.querySelector('paciente-controller');
        const tabla = pantalla.tabla; assert.exists(tabla);
        router.detener(); assert.isTrue(tabla.destroyed); assert.isNull(pantalla.tabla);
    });
    test('El dashboard selecciona hoy y muestra solo citas propias sin repetir peticiones', async () => {
        const hoy = todayKey();
        ConsultaService.prototype.findAll.resolves([
            { ...consultas[0], fechaInicio:`${hoy}T09:00:00-06:00[America/El_Salvador]` },
            { ...consultas[1], fechaInicio:`${hoy}T10:00:00-06:00[America/El_Salvador]` }
        ]);
        router.manejarRuta('/dashboard'); await settle();
        const pantalla = fixture.querySelector('paciente-controller');
        assert.equal(pantalla.calendario.getSelectedDate(), hoy);
        assert.equal(fixture.querySelector(`[data-date="${hoy}"]`).getAttribute('aria-pressed'), 'true');
        assert.lengthOf(fixture.querySelectorAll('.paciente__cita'), 1);
        assert.include(fixture.querySelector('.paciente__cita').textContent, 'Hora de la cita: 09:00');
        assert.include(fixture.querySelector('.paciente__cita').textContent, 'Sin responsable asignado');
        assert.include(fixture.querySelector('.paciente__cita').textContent, 'Sin pasos registrados');
        assert.lengthOf(pantalla.calendario.getEventsByDate(hoy), 1);
        assert.equal(ConsultaService.prototype.findAll.callCount, 1);
    });
    test('Seleccionar un día actualiza tarjetas con paso, hora y doctor', async () => {
        const hoy = todayKey(), otraFecha = addDays(hoy, 1);
        ConsultaService.prototype.findAll.resolves([
            { ...consultas[0], fechaInicio:`${otraFecha}T08:00:00-06:00[America/El_Salvador]` }
        ]);
        ConsultaProcedimientoPasoService.prototype.listarParaConsultas.resolves([
            { idConsultaProcedimientoPaso:'paso-2', idConsultaProcedimiento:{idConsulta:consultas[0]},
                fechaInicio:`${otraFecha}T14:30:00-06:00[America/El_Salvador]`, estado:'PENDIENTE',
                idPersonaRol:{idPersona:{nombres:'Elena',apellidos:'López'},idRol:{nombre:'Doctor'}},
                idProcedimientoPaso:{nombre:'Revisión de resultados'} },
            { idConsultaProcedimientoPaso:'paso-1', idConsultaProcedimiento:{idConsulta:consultas[0]},
                fechaInicio:`${otraFecha}T09:00:00-06:00[America/El_Salvador]`, estado:'PENDIENTE',
                idPersonaRol:{idPersona:{nombres:'Luis',apellidos:'Pérez'},idRol:{nombre:'Médico'}},
                idProcedimientoPaso:{nombre:'Evaluación inicial'} }
        ]);
        router.manejarRuta('/dashboard'); await settle();
        assert.include(fixture.querySelector('.paciente__citas-dia').textContent, 'No tienes citas para esta fecha');
        const pantalla = fixture.querySelector('paciente-controller');
        pantalla.calendario.goToDate(otraFecha);
        fixture.querySelector(`[data-date="${otraFecha}"]`).click();
        const tarjetas = fixture.querySelectorAll('.paciente__cita');
        assert.lengthOf(tarjetas, 2);
        assert.include(tarjetas[0].textContent, '09:00');
        assert.include(tarjetas[1].textContent, 'Revisión de resultados');
        assert.include(tarjetas[1].textContent, 'Doctor: Elena López');
        assert.include(tarjetas[1].textContent, '14:30');
        const calendario = pantalla.calendario;
        router.manejarRuta('/consultas'); await settle();
        assert.isTrue(calendario.destroyed); assert.isNull(pantalla.calendario);
    });
    test('Responsables no médicos conservan su rol y no se presentan como Doctor', async () => {
        const hoy = todayKey();
        ConsultaProcedimientoPasoService.prototype.listarParaConsultas.resolves([
            { idConsultaProcedimientoPaso:'recepcion',idConsultaProcedimiento:{idConsulta:consultas[0]},fechaInicio:`${hoy}T08:00:00-06:00`,
                idPersonaRol:{idPersona:{nombres:'Sara',apellidos:'Díaz'},idRol:{nombre:'Atencion al publico'}},
                idProcedimientoPaso:{nombre:'Registro del paciente',idRol:{nombre:'Doctor'}},estado:'PENDIENTE' }
        ]);
        router.manejarRuta('/dashboard'); await settle();
        const tarjeta = fixture.querySelector('.paciente__cita');
        assert.include(tarjeta.textContent,'Responsable: Sara Díaz (Atencion al publico)');
        assert.notInclude(tarjeta.textContent,'Doctor:');
        assert.include(tarjeta.textContent,'Registro del paciente');
        assert.include(tarjeta.textContent,'Pendiente');
    });
    test('Error al cargar pasos se muestra y permite reintentar sin inventar asignaciones', async () => {
        ConsultaProcedimientoPasoService.prototype.listarParaConsultas.rejects({mensaje:'No se pudieron cargar los pasos'});
        router.manejarRuta('/dashboard'); await settle();
        assert.include(fixture.textContent,'No se pudieron cargar los pasos');
        assert.notExists(fixture.querySelector('.paciente__cita'));
        ConsultaProcedimientoPasoService.prototype.listarParaConsultas.resolves([]);
        fixture.querySelector('.paciente__reintentar').click(); await settle();
        assert.exists(fixture.querySelector('.calendar'));
    });
    test('Una respuesta pendiente no vuelve a montar la vista al salir', async () => {
        let resolver;
        ConsultaService.prototype.findAll.returns(new Promise(resolve => {resolver=resolve;}));
        router.manejarRuta('/consultas'); router.detener(); resolver(consultas); await settle();
        assert.equal(fixture.querySelector('#test-root').childElementCount, 0);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
