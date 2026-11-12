import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import DefaultError from '../../../src/js/entity/default_error.js';
import TipoDocumentoService from '../../../src/js/control/tipoDocumento_service.js';
import {
    autenticarEmpleado, buscarDocumento, rolesDePersona,
    guardarSesion, obtenerSesion, cerrarSesion, establecerContexto, obtenerContexto
} from '../../../src/js/control/sesion_service.js';

mocha.setup('tdd');
suite('Autenticación del personal por documento (HU2)', () => {
    const tipo = { idTipoDocumento: 'dui', expresionRegular: '[0-9]{8}-[0-9]' };
    const valor = '01234567-8';
    const persona = { idPersona: 'persona/1', nombres: 'Ana', apellidos: 'López' };
    const documento = { idDocumento: 'doc-1', idPersona: persona };
    const paciente = { idRol: { nombre: ' Paciente ' }, idClinica: { idClinica: '1' } };
    let sandbox, fetchStub, sesionAnterior, personaAnterior;
    const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), { status });

    async function rechaza(promesa, mensaje) {
        try {
            await promesa;
        } catch (error) {
            assert.instanceOf(error, DefaultError);
            assert.equal(error.mensaje, mensaje);
            return error;
        }
        assert.fail('Se esperaba un rechazo con DefaultError');
    }

    setup(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(window, 'fetch');
        sesionAnterior = sessionStorage.getItem('sesionPersonaRol');
        personaAnterior = sessionStorage.getItem('sesionPersona');
        cerrarSesion();
    });

    teardown(() => {
        sandbox.restore();
        cerrarSesion();
        if (sesionAnterior !== null) sessionStorage.setItem('sesionPersonaRol', sesionAnterior);
        if (personaAnterior !== null) sessionStorage.setItem('sesionPersona', personaAnterior);
    });

    test('documento inexistente: buscar devuelve null y autenticar rechaza', async () => {
        fetchStub.callsFake(async () => respuesta(null, 404));
        assert.isNull(await buscarDocumento(tipo.idTipoDocumento, valor));
        await rechaza(autenticarEmpleado(tipo, valor), 'Documento no registrado');
        assert.equal(fetchStub.callCount, 2);
    });

    test('formato inválido no consulta al backend y exige coincidencia completa', async () => {
        for (const invalido of ['123', `x${valor}`, `${valor}x`, '', null]) {
            await rechaza(autenticarEmpleado(tipo, invalido), 'El formato del documento no es válido');
        }
        sinon.assert.notCalled(fetchStub);
    });

    test('regex ausente o inválida se rechaza antes de consultar', async () => {
        await rechaza(autenticarEmpleado({}, valor), 'El tipo de documento no tiene una expresión regular válida');
        await rechaza(autenticarEmpleado({ expresionRegular: '[' }, valor), 'La expresión regular del tipo de documento no es válida');
        sinon.assert.notCalled(fetchStub);
    });

    test('una persona que solo es paciente no puede ingresar', async () => {
        fetchStub.onFirstCall().resolves(respuesta(documento));
        fetchStub.onSecondCall().resolves(respuesta([paciente]));
        await rechaza(autenticarEmpleado(tipo, valor), 'Solo el personal puede ingresar');
    });

    test('sin roles tampoco puede ingresar', async () => {
        fetchStub.onFirstCall().resolves(respuesta(documento));
        fetchStub.onSecondCall().resolves(respuesta([]));
        await rechaza(autenticarEmpleado(tipo, valor), 'Solo el personal puede ingresar');
    });

    test('empleado con dos roles en dos clínicas conserva ambos y descarta Paciente', async () => {
        const roles = [
            { idPersonaRol: 'r1', idRol: { nombre: 'Médico' }, idClinica: { idClinica: '1' } },
            { idPersonaRol: 'r2', idRol: { nombre: 'Recepción' }, idClinica: { idClinica: '2' } }
        ];
        fetchStub.onFirstCall().resolves(respuesta(documento));
        fetchStub.onSecondCall().resolves(respuesta([paciente, ...roles]));
        assert.deepEqual(await autenticarEmpleado(tipo, valor), { persona, personaRoles: roles });
        const url = new URL(fetchStub.firstCall.args[0]);
        assert.equal(url.pathname, '/GalenoSV-1.0-SNAPSHOT/resources/v1/documento/buscar');
        assert.equal(url.searchParams.get('tipo'), 'dui');
        assert.equal(url.searchParams.get('valor'), valor);
        assert.equal(fetchStub.secondCall.args[0], `${url.origin}/GalenoSV-1.0-SNAPSHOT/resources/v1/persona_rol/persona/persona%2F1`);
        sinon.assert.alwaysCalledWith(fetchStub, sinon.match.string, { method: 'GET' });
        assert.isNull(obtenerSesion()); // Autenticar no persiste ni selecciona un rol.
    });

    test('codifica los parámetros del documento sin alterar sus valores', async () => {
        fetchStub.resolves(respuesta(documento));
        assert.deepEqual(await buscarDocumento('tipo & otro', 'A+B/#?'), documento);
        const url = new URL(fetchStub.firstCall.args[0]);
        assert.equal(url.searchParams.get('tipo'), 'tipo & otro');
        assert.equal(url.searchParams.get('valor'), 'A+B/#?');
    });

    test('error de red en ambas consultas se transforma en DefaultError', async () => {
        const causa = new TypeError('Sin conexión');
        fetchStub.rejects(causa);
        const error = await rechaza(autenticarEmpleado(tipo, valor), 'Error al acceder al repositorio');
        assert.strictEqual(error.error, causa);
        fetchStub.reset();
        fetchStub.onFirstCall().resolves(respuesta(documento));
        fetchStub.onSecondCall().rejects(causa);
        await rechaza(autenticarEmpleado(tipo, valor), 'Error al acceder al repositorio');
    });

    test('errores HTTP distintos del 404 de documento se rechazan', async () => {
        fetchStub.resolves(respuesta(null, 422));
        await rechaza(buscarDocumento('dui', ''), 'Error al obtener los datos: 422');
        fetchStub.reset();
        fetchStub.callsFake(async () => respuesta(null, 404));
        await rechaza(rolesDePersona('1'), 'Error al obtener los datos: 404');
        fetchStub.reset();
        fetchStub.resolves(respuesta(null, 500));
        await rechaza(buscarDocumento('dui', valor), 'Error al obtener los datos: 500');
    });

    test('JSON inválido se transforma en DefaultError', async () => {
        fetchStub.callsFake(async () => new Response('no es JSON', { status: 200 }));
        await rechaza(buscarDocumento('dui', valor), 'Error al procesar los datos de respuesta');
        await rechaza(rolesDePersona('1'), 'Error al procesar los datos de respuesta');
    });

    test('guarda solo la identidad de la persona y cerrar borra la sesión', () => {
        establecerContexto({ idPersonaRol: 'rol-anterior' });
        guardarSesion({ ...persona, idRol: { nombre: 'Médico' }, idClinica: { idClinica: '1' } });
        assert.deepEqual(obtenerSesion(), persona);
        assert.deepEqual(JSON.parse(sessionStorage.getItem('sesionPersona')), persona);
        assert.isNull(sessionStorage.getItem('sesionPersonaRol'));
        cerrarSesion();
        assert.isNull(obtenerSesion());
        sessionStorage.setItem('sesionPersona', 'JSON inválido');
        assert.isNull(obtenerSesion());
    });

    test('establece el contexto por separado y cerrar borra persona y contexto', () => {
        guardarSesion(persona);
        establecerContexto({ idPersonaRol: 'rol-actual', idClinica: { idClinica: '1' } });
        assert.equal(obtenerContexto(), 'rol-actual');
        assert.deepEqual(obtenerSesion(), persona);
        cerrarSesion();
        assert.isNull(obtenerContexto());
        assert.isNull(obtenerSesion());
    });

    test('TipoDocumentoService consulta el catálogo con DefaultService', async () => {
        fetchStub.resolves(respuesta([tipo]));
        const servicio = new TipoDocumentoService();
        assert.deepEqual(await servicio.findAll(), [tipo]);
        sinon.assert.calledWith(fetchStub, `${servicio.BASE_URL}tipo_documento?first=0&max=50`, { method: 'GET' });
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
