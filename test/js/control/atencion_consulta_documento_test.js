import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { documentoDelPaciente } from '../../../src/js/control/atencion_service.js';

export function pruebasDocumentoPaciente() {
    suite('Documento de atención filtrado por persona', () => {
        let sandbox, fetchStub;
        const persona = '30000000-0000-0000-0000-000000000001';
        const documento = (n, valor = 'Documento ' + n) => ({ idDocumento: `d0000000-0000-0000-0000-${String(n).padStart(12, '0')}`, idPersona: { idPersona: persona }, valor });
        const respuesta = (rows, total = rows.length) => new Response(JSON.stringify(rows), { headers: { 'Total-registros': String(total) } });
        setup(() => { sandbox = sinon.createSandbox(); fetchStub = sandbox.stub(window, 'fetch'); });
        teardown(() => sandbox.restore());
        async function rechaza(accion, texto) {
            let error; try { await accion(); } catch (e) { error = e; }
            assert.instanceOf(error, Error); assert.include(error.message, texto);
        }
        test('sin persona no consulta REST', async () => {
            assert.isNull(await documentoDelPaciente(null)); sinon.assert.notCalled(fetchStub);
        });
        test('sin documentos devuelve null con una petición filtrada', async () => {
            fetchStub.resolves(respuesta([])); assert.isNull(await documentoDelPaciente(persona));
            const url = new URL(fetchStub.firstCall.args[0]);
            assert.equal(url.searchParams.get('persona'), persona); assert.equal(url.searchParams.get('first'), '0'); assert.equal(url.searchParams.get('max'), '50');
        });
        test('123 documentos: recorre solo páginas de la persona y conserva selección por UUID', async () => {
            const rows = Array.from({ length: 123 }, (_, i) => documento(123 - i)); rows[122].valor = '   ';
            fetchStub.callsFake(async raw => {
                const url = new URL(raw); assert.equal(url.searchParams.get('persona'), persona);
                const first = Number(url.searchParams.get('first')); return respuesta(rows.slice(first, first + 50), rows.length);
            });
            assert.equal((await documentoDelPaciente(persona)).idDocumento, documento(2).idDocumento);
            assert.deepEqual(fetchStub.getCalls().map(call => new URL(call.args[0]).searchParams.get('first')), ['0', '50', '100']);
        });
        test('una respuesta ajena falla sin mostrar ni buscar documentos globales', async () => {
            fetchStub.resolves(respuesta([{ ...documento(1), idPersona: { idPersona: 'otra' } }]));
            await rechaza(() => documentoDelPaciente(persona), 'otra persona'); sinon.assert.calledOnce(fetchStub);
        });
        test('errores REST se propagan y no se convierten en ausencia de documento', async () => {
            fetchStub.resolves(new Response('', { status: 500 }));
            await rechaza(() => documentoDelPaciente(persona), '500'); sinon.assert.calledOnce(fetchStub);
        });
        test('no devuelve un documento parcial si la última página falta', async () => {
            fetchStub.onFirstCall().resolves(respuesta(Array.from({ length: 50 }, (_, i) => documento(i + 1)), 51));
            fetchStub.onSecondCall().resolves(respuesta([], 51));
            await rechaza(() => documentoDelPaciente(persona), 'completar');
        });
        test('detecta páginas repetidas en el resultado filtrado', async () => {
            fetchStub.callsFake(async () => respuesta(Array.from({ length: 50 }, (_, i) => documento(i + 1)), 101));
            await rechaza(() => documentoDelPaciente(persona), 'repitió');
        });
        test('codifica el parámetro y rechaza un formato de respuesta inesperado', async () => {
            fetchStub.resolves(new Response('{}'));
            await rechaza(() => documentoDelPaciente('persona /?&'), 'lista de documentos');
            assert.equal(new URL(fetchStub.firstCall.args[0]).searchParams.get('persona'), 'persona /?&');
        });
    });
}
