import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { prefijoOrdenExamen, indicacionesOrdenExamen, textoOrdenExamen, ordenesDeExamenes, registrarOrdenAtencion } from '../../../src/js/control/atencion_service.js';

export function pruebasOrdenesExamen() {
    suite('HU4: órdenes identificadas por nombre de paso y examen', () => {
        let sandbox, fetchStub, paso, examen, ordenes, posts;
        const contexto = { idPersonaRol: 'empleado', idRol: { idRol: 'doctor' }, idClinica: { idClinica: 'clinica' } };
        const idOrden = '12345678-1234-1234-1234-123456789abc';
        const response = dato => new Response(JSON.stringify(dato));
        setup(() => {
            paso = { idConsultaProcedimientoPaso: 'paso', estado: 'PENDIENTE', idPersonaRol: contexto,
                idProcedimientoPaso: { idProcedimientoPaso: 'def', nombre: 'Evaluación (A+B)?', idRol: contexto.idRol },
                idConsultaProcedimiento: { idConsulta: { idConsulta: 'consulta', idPersonaRol: { idClinica: contexto.idClinica } } } };
            examen = { idProcedimientoPasoExamen: 'config', activo: true, idProcedimientoPaso: paso.idProcedimientoPaso,
                idExamen: { idExamen: 'examen', nombre: 'Hemograma [I].*', activo: true } };
            ordenes = []; posts = 0; sandbox = sinon.createSandbox();
            fetchStub = sandbox.stub(window, 'fetch').callsFake(async (raw, opciones) => {
                const url = new URL(raw), ruta = url.pathname.split('/resources/v1/')[1];
                if (opciones.method === 'POST') {
                    posts++; const body = JSON.parse(opciones.body);
                    assert.deepEqual(Object.keys(body).sort(), ['idConsultaProcedimientoPaso', 'indicaciones']);
                    assert.deepEqual(body.idConsultaProcedimientoPaso, { idConsultaProcedimientoPaso: 'paso' });
                    ordenes.push({ idOrdenExamen: idOrden, indicaciones: body.indicaciones, idConsultaProcedimientoPaso: paso });
                    return new Response(null, { status: 201, headers: { Location: new URL(`orden_examen/${idOrden}`, raw).href } });
                }
                if (ruta === 'consulta_procedimiento_paso/paso') return response(paso);
                if (ruta === `orden_examen/${idOrden}`) return response(ordenes[0]);
                assert.equal(ruta, 'orden_examen'); assert.equal(url.searchParams.get('consultas'), 'consulta');
                return new Response(JSON.stringify(ordenes), { headers: { 'Total-registros': String(ordenes.length) } });
            });
        });
        teardown(() => sandbox.restore());
        const orden = texto => ({ idOrdenExamen: idOrden, idConsultaProcedimientoPaso: paso, indicaciones: texto });
        const registrar = () => registrarOrdenAtencion(paso, examen, 'Ayuno\nOcho horas', contexto, 'consulta');
        async function rechaza(fn, mensaje) {
            let error; try { await fn(); } catch (e) { error = e; }
            assert.instanceOf(error, Error); if (mensaje) assert.include(error.message, mensaje);
        }
        test('serializa el prefijo y recupera texto multilínea escapando metacaracteres de regex', () => {
            const texto = indicacionesOrdenExamen(paso, examen, 'Ayuno\nOcho horas');
            assert.equal(texto, '[Evaluación (A+B)?] [Hemograma [I].*] Ayuno\nOcho horas');
            assert.equal(textoOrdenExamen(paso, examen, orden(texto)), 'Ayuno\nOcho horas');
            assert.equal(textoOrdenExamen(paso, examen, orden(prefijoOrdenExamen(paso, examen))), '');
        });
        test('acepta solo prefijo completo al inicio y nombres literales', () => {
            const prefijo = prefijoOrdenExamen(paso, examen);
            for (const texto of ['texto ' + prefijo, prefijo + 'Otro', '[Evaluación AAA] [Hemograma IZZ]', 'Indicación histórica']) {
                assert.isNull(textoOrdenExamen(paso, examen, orden(texto)));
            }
        });
        test('no cruza ejecuciones ni configuraciones de otro paso aunque los nombres coincidan', () => {
            const dato = orden(prefijoOrdenExamen(paso, examen));
            assert.isNull(textoOrdenExamen({ ...paso, idConsultaProcedimientoPaso: 'otra' }, examen, dato));
            assert.isNull(textoOrdenExamen(paso, { ...examen, idProcedimientoPaso: { idProcedimientoPaso: 'otra' } }, dato));
        });
        test('nombres vacíos o con saltos de línea no generan asociaciones', () => {
            assert.throws(() => prefijoOrdenExamen(paso, { idExamen: { nombre: '' } }), /nombres/);
            assert.throws(() => prefijoOrdenExamen(paso, { idExamen: { nombre: 'Examen\nOtro' } }), /nombres/);
        });
        test('asocia únicamente una configuración y una orden por prefijo', () => {
            const dato = orden(prefijoOrdenExamen(paso, examen));
            assert.strictEqual(ordenesDeExamenes(paso, [examen], [dato]).get('config'), dato);
            assert.equal(ordenesDeExamenes(paso, [examen], [dato, { ...dato, idOrdenExamen: 'otra' }]).size, 0);
            assert.equal(ordenesDeExamenes(paso, [examen, { ...examen, idProcedimientoPasoExamen: 'otra' }], [dato]).size, 0);
        });
        test('POST mínimo, Location y relectura recuperan la orden; guardar otra vez no duplica', async () => {
            assert.equal((await registrar()).idOrdenExamen, idOrden); await registrar();
            assert.equal(posts, 1); assert.lengthOf(ordenes, 1);
        });
        test('una orden preexistente se recupera sin POST ni sobrescribir sus indicaciones', async () => {
            ordenes.push(orden(indicacionesOrdenExamen(paso, examen, 'Previas')));
            assert.equal((await registrar()).indicaciones, ordenes[0].indicaciones); assert.equal(posts, 0);
        });
        test('no crea ante órdenes duplicadas ni examen inactivo o ajeno', async () => {
            ordenes.push(orden(prefijoOrdenExamen(paso, examen)), { ...orden(prefijoOrdenExamen(paso, examen)), idOrdenExamen: 'otra-orden' });
            await rechaza(registrar, 'varias órdenes'); assert.equal(posts, 0);
            examen.activo = false; await rechaza(registrar, 'no está disponible');
            examen.activo = true; examen.idProcedimientoPaso = { idProcedimientoPaso: 'otro' };
            await rechaza(registrar, 'no está disponible'); assert.equal(posts, 0);
        });
        test('otro rol, clínica o estado no crea órdenes', async () => {
            await rechaza(() => registrarOrdenAtencion(paso, examen, '', { ...contexto, idRol: { idRol: 'otro' } }, 'consulta'), 'rol');
            await rechaza(() => registrarOrdenAtencion(paso, examen, '', { ...contexto, idClinica: { idClinica: 'otra' } }, 'consulta'), 'clínica');
            paso.estado = 'CANCELADO'; await rechaza(registrar, 'no permite'); assert.equal(posts, 0);
        });
        test('respuesta POST perdida recupera por prefijo sin un segundo envío', async () => {
            fetchStub.withArgs(sinon.match(/\/orden_examen$/), sinon.match({ method: 'POST' })).callsFake(async (raw, opciones) => {
                posts++; ordenes.push(orden(JSON.parse(opciones.body).indicaciones)); throw new Error('Respuesta perdida');
            });
            await rechaza(registrar); assert.equal((await registrar()).idOrdenExamen, idOrden); assert.equal(posts, 1);
        });
        test('confirmación perdida sin registro visible no repite automáticamente el POST', async () => {
            fetchStub.withArgs(sinon.match(/\/orden_examen$/), sinon.match({ method: 'POST' })).rejects(new Error('Sin respuesta'));
            await rechaza(registrar); await rechaza(registrar, 'No se pudo confirmar');
            assert.equal(fetchStub.getCalls().filter(c => c.args[1].method === 'POST').length, 1);
        });
        test('Una orden rechazada explícitamente se puede corregir y reenviar', async () => {
            const post = fetchStub.withArgs(sinon.match(/\/orden_examen$/), sinon.match({ method: 'POST' }));
            post.onFirstCall().resolves(new Response('', { status: 422 }));
            post.onSecondCall().callsFake(async (raw, opciones) => {
                ordenes.push(orden(JSON.parse(opciones.body).indicaciones));
                return new Response(null, { status: 201, headers: { Location: `${raw}/${idOrden}` } });
            });
            await rechaza(registrar, '422');
            assert.isEmpty(ordenes);
            const corregida = await registrarOrdenAtencion(paso, examen, 'Ayuno de ocho horas', contexto, 'consulta');
            assert.include(corregida.indicaciones, 'Ayuno de ocho horas');
            sinon.assert.calledTwice(post);
            assert.lengthOf(ordenes, 1);
        });

        test('El cliente rechaza una referencia que devuelve una orden distinta y recupera el registro sin otro POST', async () => {
            const consultaOrden = fetchStub.withArgs(sinon.match(new RegExp('/orden_examen/' + idOrden + '$')));
            consultaOrden.resolves(response({ ...orden('Indicaciones distintas'), idOrdenExamen: 'otra-orden' }));
            await rechaza(registrar, 'no corresponde');
            assert.equal(posts, 1);
            assert.equal((await registrar()).idOrdenExamen, idOrden);
            assert.equal(posts, 1);
            sinon.assert.calledOnce(consultaOrden);
        });

        test('Location ajeno no se sigue y un reintento recupera la orden creada', async () => {
            fetchStub.withArgs(sinon.match(/\/orden_examen$/), sinon.match({ method: 'POST' })).callsFake(async (raw, opciones) => {
                posts++; ordenes.push(orden(JSON.parse(opciones.body).indicaciones));
                return new Response(null, { status: 201, headers: { Location: 'https://ajeno.test/orden_examen/' + idOrden } });
            });
            await rechaza(registrar, 'referencia válida'); assert.equal((await registrar()).idOrdenExamen, idOrden);
            assert.equal(posts, 1); assert.isFalse(fetchStub.getCalls().some(c => c.args[0].startsWith('https://ajeno.test')));
        });
    });
}
