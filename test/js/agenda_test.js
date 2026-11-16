import { respuestaRelacionesFixture, estadosFixture, dashboardFixture } from './control/relaciones_fixture.js';
import { assert } from './lib/chai/index.js';
import sinon from './lib/sinon/sinon-esm.js';
import { listarCompleto, validarPaciente, buscarCitas, filtrarCitas, validarFormatoDocumento, cargarAgenda, ticketPDF, validarRango, diaAgenda } from '../../src/js/control/agenda_service.js';
import { ejemploDocumento } from '../../src/js/control/documento_formato.js';
import DefaultService from '../../src/js/control/default_service.js';
import { iniciarAplicacion } from '../../src/js/main.js';
import '../../src/js/boundary/vistas/citas_controller.js';
import '../../src/js/boundary/componentes/agenda.js';
const paciente = { idPersonaRol: 'pac', idPersona: { idPersona: 'persona', nombres: 'Ana' }, idClinica: { idClinica: 'cli', nombre: 'Central' }, idRol: { idRol: 'rp', nombre: 'Paciente' } };
const empleado = { ...paciente, idPersonaRol: 'emp', idRol: { idRol: 'med', nombre: 'Médico' } };
const consulta = { idConsulta: 'c1', idPersonaRol: paciente, fechaInicio: '2026-11-12T23:59:59-06:00' };
const procedimiento = { idConsultaProcedimiento: 'cp1', idConsulta: consulta, idProcedimiento: { idProcedimiento: 'pr1', nombre: 'General' } };
const origen = { idProcedimientoPaso: 'tri', idProcedimiento: { idProcedimiento: 'pr1' }, nombre: 'Triaje', idRol: { idRol: 'enf' } };
const destino = { idProcedimientoPaso: 'at', idProcedimiento: { idProcedimiento: 'pr1' }, nombre: 'Atención', idRol: { idRol: 'med' } };
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
   const datos = { tipo_documento: [tipo], 'documento/buscar': { idPersona: paciente.idPersona }, 'persona_rol/persona/persona': [paciente, empleado], consulta: [consulta], documento: [], consulta_procedimiento: [procedimiento], consulta_procedimiento_paso: [], procedimiento_paso_secuencia: [], procedimiento_paso: [destino] };
   if (path === 'consulta/estados') return estadosFixture(url, [consulta]);
   if (path === 'consulta/resumen') return respuesta(dashboardFixture());
   if (path === 'consulta/c1') return respuesta(consulta);
   if (!(path in datos)) throw new Error('Petición no simulada: ' + path);
   return respuestaRelacionesFixture(url, datos[path]);
  });
 });
 teardown(() => { fixture.replaceChildren(); sandbox.restore(); for (const [clave, valor] of [['sesionPersona',sesionPrevia],['sesionPersonaRol',contextoPrevio]]) { if(valor === null) sessionStorage.removeItem(clave); else sessionStorage.setItem(clave,valor); } window.location.hash = ''; });
 test('formato inválido no hace peticiones', async () => { try { await validarPaciente(tipo, 'mal'); assert.fail(); } catch(e) { assert.include(e.message, 'formato'); } assert.equal(fetchStub.callCount, 0); });
 test('documento inexistente es distinto a fallo REST', async () => { fetchStub.resolves(new Response('', { status: 404 })); try { await validarPaciente(tipo, '00000000-0'); assert.fail(); } catch(e) { assert.equal(e.message, 'Documento no registrado'); } });
 test('solo devuelve inscripciones del paciente, sin crear sesión', async () => { const d = await validarPaciente(tipo, '00000000-0'); assert.deepEqual(d.contextos, [paciente]); assert.isNull(sessionStorage.getItem('sesionPersona')); });
 test('paginación completa supera 1000 registros', async () => { fetchStub.callsFake(async url => { const first = Number(new URL(url).searchParams.get('first')); return respuesta(Array.from({length: Math.min(50, 1051-first)}, (_,i) => ({ id: String(first+i) }))); }); assert.lengthOf(await listarCompleto('consulta', 'id'), 1051); });
 test('página repetida y total incompleto fallan', async () => { fetchStub.callsFake(async () => respuesta(Array.from({ length: 50 }, (_,i) => ({ id: String(i) })))); try { await listarCompleto('consulta','id'); assert.fail(); } catch(e) { assert.include(e.message, 'repitió'); } fetchStub.callsFake(async () => new Response('[]', { headers: { 'Total-registros': '10' } })); try { await listarCompleto('consulta','id'); assert.fail(); } catch(e) { assert.include(e.message, 'incompleta'); } });
 test('findAll tampoco trunca las estadísticas a 1000', async () => { let first = 0; sandbox.stub(DefaultService.prototype, 'findRange').callsFake(async () => { const datos = Array.from({ length: Math.min(50, 1001-first) }, (_,i) => ({ id: first+i })); first += datos.length; return { datos }; }); assert.lengthOf(await new DefaultService().findAll(), 1001); });
 test('buscar trae las citas de todas las clínicas inscritas sin incluir otras personas', async () => {
  const norte = {...paciente, idPersonaRol:'pac-norte', idClinica:{idClinica:'norte',nombre:'Norte'}};
  fetchStub.callsFake(async url => new URL(url).pathname.endsWith('/consulta')
   ? respuesta([consulta, {...consulta,idConsulta:'c2',idPersonaRol:norte}, {...consulta,idConsulta:'ajena',idPersonaRol:{...paciente,idPersonaRol:'otro'}}, {...consulta,idConsulta:'clinica-ajena',idPersonaRol:{...paciente,idClinica:{idClinica:'ajena'}}}])
   : respuestaRelacionesFixture(url, [procedimiento]));
  const citas = await buscarCitas([paciente,norte]);
  assert.sameMembers(citas.map(c=>c.idConsulta),['c1','c2']);
  assert.equal(citas[0].idPersonaRol.idClinica.nombre,'Central');
 });
 test('fechas opcionales filtran en memoria con límites inclusivos', () => {
  const citas = [consulta,{...consulta,idConsulta:'siguiente',fechaInicio:'2026-11-13T00:00:00-06:00'},{...consulta,idConsulta:'sin-fecha',fechaInicio:null}];
  assert.deepEqual(filtrarCitas(citas),citas);
  assert.deepEqual(filtrarCitas(citas,'2026-11-12','2026-11-12').map(c=>c.idConsulta),['c1']);
  assert.deepEqual(filtrarCitas(citas,'2026-11-13').map(c=>c.idConsulta),['siguiente']);
  assert.deepEqual(filtrarCitas(citas,'','2026-11-12').map(c=>c.idConsulta),['c1']);
  assert.throws(()=>filtrarCitas(citas,'2026-02-30'));
  assert.throws(()=>filtrarCitas(citas,'2026-11-13','2026-11-12'));
  assert.equal(fetchStub.callCount,0);
 });
 test('sin inscripción válida no consulta y conserva la validación estricta de rangos de HU3', async () => {
  assert.throws(()=>validarRango('2026-02-30','2026-03-01'));
  assert.throws(()=>validarRango('2026-11-13','2026-11-12'));
  let error; try { await buscarCitas([empleado]); } catch(e) { error=e; }
  assert.include(error.message,'inscripciones'); assert.equal(fetchStub.callCount,0);
 });
 test('la expresión regular depende del tipo, sin imponer una máscara común', () => {
  validarFormatoDocumento(tipo,'00000000-0');
  assert.throws(()=>validarFormatoDocumento(tipo,'AB1234'));
  validarFormatoDocumento({...tipo,expresionRegular:'[A-Z]{2}[0-9]{4}'},'AB1234');
  assert.throws(()=>validarFormatoDocumento({...tipo,expresionRegular:'['},'AB1234'));
 });
 test('días de negocio independientes de zona del navegador', () => { assert.equal(diaAgenda('2026-11-13T05:59:59Z'),'2026-11-12'); assert.equal(diaAgenda('2026-11-13T06:00:00Z'),'2026-11-13'); });
 test('PDF rechaza HTML, 404 y archivos vacíos', async () => { for (const response of [new Response('<html/>'), new Response('',{status:404}),new Response('',{headers:{'Content-Type':'application/pdf'}})]) { fetchStub.resolves(response); let fallo=false; try { await ticketPDF('c1'); } catch { fallo=true; } assert.isTrue(fallo); } });
 test('PDF conserva binario y Accept', async () => { fetchStub.resolves(new Response('%PDF-1.4', { headers:{'Content-Type':'application/pdf'} })); assert.equal((await ticketPDF('c1')).type,'application/pdf'); assert.equal(fetchStub.firstCall.args[1].headers.Accept,'application/pdf'); });
 test('HU1 descarta validación antigua al cambiar documento', async () => { const vista=document.createElement('galeno-citas'); fixture.append(vista); await settle(); vista.campo('tipo').value='dui'; vista.campo('tipo').dispatchEvent(new Event('input',{bubbles:true})); vista.campo('numero').value='00000000-0'; vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true})); let resolver; fetchStub.callsFake(()=>new Promise(r=>resolver=r)); const pendiente=vista.buscar(); vista.campo('numero').value='nuevo'; vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true})); fetchStub.resolves(respuesta([paciente])); resolver(respuesta({ idPersona: paciente.idPersona })); await pendiente; assert.lengthOf(vista.citas,0); assert.isTrue(vista.querySelector('[data-buscar]').disabled); });
 test('HU1 no actualiza catálogo después de desmontar', async () => { let resolver; fetchStub.callsFake(()=>new Promise(r=>resolver=r)); const vista=document.createElement('galeno-citas'); fixture.append(vista); vista.remove(); resolver(respuesta([tipo])); await settle(); assert.isTrue(vista.campo('tipo').disabled); });
 test('agenda cruza ramas por secuencia, no por fecha', async () => {
  const segundo = { ...origen, idProcedimientoPaso:'lab', nombre:'Laboratorio' };
  const rutas = { consulta:[consulta],consulta_procedimiento:[procedimiento],consulta_procedimiento_paso:[origen,segundo].map((d,i)=>({idConsultaProcedimientoPaso:'e'+i,idConsultaProcedimiento:procedimiento,idProcedimientoPaso:d,estado:'ESTADO_REAL',valor:'<img src=x onerror=alert(1)>',idPersonaRol:empleado})),procedimiento_paso_secuencia:[origen,segundo].map((d,i)=>({idProcedimientoPasoSecuencia:'s'+i,idProcedimientoPaso:d,idProcedimientoPasoReferencia:destino,tipoSecuencia:'REAL'})), procedimiento_paso:[origen,segundo,destino] };
  fetchStub.callsFake(async url=>respuestaRelacionesFixture(url, rutas[new URL(url).pathname.split('/resources/v1/')[1]]));
  const lista=await cargarAgenda(empleado,'2026-11-12','2026-11-12'); assert.lengthOf(lista[0].procedimientos[0].pasosPrevios,2); assert.lengthOf(lista[0].procedimientos[0].pasos, 3);
  const vista=document.createElement('galeno-agenda'); vista.usuario=empleado; fixture.append(vista); await vista.cargar();
  const arbol = vista.querySelector('galeno-tree'); await arbol.expandAll();
  assert.deepEqual(arbol.view.map(n => n.row.nombre), ['General', 'Triaje -responsable', 'Atención', 'Laboratorio -responsable', 'Atención']);
  assert.deepEqual(arbol.view.map(n => n.level), [1, 2, 3, 2, 3]);
  assert.isNull(vista.querySelector('img,pre,galeno-tree-table,table'));
  assert.notInclude(arbol.list.textContent, 'ESTADO_REAL'); assert.notInclude(arbol.list.textContent, 'Registro:');
  const tarjeta = vista.querySelector('tarjeta-simple'); assert.exists(tarjeta);
  assert.equal(arbol.slot, 'contenido'); assert.equal(tarjeta.querySelector('[data-consulta]').slot, 'pie');
  let ruta; vista.addEventListener('galeno-navegar', e=>ruta=e.detail.ruta); vista.querySelector('[data-consulta]').click(); assert.equal(ruta,'/atencion/c1');
 });
 test('dashboard muestra procedimientos y pasos como árbol mínimo desplegable', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const arbol = vista.querySelector('galeno-tree');
  assert.exists(arbol, vista.textContent); assert.equal(arbol.list.getAttribute('role'), 'tree');
  assert.deepEqual(arbol.view.map(n => n.row.nombre), ['General']); assert.isNull(arbol.search);
  const toggle = arbol.list.querySelector('[data-command=toggle]');
  assert.notEqual(getComputedStyle(toggle).display, 'none');
  toggle.click(); assert.deepEqual(arbol.view.map(n => n.row.nombre), ['General', 'Atención']);
  assert.equal(arbol.view[1].level, 2);
  arbol.list.querySelector('[data-command=toggle]').click(); assert.lengthOf(arbol.view, 1);
  for (const texto of ['Pasos de tu rol', 'Registros de pasos anteriores', 'Dependencias', 'Sin registro', 'Inicio:', 'Estado']) assert.notInclude(arbol.list.textContent, texto);
 });
 test('la marca responsable exige asignación al contexto actual y no solo compartir rol', () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado;
  const registro = responsable => ({ idPersonaRol: responsable, estado: 'PENDIENTE', idProcedimientoPaso: destino });
  const delRol = [{ ...destino, registros: [registro(empleado)] },
   { idProcedimientoPaso: 'otro', nombre: 'Otro empleado', registros: [registro({ ...empleado, idPersonaRol: 'otro' })] },
   { idProcedimientoPaso: 'libre', nombre: 'Sin asignación', registros: [] },
   { idProcedimientoPaso: 'invalidado', nombre: 'Invalidado', registros: [{ ...registro(empleado), estado: ' INVALIDO ' }] }];
  const p = { pasosDelRol: delRol, pasosPrevios: [registro(empleado)] };
  assert.deepEqual(vista.datosProcedimientos([p])[0].children.map(n => n.nombre), ['Atención -responsable', 'Otro empleado', 'Sin asignación', 'Invalidado']);
  vista.usuario = null; assert.isFalse(vista.datosProcedimientos([p])[0].children.some(n => n.nombre.endsWith('-responsable')));
 });
 test('secuencia organiza cadena y bifurcaciones aunque los datos lleguen desordenados', () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado;
  const paso = (id, nombre, propio = false) => ({ idProcedimientoPaso: id, nombre,
   registros: propio ? [{ estado: 'PENDIENTE', idPersonaRol: empleado }] : [] });
  const a = paso('a', 'Inicio'), b = paso('b', 'Evaluación', true), c = paso('c', 'Salida'), d = paso('d', 'Alternativa');
  const enlace = (origen, destino) => ({ idProcedimientoPaso: origen, idProcedimientoPasoReferencia: destino });
  const p = { pasos: [c, d, b, a], pasosDelRol: [b], pasosPrevios: [], secuencias: [enlace(b, c), enlace(a, b), enlace(a, d), enlace(a, b)] };
  const raiz = vista.datosProcedimientos([p])[0].children[0];
  assert.equal(raiz.nombre, 'Inicio'); assert.deepEqual(raiz.children.map(n => n.nombre), ['Evaluación -responsable', 'Alternativa']);
  assert.equal(raiz.children[0].children[0].nombre, 'Salida');
  p.secuencias.push(enlace(c, a)); assert.throws(() => vista.datosProcedimientos([p]), /ciclo/);
  p.secuencias = [enlace(a, { idProcedimientoPaso: 'desconocido' })]; assert.throws(() => vista.datosProcedimientos([p]), /desconocidos/);
 });
 test('convergencias conservan los siguientes pasos bajo ambos predecesores', () => {
  const vista = document.createElement('galeno-agenda');
  const pasos = ['a', 'b', 'c', 'd', 'e'].map(id => ({ idProcedimientoPaso: id, nombre: id, registros: [] }));
  const porId = new Map(pasos.map(p => [p.idProcedimientoPaso, p]));
  const secuencias = [['a','b'], ['a','c'], ['b','d'], ['c','d'], ['d','e']].map(([a,b]) => ({idProcedimientoPaso:porId.get(a),idProcedimientoPasoReferencia:porId.get(b)}));
  const [procedimiento] = vista.datosProcedimientos([{ pasos, pasosDelRol: [], pasosPrevios: [], secuencias }]);
  const [b,c] = procedimiento.children[0].children;
  assert.equal(b.children[0].children[0].nombre, 'e'); assert.equal(c.children[0].children[0].nombre, 'e');
  assert.notEqual(b.children[0].id, c.children[0].id);
 });
 test('cada procedimiento conserva su secuencia y asignación independientes', () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado;
  const paso = { ...destino, registros: [{ estado: 'PENDIENTE', idPersonaRol: empleado }] };
  const primero = { pasosDelRol: [paso], pasosPrevios: [], secuencias: [] };
  const segundo = { ...primero, pasosDelRol: [{ ...paso, registros: [] }] };
  const nodos = vista.datosProcedimientos([primero, segundo]);
  assert.equal(nodos[0].children[0].nombre, 'Atención -responsable');
  assert.equal(nodos[1].children[0].nombre, 'Atención'); assert.notEqual(nodos[0].children[0].id, nodos[1].children[0].id);
 });
 test('expansión inicial abre solo antecesores de asignaciones propias', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const paso = (id, nombre, responsable) => ({ idProcedimientoPaso: id, nombre,
   registros: responsable ? [{ estado: 'PENDIENTE', idPersonaRol: responsable }] : [] });
  const a = paso('a', 'Inicio'), b = paso('b', 'Mi paso', empleado), c = paso('c', 'Después de mi paso'),
   d = paso('d', 'Rama ajena'), e = paso('e', 'Paso ajeno', { ...empleado, idPersonaRol: 'otro' });
  const enlace = (a,b) => ({ idProcedimientoPaso: a, idProcedimientoPasoReferencia: b });
  const p = { idProcedimiento: { nombre: 'Con asignaciones' }, pasos: [a,b,c,d,e], pasosDelRol: [b], pasosPrevios: [],
   secuencias: [enlace(a,b), enlace(b,c), enlace(a,d), enlace(d,e)] };
  const sinAsignaciones = { ...p, idProcedimiento: { nombre: 'Sin asignaciones' }, pasos: [a,d,e], pasosDelRol: [], secuencias: [enlace(a,d), enlace(d,e)] };
  vista.destruirArboles(); vista.montarConsultas([{ ...consulta, procedimientos: [p, sinAsignaciones] }]);
  const arbol = vista.querySelector('galeno-tree');
  assert.deepEqual(arbol.view.map(n => n.row.nombre), ['Con asignaciones', 'Inicio', 'Mi paso -responsable', 'Rama ajena', 'Sin asignaciones']);
  const propio = [...arbol.nodes.values()].find(n => n.row.nombre === 'Mi paso -responsable');
  const ajeno = [...arbol.nodes.values()].find(n => n.row.nombre === 'Rama ajena');
  assert.isFalse(arbol.expanded.has(propio.id)); assert.isFalse(arbol.expanded.has(ajeno.id));
  await arbol.expandNode(ajeno.id); assert.include(arbol.view.map(n => n.row.nombre), 'Paso ajeno');
  arbol.refresh(); assert.isTrue(arbol.expanded.has(ajeno.id));
 });
 test('expansión reconoce todas las ocurrencias propias en convergencias sin depender del texto', () => {
  const vista = document.createElement('galeno-agenda');
  const data = [{ id: 'p', children: [
   { id: 'a', children: [{ id: 'propio-a', responsable: true }] },
   { id: 'b', children: [{ id: 'propio-b', responsable: true }] },
   { id: 'c', nombre: 'Nombre -responsable', children: [{ id: 'ajeno' }] }
  ] }];
  assert.sameMembers(vista.expansionAsignada(data), ['p', 'a', 'b']);
  assert.deepEqual(vista.expansionAsignada([{ id: 'vacio', children: [] }]), []);
 });
 test('clic y Enter en paso propio abren su ejecución; chevrons y ajenos no navegan', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const propio = { ...destino, registros: [{ idConsultaProcedimientoPaso: 'ejecucion/propia', idPersonaRol: empleado, estado: ' FINALIZADO ' }] };
  const ajeno = { ...destino, idProcedimientoPaso: 'otro', nombre: 'Ajeno', registros: [{ idConsultaProcedimientoPaso: 'ajena', idPersonaRol: { ...empleado, idPersonaRol: 'otro' }, estado: 'COMPLETADO' }] };
  const p = { pasosDelRol: [propio, ajeno], pasosPrevios: [], secuencias: [] };
  vista.destruirArboles(); vista.montarConsultas([{ ...consulta, procedimientos: [p] }]);
  const arbol = vista.querySelector('galeno-tree'), navegar = sandbox.spy(); vista.addEventListener('galeno-navegar', navegar);
  arbol.list.querySelector('[data-command=toggle]').click(); assert.equal(navegar.callCount, 0);
  await arbol.expandNode(arbol.roots[0].id);
  const nodo = [...arbol.nodes.values()].find(n => n.row.responsable);
  const item = arbol.items.get(nodo.id); assert.include(item.querySelector('.agenda__paso-estado').textContent, 'Completado');
  item.querySelector('.tree__label').click(); assert.equal(navegar.firstCall.args[0].detail.ruta, '/atencion/c1/paso/ejecucion%2Fpropia');
  item.focus(); item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert.equal(navegar.callCount, 2);
  const otro = [...arbol.nodes.values()].find(n => n.row.nombre === 'Ajeno'); arbol.items.get(otro.id).querySelector('.tree__label').click(); assert.equal(navegar.callCount, 2);
  assert.include(arbol.items.get(otro.id).textContent, 'Completado');
 });
 test('agenda destruye árboles al filtrar, recargar y desconectar', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const anterior = vista.querySelector('galeno-tree'); await vista.cargar();
  assert.isTrue(anterior.destroyed);
  const actual = vista.querySelector('galeno-tree');
  vista.querySelector('[name=desde]').dispatchEvent(new Event('input', { bubbles: true }));
  assert.isTrue(actual.destroyed); assert.isNull(vista.querySelector('galeno-tree'));
  await vista.cargar(); const ultima = vista.querySelector('galeno-tree'); vista.remove(); assert.isTrue(ultima.destroyed);
 });
 test('Hoy restablece solo fechas y navegación no se activa al expandir', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const navegar = sandbox.spy(); vista.addEventListener('galeno-navegar', navegar);
  const tabla = vista.querySelector('galeno-tree'); tabla.list.querySelector('.tree__label').click();
  assert.equal(navegar.callCount, 0);
  assert.isNull(tabla.search);
  const cargar = sandbox.stub(vista, 'cargar'); vista.querySelector('[data-hoy]').click();
  assert.isNull(tabla.search); assert.equal(cargar.callCount, 1);
  assert.equal(vista.querySelector('[name=desde]').value, diaAgenda());
 });
 test('consultas usan tarjetas simples independientes con navegación solo en el botón', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const [primera] = await cargarAgenda(empleado, '2026-11-12', '2026-11-12');
  vista.destruirArboles(); vista.montarConsultas([primera, { ...primera, idConsulta: 'otra/consulta' }]);
  const tarjetas = vista.querySelectorAll('[data-lista] > tarjeta-simple'); assert.lengthOf(tarjetas, 2);
  assert.lengthOf(tarjetas[0].shadowRoot.querySelectorAll('slot[name=contenido]'), 1);
  assert.equal(tarjetas[0].querySelector('.agenda__paciente-nombre').textContent, 'Ana');
  const [a, b] = vista.querySelectorAll('galeno-tree'); a.setData([]);
  assert.include(a.status.textContent, 'No hay nodos'); assert.lengthOf(b.view, 1);
  const navegar = sandbox.spy(); vista.addEventListener('galeno-navegar', navegar);
  b.list.querySelector('.tree__label').click(); assert.equal(navegar.callCount, 0);
  tarjetas[1].querySelector('[data-consulta]').click();
  assert.equal(navegar.firstCall.args[0].detail.ruta, '/atencion/otra%2Fconsulta');
 });
 test('header muestra nombre, edad y un documento disponible sin duplicar peticiones por paciente', async () => {
  const documento = { idDocumento: 'doc-1', idPersona: paciente.idPersona, valor: ' 00000000-0 ', idTipoDocumento: { nombre: 'DUI' } };
  fetchStub.callsFake(async url => {
   if (new URL(url).pathname.endsWith('/documento')) return respuesta([documento]);
   const path = new URL(url).pathname.split('/resources/v1/')[1];
   const datos = { consulta: [consulta], consulta_procedimiento: [procedimiento], consulta_procedimiento_paso: [], procedimiento_paso: [destino], procedimiento_paso_secuencia: [] };
   return respuestaRelacionesFixture(url, datos[path] || []);
  });
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  await settle(); const peticiones = fetchStub.getCalls().filter(c => new URL(c.args[0]).pathname.endsWith('/documento')).length;
  const [base] = await cargarAgenda(empleado, '2026-11-12', '2026-11-12');
  const c = { ...base, idPersonaRol: { ...paciente, idPersona: { ...paciente.idPersona, nombres: '<b>Ana</b>', apellidos: 'López', fechaNacimiento: '2000-01-01' } } };
  vista.destruirArboles(); vista.montarConsultas([c, { ...c, idConsulta: 'otra' }]); await settle();
  const header = vista.querySelector('[slot=titulo]');
  assert.equal(header.children[0].textContent, '<b>Ana</b> López'); assert.isNull(header.querySelector('b'));
  assert.equal(header.children[1].textContent, `${new Date().getFullYear() - 2000} años`);
  assert.equal(header.children[2].textContent, 'DUI: 00000000-0'); assert.isFalse(header.children[2].hidden);
  const fecha = header.querySelector('.agenda__consulta-fecha'); assert.exists(fecha);
  assert.include(fecha.textContent, '2026'); assert.equal(getComputedStyle(fecha).textAlign, 'right');
  assert.equal(getComputedStyle(fecha).gridColumnStart, '2');
  const dia = fecha.querySelector('.agenda__consulta-dia'), hora = fecha.querySelector('.agenda__consulta-hora');
  assert.match(dia.textContent, /12.*nov.*2026/i); assert.match(hora.textContent, /(?:11|23):59/);
  assert.isAtLeast(hora.getBoundingClientRect().top, dia.getBoundingClientRect().bottom);
  assert.equal(getComputedStyle(dia).whiteSpace, 'nowrap'); assert.equal(getComputedStyle(hora).whiteSpace, 'nowrap');
  assert.closeTo(dia.getBoundingClientRect().right, hora.getBoundingClientRect().right, 1);
  assert.isNull(vista.querySelector('tarjeta-simple > p[slot=contenido]'));
  assert.equal(fetchStub.getCalls().filter(c => new URL(c.args[0]).pathname.endsWith('/documento')).length - peticiones, 1);
 });
 test('header maneja edad y documento ausentes y descarta respuestas al retirar la tarjeta', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar(); await settle();
  const header = vista.querySelector('[slot=titulo]'); assert.equal(header.children[1].textContent, 'Edad no disponible'); assert.isTrue(header.children[2].hidden);
  let resolver; fetchStub.callsFake(() => new Promise(resolve => { resolver = resolve; }));
  const linea = header.children[2]; const pendiente = vista.cargarDocumento(vista.querySelector('tarjeta-simple'), linea, 'persona', new Map());
  vista.querySelector('[name=desde]').dispatchEvent(new Event('input', { bubbles: true }));
  resolver(respuesta([{ idDocumento: 'doc', idPersona: paciente.idPersona, valor: 'No mostrar' }])); await pendiente;
  assert.isTrue(linea.hidden); assert.equal(linea.textContent, '');
 });
 test('un error de documento no bloquea la tarjeta y sin persona no consulta', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar(); await settle();
  const tarjeta = vista.querySelector('tarjeta-simple'), linea = tarjeta.querySelector('.agenda__paciente-documento');
  fetchStub.rejects(new Error('Sin conexión'));
  await vista.cargarDocumento(tarjeta, linea, 'persona', new Map());
  assert.include(linea.textContent, 'No se pudo cargar'); assert.exists(tarjeta.querySelector('galeno-tree')); assert.exists(tarjeta.querySelector('[data-consulta]'));
  const llamadas = fetchStub.callCount; await vista.cargarDocumento(tarjeta, linea, null, new Map()); assert.equal(fetchStub.callCount, llamadas);
 });
 test('header omite la hora cuando la consulta no tiene fecha válida', async () => {
  const vista = document.createElement('galeno-agenda'); vista.usuario = empleado; fixture.append(vista); await vista.cargar();
  const [base] = await cargarAgenda(empleado, '2026-11-12', '2026-11-12');
  vista.destruirArboles(); vista.montarConsultas([{ ...base, fechaInicio: null }, { ...base, fechaInicio: 'inválida' }]);
  const fechas = vista.querySelectorAll('.agenda__consulta-fecha');
  assert.equal(fechas[0].textContent, 'Sin fecha'); assert.equal(fechas[1].textContent, 'Fecha no válida');
  assert.isTrue([...fechas].every(fecha => fecha.querySelector('.agenda__consulta-hora').hidden));
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
 test('un fallo REST nunca se convierte en cero citas', async () => { fetchStub.resolves(new Response('Error interno',{status:500})); let error; try { await buscarCitas([paciente]); } catch(e) {error=e;} assert.include(error.message,'500'); });
 test('HU1 descarta citas tardías al cambiar documento durante una búsqueda', async () => {
  const vista=document.createElement('galeno-citas');fixture.append(vista);await settle();
  vista.campo('tipo').value='dui';vista.campo('tipo').dispatchEvent(new Event('input',{bubbles:true}));
  vista.campo('numero').value='00000000-0';vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true}));
  let resolver;
  fetchStub.callsFake(async url => {
   const path=new URL(url).pathname;
   if(path.endsWith('/documento/buscar')) return respuesta({idPersona:paciente.idPersona});
   if(path.endsWith('/persona_rol/persona/persona')) return respuesta([paciente]);
   if(path.endsWith('/consulta')) return new Promise(r=>resolver=r);
   return respuestaRelacionesFixture(url, [procedimiento]);
  });
  const pendiente=vista.buscar();await settle();
  vista.campo('numero').value='nuevo';vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true}));
  resolver(respuesta([consulta]));await pendiente;
  assert.isNull(vista.querySelector('galeno-tarjeta-cita'));
  assert.isTrue(vista.querySelector('[data-buscar]').disabled);
  assert.isTrue(vista.querySelector('[data-resultados]').hidden);
 });
 test('HU1 muestra fechas solo después de buscar y filtra sin nuevas peticiones', async () => {
  const vista=document.createElement('galeno-citas');fixture.append(vista);await settle();
  assert.isNull(vista.campo('clinica'));
  assert.isNull(vista.querySelector('[data-validar]'));
  assert.isTrue(vista.querySelector('[data-resultados]').hidden);
  vista.campo('tipo').value='dui';vista.campo('tipo').dispatchEvent(new Event('input',{bubbles:true}));
  vista.campo('numero').value='mal';vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true}));
  assert.isTrue(vista.querySelector('[data-buscar]').disabled);
  assert.equal(vista.campo('numero').getAttribute('aria-invalid'),'true');
  vista.campo('numero').value='00000000-0';vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true}));
  assert.equal(vista.campo('numero').getAttribute('aria-invalid'),'false');
  await vista.buscar();
  assert.isFalse(vista.querySelector('[data-resultados]').hidden);
  assert.equal(vista.campo('desde').value,'');assert.equal(vista.campo('hasta').value,'');
  assert.lengthOf(vista.querySelectorAll('galeno-tarjeta-cita'),1);
  assert.include(vista.querySelector('galeno-tarjeta-cita').textContent,'Central');
  assert.isNull(vista.querySelector('galeno-tarjeta-cita').closest('.agenda-panel'));
  assert.equal(vista.campo('numero').placeholder,'Ej.: 00000000-0');
  const peticiones=fetchStub.callCount;
  vista.campo('desde').value='2026-11-13';vista.filtrar();
  assert.lengthOf(vista.querySelectorAll('galeno-tarjeta-cita'),0);
  vista.querySelector('[data-limpiar]').click();
  assert.lengthOf(vista.querySelectorAll('galeno-tarjeta-cita'),1);
  assert.equal(fetchStub.callCount,peticiones);
 });
 test('ejemplos de documento coinciden con su expresión regular', () => {
  assert.equal(ejemploDocumento(tipo),'00000000-0');
  const pasaporte={expresionRegular:'^[A-Z]{1}[0-9]{8}$'};
  assert.equal(ejemploDocumento(pasaporte),'A00000000');
  assert.equal(ejemploDocumento({expresionRegular:'['}),'');
 });
 test('una búsqueda informa cuando no hay citas asociadas', async () => {
  const vista=document.createElement('galeno-citas');fixture.append(vista);await settle();
  vista.campo('tipo').value='dui';vista.campo('tipo').dispatchEvent(new Event('input',{bubbles:true}));
  vista.campo('numero').value='00000000-0';vista.campo('numero').dispatchEvent(new Event('input',{bubbles:true}));
  fetchStub.callsFake(async url => {
   const path=new URL(url).pathname;
   if(path.endsWith('/documento/buscar')) return respuesta({idPersona:paciente.idPersona});
   if(path.endsWith('/persona_rol/persona/persona')) return respuesta([paciente]);
   return respuesta([]);
  });
  await vista.buscar();
  assert.include(vista.querySelector('[data-resumen]').textContent,'No se encontraron citas asociadas al documento');
  assert.isTrue(vista.querySelector('[data-lista]').hidden);
 });
 test('consulta PDF habilitada y error permite reintentar', async () => { const tarjeta=document.createElement('galeno-tarjeta-cita');tarjeta.cita={...consulta,procedimientos:[procedimiento]};fixture.append(tarjeta);assert.isFalse(tarjeta.querySelector('button').disabled);assert.include(tarjeta.querySelector('button').textContent,'consulta PDF');fetchStub.resolves(new Response('',{status:500}));await tarjeta.descargar();assert.include(tarjeta.querySelector('[role="status"]').textContent,'500');assert.isFalse(tarjeta.querySelector('button').disabled);assert.equal(fetchStub.callCount,1); });
 test('descarga revoca Object URL y no duplica envíos', async () => {const reloj=sandbox.useFakeTimers();const crear=sandbox.stub(URL,'createObjectURL').returns('blob:test');const revocar=sandbox.stub(URL,'revokeObjectURL');sandbox.stub(HTMLAnchorElement.prototype,'click');let resolver;fetchStub.callsFake(()=>new Promise(r=>resolver=r));const tarjeta=document.createElement('galeno-tarjeta-cita');tarjeta.cita={...consulta,procedimientos:[]};fixture.append(tarjeta);tarjeta.querySelector('button').disabled=false;const descarga=tarjeta.descargar();await tarjeta.descargar();assert.equal(fetchStub.callCount,1);resolver(new Response('%PDF',{headers:{'Content-Type':'application/pdf'}}));await descarga;assert.equal(crear.callCount,1);await reloj.tickAsync(1000);sinon.assert.calledWith(revocar,'blob:test');});
 test('agenda descarta carga tardía al desmontar', async () => {let resolver;fetchStub.callsFake(()=>new Promise(r=>resolver=r));const vista=document.createElement('galeno-agenda');vista.usuario=empleado;fixture.append(vista);vista.remove();resolver(respuesta([]));await settle();assert.include(vista.textContent,'Cargando agenda');});

});
mocha.run(fallos=>{ globalThis.__resultadoMocha={fallos}; });
