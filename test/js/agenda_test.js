import { assert } from './lib/chai/index.js';
import sinon from './lib/sinon/sinon-esm.js';
import { listarCompleto, validarPaciente, buscarCitas, cargarAgenda, ticketPDF, validarRango, diaAgenda } from '../../src/js/control/agenda_service.js';
import DefaultService from '../../src/js/control/default_service.js';
import { iniciarAplicacion } from '../../src/js/main.js';
import '../../src/js/boundary/vistas/citas_controller.js';
import '../../src/js/boundary/componentes/agenda.js';
const paciente = { idPersonaRol: 'pac', idPersona: { idPersona: 'persona', nombres: 'Ana' }, idClinica: { idClinica: 'cli', nombre: 'Central' }, idRol: { idRol: 'rp', nombre: 'Paciente' } };
const empleado = { ...paciente, idPersonaRol: 'emp', idRol: { idRol: 'med', nombre: 'Médico' } };
const consulta = { idConsulta: 'c1', idPersonaRol: paciente, fechaInicio: '2026-11-12T23:59:59-06:00' };
const procedimiento = { idConsultaProcedimiento: 'cp1', idConsulta: consulta, idProcedimiento: { idProcedimiento: 'pr1', nombre: 'General' } };
const origen = { idProcedimientoPaso: 'tri', nombre: 'Triaje', idRol: { idRol: 'enf' } };
const destino = { idProcedimientoPaso: 'at', nombre: 'Atención', idRol: { idRol: 'med' } };
const tipo = { idTipoDocumento: 'dui', nombre: 'DUI', activo: true, expresionRegular: '[0-9]{8}-[0-9]' };
const respuesta = datos => new Response(JSON.stringify(datos), { status: 200, headers: { 'Content-Type': 'application/json' } });
const settle = () => new Promise(r => setTimeout(r, 25));
mocha.setup('tdd');
suite('HU1/HU3: contratos, datos y ciclo de vida', () => {
 let sandbox, fetchStub, fixture, sesionPrevia, contextoPrevio;
 setup(() => {
  sesionPrevia = sessionStorage.getItem('sesionPersona'); contextoPrevio = sessionStorage.getItem('sesionPersonaRol');
  sessionStorage.removeItem('sesionPersona'); sessionStorage.removeItem('sesionPersonaRol');
  sandbox = sinon.createSandbox(); fixture = document.querySelector('#fixtures');
  fetchStub = sandbox.stub(globalThis, 'fetch');
  fetchStub.callsFake(async url => {
   const path = new URL(url).pathname.split('/resources/v1/')[1];
   const datos = { tipo_documento: [tipo], 'documento/buscar': { idPersona: paciente.idPersona }, 'persona_rol/persona/persona': [paciente, empleado], consulta: [consulta], consulta_procedimiento: [procedimiento], consulta_procedimiento_paso: [], procedimiento_paso_secuencia: [], 'procedimiento_paso/procedimiento/pr1': [destino] };
   if (path === 'consulta/c1') return respuesta(consulta);
   if (!(path in datos)) throw new Error('Petición no simulada: ' + path);
   return respuesta(datos[path]);
  });
 });
 teardown(() => { fixture.replaceChildren(); sandbox.restore(); for (const [clave, valor] of [['sesionPersona',sesionPrevia],['sesionPersonaRol',contextoPrevio]]) { if(valor === null) sessionStorage.removeItem(clave); else sessionStorage.setItem(clave,valor); } window.location.hash = ''; });
 test('formato inválido no hace peticiones', async () => { try { await validarPaciente(tipo, 'mal'); assert.fail(); } catch(e) { assert.include(e.message, 'formato'); } assert.equal(fetchStub.callCount, 0); });
 test('documento inexistente es distinto a fallo REST', async () => { fetchStub.resolves(new Response('', { status: 404 })); try { await validarPaciente(tipo, '00000000-0'); assert.fail(); } catch(e) { assert.equal(e.message, 'Documento no registrado'); } });
 test('solo devuelve inscripciones del paciente, sin crear sesión', async () => { const d = await validarPaciente(tipo, '00000000-0'); assert.deepEqual(d.contextos, [paciente]); assert.isNull(sessionStorage.getItem('sesionPersona')); });
 test('paginación completa supera 1000 registros', async () => { fetchStub.callsFake(async url => { const first = Number(new URL(url).searchParams.get('first')); return respuesta(Array.from({length: Math.min(50, 1051-first)}, (_,i) => ({ id: String(first+i) }))); }); assert.lengthOf(await listarCompleto('consulta', 'id'), 1051); });
 test('página repetida y total incompleto fallan', async () => { fetchStub.callsFake(async () => respuesta(Array.from({ length: 50 }, (_,i) => ({ id: String(i) })))); try { await listarCompleto('consulta','id'); assert.fail(); } catch(e) { assert.include(e.message, 'repitió'); } fetchStub.callsFake(async () => new Response('[]', { headers: { 'Total-registros': '10' } })); try { await listarCompleto('consulta','id'); assert.fail(); } catch(e) { assert.include(e.message, 'incompleta'); } });
 test('findAll tampoco trunca las estadísticas a 1000', async () => { let first = 0; sandbox.stub(DefaultService.prototype, 'findRange').callsFake(async () => { const datos = Array.from({ length: Math.min(50, 1001-first) }, (_,i) => ({ id: first+i })); first += datos.length; return { datos }; }); assert.lengthOf(await new DefaultService().findAll(), 1001); });
 test('filtra por inscripción, clínica y ambos días completos', async () => { fetchStub.callsFake(async url => new URL(url).pathname.endsWith('/consulta') ? respuesta([consulta, {...consulta, idConsulta:'otra', idPersonaRol:{...paciente,idPersonaRol:'otro'}}, {...consulta,idConsulta:'fuera',fechaInicio:'2026-11-13T00:00:00-06:00'}]) : respuesta([procedimiento])); assert.deepEqual((await buscarCitas([paciente], 'cli','2026-11-12','2026-11-12')).map(c=>c.idConsulta), ['c1']); });
 test('rango inválido y clínica ajena no consultan', async () => { assert.throws(()=>validarRango('2026-02-30','2026-03-01')); assert.throws(()=>validarRango('2026-11-13','2026-11-12')); try { await buscarCitas([paciente],'otra','2026-11-12','2026-11-12'); assert.fail(); } catch(e) { assert.include(e.message,'clínica'); } assert.equal(fetchStub.callCount,0); });
 test('días de negocio independientes de zona del navegador', () => { assert.equal(diaAgenda('2026-11-13T05:59:59Z'),'2026-11-12'); assert.equal(diaAgenda('2026-11-13T06:00:00Z'),'2026-11-13'); });
 test('PDF rechaza HTML, 404 y archivos vacíos', async () => { for (const response of [new Response('<html/>'), new Response('',{status:404}),new Response('',{headers:{'Content-Type':'application/pdf'}})]) { fetchStub.resolves(response); let fallo=false; try { await ticketPDF('c1'); } catch { fallo=true; } assert.isTrue(fallo); } });
 test('PDF conserva binario y Accept', async () => { fetchStub.resolves(new Response('%PDF-1.4', { headers:{'Content-Type':'application/pdf'} })); assert.equal((await ticketPDF('c1')).type,'application/pdf'); assert.equal(fetchStub.firstCall.args[1].headers.Accept,'application/pdf'); });
 test('HU1 descarta validación antigua al cambiar documento', async () => { const vista=document.createElement('galeno-citas'); fixture.append(vista); await settle(); vista.campo('tipo').value='dui'; vista.campo('tipo').dispatchEvent(new Event('input',{bubbles:true})); vista.campo('numero').value='00000000-0'; vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true})); let resolver; fetchStub.callsFake(()=>new Promise(r=>resolver=r)); const pendiente=vista.validar(); vista.campo('numero').value='nuevo'; vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true})); fetchStub.resolves(respuesta([paciente])); resolver(respuesta({ idPersona: paciente.idPersona })); await pendiente; assert.lengthOf(vista.contextos,0); assert.isTrue(vista.campo('clinica').disabled); });
 test('HU1 no actualiza catálogo después de desmontar', async () => { let resolver; fetchStub.callsFake(()=>new Promise(r=>resolver=r)); const vista=document.createElement('galeno-citas'); fixture.append(vista); vista.remove(); resolver(respuesta([tipo])); await settle(); assert.isTrue(vista.campo('tipo').disabled); });
 test('agenda cruza ramas por secuencia, no por fecha', async () => {
  const segundo = { ...origen, idProcedimientoPaso:'lab', nombre:'Laboratorio' };
  const rutas = { consulta:[consulta],consulta_procedimiento:[procedimiento],consulta_procedimiento_paso:[origen,segundo].map((d,i)=>({idConsultaProcedimientoPaso:'e'+i,idConsultaProcedimiento:procedimiento,idProcedimientoPaso:d,estado:'ESTADO_REAL',valor:'<img src=x onerror=alert(1)>',idPersonaRol:empleado})),procedimiento_paso_secuencia:[origen,segundo].map((d,i)=>({idProcedimientoPasoSecuencia:'s'+i,idProcedimientoPaso:d,idProcedimientoPasoReferencia:destino,tipoSecuencia:'REAL'})), 'procedimiento_paso/procedimiento/pr1':[origen,segundo,destino] };
  fetchStub.callsFake(async url=>respuesta(rutas[new URL(url).pathname.split('/resources/v1/')[1]]));
  const lista=await cargarAgenda(empleado,'2026-11-12','2026-11-12'); assert.lengthOf(lista[0].procedimientos[0].pasosPrevios,2);
  const vista=document.createElement('galeno-agenda'); vista.usuario=empleado; fixture.append(vista); vista.querySelectorAll('input').forEach(i=>i.value='2026-11-12'); await vista.cargar(); assert.isNull(vista.querySelector('img')); assert.include(vista.querySelector('pre').textContent,'<img');
  let ruta; vista.addEventListener('galeno-navegar', e=>ruta=e.detail.ruta); vista.querySelector('[data-consulta]').click(); assert.equal(ruta,'/atencion/c1');
 });
 test('selector limita roles a clínica y excluye paciente', async () => { const selector=document.createElement('galeno-selector-contexto'); selector.usuario=empleado; fixture.append(selector); await settle(); assert.lengthOf(selector.querySelectorAll('[name="rol"] option'),1); assert.equal(selector.querySelector('[name="rol"]').value,'emp'); });
 test('cambio de contexto valida pertenencia y actualiza router, app y storage', async () => {
  const otro={...empleado,idPersonaRol:'emp2',idClinica:{idClinica:'cli2',nombre:'Norte'}};
  fetchStub.callsFake(async url => { const path=new URL(url).pathname.split('/resources/v1/')[1]; if(path.startsWith('persona_rol/')) return respuesta([empleado,otro]); return respuesta([]); });
  sessionStorage.setItem('sesionPersona',JSON.stringify(empleado.idPersona)); sessionStorage.setItem('sesionPersonaRol','emp');
  const app=document.createElement('galeno-app'); fixture.append(app); window.location.hash='/dashboard'; const control=iniciarAplicacion(app); await control.listo;
  app.dispatchEvent(new CustomEvent('galeno-contexto-seleccionado',{detail:{personaRol:otro}})); await settle(); assert.equal(app.usuario.idPersonaRol,'emp2'); assert.equal(sessionStorage.getItem('sesionPersonaRol'),'emp2'); assert.equal(app.querySelector('resumen-controller').usuario.idPersonaRol,'emp2');
  app.dispatchEvent(new CustomEvent('galeno-contexto-seleccionado',{detail:{personaRol:{idPersonaRol:'ajeno'}}})); await settle(); assert.equal(app.usuario.idPersonaRol,'emp2'); control.detener();
 });
 test('HU4 recarga por identificador y rechaza otra clínica', async () => { const vista=document.createElement('consulta-controller'); vista.usuario=empleado; vista.parametros={idConsulta:'c1'}; fixture.append(vista); await settle(); assert.lengthOf(vista.querySelectorAll('tarjeta-consulta'),1); vista.remove(); vista.usuario={...empleado,idClinica:{idClinica:'otra'}}; fixture.append(vista); await settle(); assert.include(vista.textContent,'no pertenece'); });
 test('un fallo REST nunca se convierte en cero citas', async () => { fetchStub.resolves(new Response('Error interno',{status:500})); let error; try { await buscarCitas([paciente],'cli','2026-11-12','2026-11-12'); } catch(e) {error=e;} assert.include(error.message,'500'); });
 test('HU1 descarta resultados al cambiar filtros durante una búsqueda', async () => {
  const vista=document.createElement('galeno-citas');fixture.append(vista);await settle();vista.contextos=[paciente];vista.campo('clinica').innerHTML='<option value="cli">Central</option>';vista.campo('clinica').disabled=false;vista.campo('desde').value='2026-11-12';vista.campo('hasta').value='2026-11-12';vista.sincronizar();
  let resolver;fetchStub.callsFake(()=>new Promise(r=>resolver=r));const pendiente=vista.buscar();vista.campo('hasta').value='2026-11-13';vista.campo('hasta').dispatchEvent(new Event('input',{bubbles:true}));fetchStub.resolves(respuesta([procedimiento]));resolver(respuesta([consulta]));await pendiente;assert.isNull(vista.querySelector('galeno-tarjeta-cita'));assert.isFalse(vista.querySelector('[type="submit"]').disabled);
 });
 test('ticket queda deshabilitado mientras backend no publique el endpoint', async () => { const tarjeta=document.createElement('galeno-tarjeta-cita');tarjeta.cita={...consulta,procedimientos:[procedimiento]};fixture.append(tarjeta);await tarjeta.descargar();assert.include(tarjeta.querySelector('[role="status"]').textContent,'todavía no está disponible');assert.isTrue(tarjeta.querySelector('button').disabled);assert.equal(fetchStub.callCount,0); });
 test('descarga revoca Object URL y no duplica envíos', async () => {const reloj=sandbox.useFakeTimers();const crear=sandbox.stub(URL,'createObjectURL').returns('blob:test');const revocar=sandbox.stub(URL,'revokeObjectURL');sandbox.stub(HTMLAnchorElement.prototype,'click');let resolver;fetchStub.callsFake(()=>new Promise(r=>resolver=r));const tarjeta=document.createElement('galeno-tarjeta-cita');tarjeta.cita={...consulta,procedimientos:[]};fixture.append(tarjeta);tarjeta.querySelector('button').disabled=false;const descarga=tarjeta.descargar();await tarjeta.descargar();assert.equal(fetchStub.callCount,1);resolver(new Response('%PDF',{headers:{'Content-Type':'application/pdf'}}));await descarga;assert.equal(crear.callCount,1);await reloj.tickAsync(1000);sinon.assert.calledWith(revocar,'blob:test');});
 test('agenda descarta carga tardía al desmontar', async () => {let resolver;fetchStub.callsFake(()=>new Promise(r=>resolver=r));const vista=document.createElement('galeno-agenda');vista.usuario=empleado;fixture.append(vista);vista.remove();resolver(respuesta([]));await settle();assert.include(vista.textContent,'Cargando agenda');});

});
mocha.run(fallos=>{ globalThis.__resultadoMocha={fallos}; });
