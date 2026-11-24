import { assert } from '../../lib/chai/index.js';
import sinon from '../../lib/sinon/sinon-esm.js';
import { respuestaRelacionesFixture } from '../../control/relaciones_fixture.js';
import '../../../../src/js/boundary/vistas/consulta_controller.js';

const clinica = { idClinica: 'cli' };
const paciente = { idPersonaRol: 'pac', idPersona: { idPersona: 'persona', nombres: 'Ana' }, idClinica: clinica };
const empleado = { idPersonaRol: 'emp', idRol: { idRol: 'med', nombre: 'Médico' }, idClinica: clinica };
const consulta = { idConsulta: 'c1', idPersonaRol: paciente, fechaInicio: '2026-11-12T23:59:59-06:00' };
const paso = {
    idConsultaProcedimientoPaso: 'paso-1',
    idConsultaProcedimiento: { idConsultaProcedimiento: 'cp-1', idConsulta: consulta },
    idPersonaRol: empleado,
    estado: 'PENDIENTE'
};
const tipo = { idTipoDocumento: 'dui', nombre: 'DUI', activo: true };
const respuesta = datos => new Response(JSON.stringify(datos));
const settle = () => new Promise(resolve => setTimeout(resolve, 25));
async function esperar(elemento, selector) {
    for (let intento = 0; intento < 20; intento++) {
        const encontrado = elemento.querySelector(selector);
        if (encontrado) return encontrado;
        await settle();
    }
    assert.fail(`No apareció ${selector}`);
}

suite('Agenda Médica: búsqueda por documento', () => {
    let sandbox, fetchStub, fixture;

    setup(() => {
        fixture = document.querySelector('#fixtures');
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(window, 'fetch').callsFake(async raw => {
            const recurso = new URL(raw).pathname.split('/resources/v1/')[1];
            const datos = { consulta: [consulta], consulta_procedimiento_paso: [paso] };
            return respuestaRelacionesFixture(raw, datos[recurso] ?? []);
        });
    });

    teardown(() => {
        fixture.replaceChildren();
        sandbox.restore();
    });

    test('Agenda Médica usa únicamente el tipo elegido y descarta una búsqueda reiniciada', async () => {
        const pasaporte = { ...tipo, idTipoDocumento: 'pasaporte', nombre: 'Pasaporte' };
        fetchStub.withArgs(sinon.match(/tipo_documento/)).resolves(respuesta([tipo, pasaporte, {
            ...tipo, idTipoDocumento: 'inactivo', activo: false
        }]));
        const buscar = fetchStub.withArgs(sinon.match(/documento\/buscar/));
        let resolver;
        buscar.onFirstCall().callsFake(() => new Promise(resolve => { resolver = resolve; }));
        buscar.onSecondCall().resolves(new Response(null, { status: 404 }));

        const agenda = document.createElement('consulta-controller');
        agenda.usuario = empleado;
        fixture.append(agenda);
        const formulario = await esperar(agenda, 'form');
        const { tipo: selector, documento } = formulario.elements;
        const reiniciar = formulario.querySelector('[type="reset"]');
        await esperar(selector, 'option[value="pasaporte"]');
        assert.deepEqual([...selector.options].map(opcion => opcion.value), ['', 'dui', 'pasaporte']);

        const enviar = (tipoDocumento, valor) => {
            selector.value = tipoDocumento;
            selector.dispatchEvent(new Event('change'));
            documento.value = valor;
            formulario.requestSubmit();
        };
        enviar('pasaporte', 'P12345');
        formulario.requestSubmit();
        sinon.assert.calledOnce(buscar);
        assert.isTrue(documento.disabled);
        reiniciar.click();
        enviar('dui', '00000000-0');
        await settle();
        assert.include(agenda.querySelector('[role="status"]').textContent, 'No hay consultas asignadas que coincidan');
        resolver(respuesta({ idPersona: paciente.idPersona }));
        await settle();
        assert.notExists(agenda.querySelector('tarjeta-consulta'));
        assert.isTrue(selector.disabled);
        assert.deepEqual(buscar.getCalls().map(llamada => {
            const params = new URL(llamada.args[0]).searchParams;
            return [params.get('tipo'), params.get('valor')];
        }), [['pasaporte', 'P12345'], ['dui', '00000000-0']]);
        reiniciar.click();
        assert.exists(agenda.querySelector('tarjeta-consulta'));
    });

    test('Agenda Médica conserva la lista si falla el catálogo y recupera el selector al reiniciar', async () => {
        const catalogo = fetchStub.withArgs(sinon.match(/tipo_documento/));
        catalogo.onFirstCall().resolves(new Response(null, { status: 500 }));
        catalogo.onSecondCall().resolves(respuesta([tipo]));

        const agenda = document.createElement('consulta-controller');
        agenda.usuario = empleado;
        fixture.append(agenda);
        const formulario = await esperar(agenda, 'form');
        const selector = formulario.elements.tipo;
        await esperar(formulario, '[type="reset"]:not([hidden])');
        assert.isTrue(selector.disabled);
        assert.include(selector.textContent, 'No se pudieron cargar los tipos');
        assert.exists(agenda.querySelector('tarjeta-consulta'));
        formulario.querySelector('[type="reset"]').click();
        await settle();
        assert.isFalse(selector.disabled);
        assert.exists(selector.querySelector('option[value="dui"]'));
        assert.isTrue(formulario.elements.documento.disabled);
    });
});
