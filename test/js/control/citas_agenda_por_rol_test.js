import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import { buscarCitas, listarConsultasDelRol, filtrarConsultasPorRol, cargarAgenda } from '../../../src/js/control/agenda_service.js';
mocha.setup('tdd');
suite('Paso 3: citas y agenda por rol paginadas',()=>{
    let sandbox,fetchStub;
    const patient={idPersonaRol:'paciente',idPersona:{idPersona:'persona /&'},idRol:{nombre:'Paciente'},idClinica:{idClinica:'clinica'}};
    const worker={idPersonaRol:'empleado',idRol:{idRol:'doctor',nombre:'Doctor'},idClinica:{idClinica:'clinica'}};
    const consulta=id=>({idConsulta:id,idPersonaRol:patient,fechaInicio:'2026-01-01T12:00:00Z'});
    const response=(rows,total=rows.length)=>new Response(JSON.stringify(rows),{headers:{'Total-registros':String(total)}});
    setup(()=>{sandbox=sinon.createSandbox();fetchStub=sandbox.stub(window,'fetch');});
    teardown(()=>sandbox.restore());
    async function rejects(fn,text){let error;try{await fn();}catch(e){error=e;}assert.instanceOf(error,Error);assert.include(error.message,text);}
    test('124 citas conservan persona en todas las páginas y no solicitan consulta global',async()=>{
        const rows=Array.from({length:124},(_,i)=>consulta(String(i)));rows[123].fechaInicio=null;
        fetchStub.callsFake(async raw=>{const url=new URL(raw);if(url.pathname.endsWith('/consulta')){
            assert.equal(url.searchParams.get('persona'),patient.idPersona.idPersona);const first=Number(url.searchParams.get('first'));return response(rows.slice(first,first+50),124);
        }assert.isTrue(url.pathname.endsWith('/consulta_procedimiento'));return response([]);});
        const rowsRead=await buscarCitas([patient]);assert.lengthOf(rowsRead,124);assert.isNull(rowsRead[123].fechaInicio);
        assert.deepEqual(fetchStub.getCalls().filter(c=>new URL(c.args[0]).pathname.endsWith('/consulta')).map(c=>new URL(c.args[0]).searchParams.get('first')),['0','50','100']);
    });
    test('124 citas con rango conservan persona y fechas en cada página',async()=>{
        const rows=Array.from({length:124},(_,i)=>consulta(String(i)));
        fetchStub.callsFake(async raw=>{const url=new URL(raw);if(!url.pathname.endsWith('/consulta')) return response([]);
            assert.equal(url.searchParams.get('persona'),patient.idPersona.idPersona);
            assert.equal(url.searchParams.get('desde'),'2026-01-01');assert.equal(url.searchParams.get('hasta'),'2026-01-01');
            const first=Number(url.searchParams.get('first'));return response(rows.slice(first,first+50),124);
        });
        assert.lengthOf(await buscarCitas([patient],'2026-01-01','2026-01-01'),124);
        assert.equal(fetchStub.getCalls().filter(c=>new URL(c.args[0]).pathname.endsWith('/consulta')).length,3);
    });
    test('fechas opcionales se envían sin inventar el límite ausente',async()=>{
        fetchStub.callsFake(async()=>response([]));
        for(const rango of [['2026-01-01',''],['','2026-01-01'],['','']]){
            await buscarCitas([patient],...rango);const url=new URL(fetchStub.lastCall.args[0]);
            assert.equal(url.searchParams.get('desde'),rango[0]||null);assert.equal(url.searchParams.get('hasta'),rango[1]||null);
        }
    });
    test('rango de citas inválido no inicia ninguna petición',async()=>{
        await rejects(()=>buscarCitas([patient],'2026-02-30',''),'fechas');
        await rejects(()=>buscarCitas([patient],'2026-01-02','2026-01-01'),'Desde');sinon.assert.notCalled(fetchStub);
    });
    test('no recorta localmente ni descarga procedimientos fuera del rango devuelto',async()=>{
        fetchStub.callsFake(async raw=>{const url=new URL(raw);if(url.pathname.endsWith('/consulta')) return response([consulta('unica')]);
            assert.equal(url.searchParams.get('consultas'),'unica');return response([]);
        });
        assert.lengthOf(await buscarCitas([patient],'2026-03-01',''),1);
    });
    test('citas de dos clínicas usan una consulta por persona, no una por inscripción',async()=>{
        const other={...patient,idPersonaRol:'otra-inscripcion',idClinica:{idClinica:'norte'}};
        fetchStub.callsFake(async raw=>new URL(raw).pathname.endsWith('/consulta')?response([consulta('a'),{...consulta('b'),idPersonaRol:other}]):response([]));
        assert.lengthOf(await buscarCitas([patient,other]),2);
        assert.equal(fetchStub.getCalls().filter(c=>new URL(c.args[0]).pathname.endsWith('/consulta')).length,1);
    });
    test('inscripciones mezcladas de personas distintas se rechazan antes de consultar',async()=>{
        await rejects(()=>buscarCitas([patient,{...patient,idPersonaRol:'ajena',idPersona:{idPersona:'otra'}}]),'misma persona');sinon.assert.notCalled(fetchStub);
    });
    test('123 consultas por rol conservan filtros y conteo en tres páginas',async()=>{
        const rows=Array.from({length:123},(_,i)=>consulta(String(i)));
        fetchStub.callsFake(async raw=>{const url=new URL(raw);assert.equal(url.searchParams.get('clinica'),'clinica');assert.equal(url.searchParams.get('rol'),'doctor');assert.isFalse(url.searchParams.has('persona'));
            const first=Number(url.searchParams.get('first'));return response(rows.slice(first,first+50),123);});
        assert.deepEqual(await listarConsultasDelRol(worker),rows);assert.equal(fetchStub.callCount,3);
        assert.isTrue(fetchStub.getCalls().every(c=>new URL(c.args[0]).pathname.endsWith('/consulta')));
    });
    test('envía días civiles sin convertirlos en instantes del navegador',async()=>{
        fetchStub.resolves(response([]));await listarConsultasDelRol(worker,'2026-01-01','2026-01-01');
        const url=new URL(fetchStub.firstCall.args[0]);assert.equal(url.searchParams.get('desde'),'2026-01-01');assert.equal(url.searchParams.get('hasta'),'2026-01-01');
    });
    test('contexto o rango inválido no inicia peticiones',async()=>{
        assert.deepEqual(await listarConsultasDelRol(null),[]);assert.deepEqual(await listarConsultasDelRol(patient),[]);
        await rejects(()=>listarConsultasDelRol(worker,'2026-02-30','2026-03-01'),'fechas');sinon.assert.notCalled(fetchStub);
    });
    test('la comprobación por UUID reutiliza consultas filtradas y conserva objetos originales',async()=>{
        const first=consulta('a'),second=consulta('b');fetchStub.resolves(response([second]));
        const result=await filtrarConsultasPorRol([first,second],worker);assert.lengthOf(result,1);assert.strictEqual(result[0],second);
        sinon.assert.calledOnce(fetchStub);assert.isTrue(new URL(fetchStub.firstCall.args[0]).pathname.endsWith('/consulta'));
    });
    test('agenda oculta una consulta del rol cuando todavía no existe ejecución asignada',async()=>{
        const c=consulta('a'),cp={idConsultaProcedimiento:'cp',idConsulta:c,idProcedimiento:{idProcedimiento:'proc'}};
        const def={idProcedimientoPaso:'paso',idRol:worker.idRol,idProcedimiento:{idProcedimiento:'proc'}};
        fetchStub.callsFake(async raw=>{const url=new URL(raw);const path=url.pathname.split('/resources/v1/')[1];
            const rows={consulta:[c],consulta_procedimiento:[cp],consulta_procedimiento_paso:[],procedimiento_paso_secuencia:[],procedimiento_paso:[def]};
            if(path==='consulta'){assert.equal(url.searchParams.get('rol'),'doctor');assert.equal(url.searchParams.get('desde'),'2026-01-01');}
            assert.property(rows,path);return response(rows[path]);});
        const agenda=await cargarAgenda(worker,'2026-01-01','2026-01-01');
        assert.deepEqual(agenda,[]);
    });
    test('agenda exige pendientes del contexto exacto y oculta completados o reasignados',async()=>{
        const c=consulta('a'),cp={idConsultaProcedimiento:'cp',idConsulta:c,idProcedimiento:{idProcedimiento:'proc'}};
        const def={idProcedimientoPaso:'paso',idRol:worker.idRol,idProcedimiento:{idProcedimiento:'proc'}};
        const registro={idConsultaProcedimientoPaso:'ejecucion',idConsultaProcedimiento:cp,idProcedimientoPaso:def,idPersonaRol:worker,estado:'PENDIENTE'};
        fetchStub.callsFake(async raw=>{
            const path=new URL(raw).pathname.split('/resources/v1/')[1];
            return response({consulta:[c],consulta_procedimiento:[cp],consulta_procedimiento_paso:[registro],procedimiento_paso:[def],procedimiento_paso_secuencia:[]}[path]);
        });
        for(const estado of ['PENDIENTE','EN_PROCESO']) {
            registro.estado=estado;assert.lengthOf(await cargarAgenda(worker,'2026-01-01','2026-01-01'),1);
        }
        for(const estado of ['COMPLETADO','FINALIZADO']) {
            registro.estado=estado;assert.deepEqual(await cargarAgenda(worker,'2026-01-01','2026-01-01'),[]);
        }
        registro.estado=' INVALIDO ';assert.deepEqual(await cargarAgenda(worker,'2026-01-01','2026-01-01'),[]);
        registro.estado='PENDIENTE';registro.idPersonaRol={...worker,idPersonaRol:'otro-contexto'};
        assert.deepEqual(await cargarAgenda(worker,'2026-01-01','2026-01-01'),[]);
        registro.idPersonaRol=null;assert.deepEqual(await cargarAgenda(worker,'2026-01-01','2026-01-01'),[]);
    });
    test('error o página incompleta impide devolver citas parciales',async()=>{
        fetchStub.resolves(new Response('',{status:500}));await rejects(()=>buscarCitas([patient]),'500');
        fetchStub.reset();fetchStub.onFirstCall().resolves(response(Array.from({length:50},(_,i)=>consulta(String(i))),51));fetchStub.onSecondCall().resolves(response([],51));
        await rejects(()=>buscarCitas([patient]),'incompleta');
    });
    test('error de la consulta por rol no se transforma en agenda vacía',async()=>{
        fetchStub.resolves(new Response('',{status:500}));await rejects(()=>listarConsultasDelRol(worker),'500');
    });
});
mocha.run();
