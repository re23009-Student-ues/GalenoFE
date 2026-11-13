import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { establecerContexto, obtenerContexto } from '../../../src/js/control/sesion_service.js';
import { esPaciente } from '../../../src/js/control/roles.js';
import '../../../src/js/boundary/menu_lateral.js';
import { crearRouter } from '../../../src/js/router.js';
import { cargarResumen, listarConsultas } from '../../../src/js/control/resumen_service.js';
import ConsultaService from '../../../src/js/control/consulta_service.js';
import ConsultaProcedimientoPasoService from '../../../src/js/control/consultaProcedimientoPaso_service.js';

// Cobertura del personal migrada de paciente_test.js antes de retirar el portal.
const paciente = { idPersonaRol: 'paciente-1', idRol: { nombre: 'Paciente' }, idPersona: { idPersona: 'persona-1', nombres: 'Ana' }, idClinica: { idClinica: 'clinica-1', nombre: 'Central' } };
const otro = { ...paciente, idPersonaRol: 'paciente-2', idPersona: { idPersona: 'persona-2', nombres: 'Luis' } };
const medico = { ...paciente, idPersonaRol: 'medico-1', idRol: { nombre: 'Médico' } };
const consultas = [
    { idConsulta: 'primera', idPersonaRol: paciente, fechaInicio: new Date(Date.now() + 86400000).toISOString() },
    { idConsulta: 'segunda', idPersonaRol: otro, fechaInicio: new Date(Date.now() + 86400000).toISOString() },
    { idConsulta: 'externa', idPersonaRol: { ...paciente, idClinica: { idClinica: 'otra' } }, fechaInicio: new Date(Date.now() + 86400000).toISOString() }
];
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
mocha.setup('tdd');
suite('Contexto, dashboard y consultas del personal', () => {
    let fixture, sandbox, router, contextoPrevio;
    setup(() => {
        contextoPrevio = sessionStorage.getItem('sesionPersonaRol');
        sandbox = sinon.createSandbox();
        sandbox.stub(ConsultaService.prototype, 'findAll').resolves(consultas);
        sandbox.stub(ConsultaProcedimientoPasoService.prototype, 'listarParaConsultas').resolves([]);
        fixture = document.querySelector('#fixtures');
        fixture.innerHTML = '<galeno-menu></galeno-menu><h1 id="test-title"></h1><div id="test-root"></div>';
        router = crearRouter({ contenedor: fixture.querySelector('#test-root'), tituloEl: fixture.querySelector('#test-title'), obtenerUsuario: () => medico });
    });
    teardown(() => {
        router.detener(); fixture.replaceChildren(); sandbox.restore();
        if (contextoPrevio === null) sessionStorage.removeItem('sesionPersonaRol');
        else sessionStorage.setItem('sesionPersonaRol', contextoPrevio);
    });

    test('el contexto conserva el persona_rol del empleado', () => {
        establecerContexto(medico);
        assert.equal(obtenerContexto(), medico.idPersonaRol);
    });
    test('la detección de Paciente sigue tolerando mayúsculas y espacios', () => {
        assert.isTrue(esPaciente({ idRol: { nombre: ' PACIENTE ' } }));
        assert.isFalse(esPaciente(medico)); assert.isFalse(esPaciente(null));
    });
    test('el personal recibe las consultas de su clínica, no las externas', async () => {
        assert.deepEqual((await listarConsultas(medico)).map(c => c.idConsulta).sort(), ['primera', 'segunda']);
        const resumen = await cargarResumen(medico);
        assert.lengthOf(resumen.consultas, 2);
        assert.equal(resumen.clinica, 'Central');
    });
    test('el menú conserva solo Inicio y Agenda Médica', () => {
        const enlaces = [...fixture.querySelectorAll('a[data-route]')];
        assert.deepEqual(enlaces.map(a => a.dataset.route), ['/dashboard', '/consultas']);
        assert.deepEqual(enlaces.map(a => a.textContent), ['Inicio', 'Agenda Médica']);
    });
    test('el personal conserva resumen y agenda existentes', async () => {
        router.manejarRuta('/dashboard'); await settle();
        assert.exists(fixture.querySelector('resumen-controller'));
        assert.equal(fixture.querySelector('#test-title').textContent, 'Resumen');
        router.manejarRuta('/consultas'); await settle();
        assert.exists(fixture.querySelector('consulta-controller'));
        assert.equal(fixture.querySelector('#test-title').textContent, 'Agenda Médica');
        assert.lengthOf(fixture.querySelectorAll('tarjeta-consulta'), 2);
    });
    test('salir del dashboard libera su gráfica', async () => {
        router.manejarRuta('/dashboard'); await settle();
        const pantalla = fixture.querySelector('resumen-controller');
        const grafica = pantalla.grafica;
        assert.exists(grafica);
        router.detener();
        assert.isTrue(grafica.destroyed); assert.isNull(pantalla.grafica);
    });
    test('una respuesta pendiente no vuelve a montar consultas al salir', async () => {
        let resolver;
        ConsultaService.prototype.findAll.returns(new Promise(resolve => { resolver = resolve; }));
        router.manejarRuta('/consultas'); router.detener(); resolver(consultas); await settle();
        assert.equal(fixture.querySelector('#test-root').childElementCount, 0);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
